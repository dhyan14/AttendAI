from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid

from app.database import get_db
from app.models import AttendanceDispute, AttendanceRecord, AttendanceStatus, DisputeStatus, Student, Lecture, Subject, User
from app.api.deps import get_current_user, require_dept_admin

router = APIRouter()

# ─── Schemas ───────────────────────────────────────────────

class DisputeCreate(BaseModel):
    lecture_id: str
    reason: str


class DisputeResolve(BaseModel):
    status: str  # 'resolved' or 'rejected'
    admin_note: Optional[str] = None


class DisputeResponse(BaseModel):
    id: str
    student_id: str
    student_name: str
    roll_no: str
    lecture_id: str
    lecture_date: str
    subject_name: str
    reason: str
    status: str
    admin_note: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


# ─── Routes ────────────────────────────────────────────────

@router.get("/", response_model=List[DisputeResponse])
async def list_disputes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List disputes. If admin/faculty, lists all. If student, lists their own."""
    query = select(
        AttendanceDispute, 
        Student.name.label("student_name"),
        Student.roll_no.label("roll_no"),
        Lecture.date.label("lecture_date"),
        Subject.name.label("subject_name")
    ).join(
        Student, Student.id == AttendanceDispute.student_id
    ).join(
        Lecture, Lecture.id == AttendanceDispute.lecture_id
    ).join(
        Subject, Subject.id == Lecture.subject_id
    )

    if current_user.role.value == "student":
        # Get student profile
        student_res = await db.execute(select(Student).where(Student.user_id == current_user.id))
        student = student_res.scalar_one_or_none()
        if not student:
            return []
        query = query.where(AttendanceDispute.student_id == student.id)
    elif current_user.role.value == "dept_admin" or current_user.role.value == "org_admin" or current_user.role.value == "super_admin":
        # Admin can view all disputes in their org
        query = query.where(Student.dept_id.in_(
            select(Student.dept_id).where(Student.user_id == User.id).where(User.org_id == current_user.org_id)
        ))

    result = await db.execute(query.order_by(AttendanceDispute.created_at.desc()))
    rows = result.all()

    return [
        DisputeResponse(
            id=str(row.AttendanceDispute.id),
            student_id=str(row.AttendanceDispute.student_id),
            student_name=row.student_name,
            roll_no=row.roll_no,
            lecture_id=str(row.AttendanceDispute.lecture_id),
            lecture_date=row.lecture_date.strftime("%Y-%m-%d %H:%M"),
            subject_name=row.subject_name,
            reason=row.AttendanceDispute.reason,
            status=row.AttendanceDispute.status.value,
            admin_note=row.AttendanceDispute.admin_note,
            created_at=row.AttendanceDispute.created_at.strftime("%Y-%m-%d %H:%M")
        ) for row in rows
    ]


@router.post("/", response_model=DisputeResponse)
async def create_dispute(
    req: DisputeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Students call this to raise a dispute for an absent mark."""
    if current_user.role.value != "student":
        raise HTTPException(status_code=403, detail="Only students can raise disputes")

    student_res = await db.execute(select(Student).where(Student.user_id == current_user.id))
    student = student_res.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Verify lecture exists
    lecture_res = await db.execute(select(Lecture).where(Lecture.id == req.lecture_id))
    lecture = lecture_res.scalar_one_or_none()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")

    # Check if dispute already exists
    dup_res = await db.execute(
        select(AttendanceDispute).where(
            AttendanceDispute.student_id == student.id,
            AttendanceDispute.lecture_id == req.lecture_id
        )
    )
    if dup_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Dispute already raised for this lecture")

    dispute = AttendanceDispute(
        student_id=student.id,
        lecture_id=uuid.UUID(req.lecture_id),
        reason=req.reason,
        status=DisputeStatus.open
    )
    db.add(dispute)
    await db.commit()
    await db.refresh(dispute)

    # Fetch details for response
    subj_res = await db.execute(select(Subject).where(Subject.id == lecture.subject_id))
    subject = subj_res.scalar_one()

    return DisputeResponse(
        id=str(dispute.id),
        student_id=str(dispute.student_id),
        student_name=student.name,
        roll_no=student.roll_no,
        lecture_id=str(dispute.lecture_id),
        lecture_date=lecture.date.strftime("%Y-%m-%d %H:%M"),
        subject_name=subject.name,
        reason=dispute.reason,
        status=dispute.status.value,
        admin_note=dispute.admin_note,
        created_at=dispute.created_at.strftime("%Y-%m-%d %H:%M")
    )


@router.put("/{dispute_id}/resolve")
async def resolve_dispute(
    dispute_id: str,
    req: DisputeResolve,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_dept_admin)
):
    """Admins call this to approve or reject a dispute. Approving marks the student as present."""
    dispute_res = await db.execute(
        select(AttendanceDispute).where(AttendanceDispute.id == dispute_id)
    )
    dispute = dispute_res.scalar_one_or_none()
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")

    if dispute.status != DisputeStatus.open:
        raise HTTPException(status_code=400, detail="Dispute has already been resolved")

    if req.status not in ["resolved", "rejected"]:
        raise HTTPException(status_code=400, detail="Status must be 'resolved' or 'rejected'")

    dispute.status = DisputeStatus.resolved if req.status == "resolved" else DisputeStatus.rejected
    dispute.admin_note = req.admin_note
    dispute.resolved_by = current_user.id
    dispute.resolved_at = datetime.utcnow()

    # If approved (resolved), update the attendance record to 'present'
    if req.status == "resolved":
        att_res = await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.lecture_id == dispute.lecture_id,
                AttendanceRecord.student_id == dispute.student_id
            )
        )
        att_record = att_res.scalar_one_or_none()
        if att_record:
            att_record.status = AttendanceStatus.present
            att_record.source = "manual"
        else:
            # If no record was present (e.g. they weren't in the list), create a present record
            lecture_res = await db.execute(select(Lecture).where(Lecture.id == dispute.lecture_id))
            lecture = lecture_res.scalar_one()
            new_record = AttendanceRecord(
                lecture_id=dispute.lecture_id,
                student_id=dispute.student_id,
                subject_id=lecture.subject_id,
                status=AttendanceStatus.present,
                source="manual"
            )
            db.add(new_record)

    await db.commit()
    return {"message": f"Dispute successfully {req.status}"}
