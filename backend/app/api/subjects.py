from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sql_delete
from pydantic import BaseModel
from typing import List, Optional
import uuid

from app.database import get_db
from app.models import Subject, SubjectAssignment, Faculty, Department, User
from app.api.deps import get_current_user, require_dept_admin

router = APIRouter()

# ─── Schemas ───────────────────────────────────────────────

class SubjectCreate(BaseModel):
    name: str
    code: str
    dept_id: str
    semester: Optional[int] = None

class SubjectAssignRequest(BaseModel):
    subject_id: str
    faculty_id: str
    division: Optional[str] = None
    batch: Optional[str] = None
    semester: Optional[int] = None

class SubjectResponse(BaseModel):
    id: str
    name: str
    code: str
    dept_id: str
    semester: Optional[int]

    class Config:
        from_attributes = True


# ─── Routes ────────────────────────────────────────────────

@router.get("/", response_model=List[SubjectResponse])
async def list_subjects(
    dept_id: Optional[str] = Query(None),
    semester: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List subjects. Faculty sees only their assigned subjects; admins see all in their org."""

    # Faculty: return only subjects assigned to them
    if current_user.role.value == "faculty":
        fac_res = await db.execute(select(Faculty).where(Faculty.user_id == current_user.id))
        fac = fac_res.scalar_one_or_none()
        if not fac:
            return []
        assign_res = await db.execute(
            select(SubjectAssignment).where(SubjectAssignment.faculty_id == fac.id)
        )
        assignments = assign_res.scalars().all()
        subject_ids = [a.subject_id for a in assignments]
        if not subject_ids:
            return []
        query = select(Subject).where(Subject.id.in_(subject_ids))
        if semester:
            query = query.where(Subject.semester == semester)
        result = await db.execute(query.order_by(Subject.code))
        subjects = result.scalars().all()
        return [SubjectResponse(id=str(s.id), name=s.name, code=s.code, dept_id=str(s.dept_id), semester=s.semester) for s in subjects]

    # Admin / dept_admin / org_admin: return all subjects in their org/dept
    query = select(Subject)
    if dept_id:
        query = query.where(Subject.dept_id == dept_id)
    elif current_user.org_id:
        query = query.join(Department, Department.id == Subject.dept_id).where(Department.org_id == current_user.org_id)
    if semester:
        query = query.where(Subject.semester == semester)

    result = await db.execute(query.order_by(Subject.code))
    subjects = result.scalars().all()
    return [SubjectResponse(id=str(s.id), name=s.name, code=s.code, dept_id=str(s.dept_id), semester=s.semester) for s in subjects]


@router.post("/", response_model=SubjectResponse)
async def create_subject(
    data: SubjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_dept_admin),
):
    """Create a new subject in a department (dept_admin or above)."""
    try:
        dept_uuid = uuid.UUID(data.dept_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid dept_id UUID")

    dept = await db.get(Department, dept_uuid)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Check duplicate code in same dept
    existing = await db.execute(
        select(Subject).where(Subject.dept_id == dept_uuid, Subject.code == data.code.strip().upper())
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Subject '{data.code}' already exists in this department")

    subj = Subject(
        name=data.name.strip(),
        code=data.code.strip().upper(),
        dept_id=dept_uuid,
        semester=data.semester,
    )
    db.add(subj)
    await db.commit()
    await db.refresh(subj)
    return SubjectResponse(id=str(subj.id), name=subj.name, code=subj.code, dept_id=str(subj.dept_id), semester=subj.semester)


@router.delete("/{subject_id}")
async def delete_subject(
    subject_id: str,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_dept_admin),
):
    """Delete a subject and all its assignments."""
    try:
        subj_uuid = uuid.UUID(subject_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid subject_id UUID")

    subj = await db.get(Subject, subj_uuid)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")

    name = subj.name
    # Remove assignments first
    await db.execute(sql_delete(SubjectAssignment).where(SubjectAssignment.subject_id == subj_uuid))
    await db.delete(subj)
    await db.commit()
    return {"message": f"Subject '{name}' deleted"}


# ─── Subject Assignment ─────────────────────────────────────

@router.post("/assign")
async def assign_subject_to_faculty(
    data: SubjectAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_dept_admin),
):
    """Assign a subject to a faculty member (optionally for a specific division/batch/semester)."""
    try:
        subj_uuid = uuid.UUID(data.subject_id)
        fac_uuid  = uuid.UUID(data.faculty_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID in request")

    subj = await db.get(Subject, subj_uuid)
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found")

    fac = await db.get(Faculty, fac_uuid)
    if not fac:
        raise HTTPException(status_code=404, detail="Faculty not found")

    # Check duplicate assignment
    existing = await db.execute(
        select(SubjectAssignment).where(
            SubjectAssignment.subject_id == subj_uuid,
            SubjectAssignment.faculty_id == fac_uuid,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This subject is already assigned to this faculty member")

    assignment = SubjectAssignment(
        subject_id=subj_uuid,
        faculty_id=fac_uuid,
        division=data.division,
        batch=data.batch,
        semester=data.semester or subj.semester,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)

    return {
        "id": str(assignment.id),
        "subject_id": str(subj_uuid),
        "subject_name": subj.name,
        "subject_code": subj.code,
        "faculty_id": str(fac_uuid),
        "faculty_name": fac.name,
        "division": assignment.division,
        "batch": assignment.batch,
    }


@router.delete("/assign/{assignment_id}")
async def unassign_subject(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_dept_admin),
):
    """Remove a subject assignment from a faculty member."""
    try:
        asgn_uuid = uuid.UUID(assignment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid assignment_id UUID")

    asgn = await db.get(SubjectAssignment, asgn_uuid)
    if not asgn:
        raise HTTPException(status_code=404, detail="Assignment not found")

    await db.delete(asgn)
    await db.commit()
    return {"message": "Subject unassigned successfully"}


@router.get("/assignments")
async def list_subject_assignments(
    dept_id: Optional[str] = Query(None),
    faculty_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """List all subject assignments. Filter by dept or faculty."""
    query = (
        select(SubjectAssignment, Subject.name.label("subject_name"), Subject.code.label("subject_code"),
               Faculty.name.label("faculty_name"))
        .join(Subject, Subject.id == SubjectAssignment.subject_id)
        .join(Faculty, Faculty.id == SubjectAssignment.faculty_id)
    )
    if faculty_id:
        query = query.where(SubjectAssignment.faculty_id == faculty_id)
    if dept_id:
        query = query.where(Subject.dept_id == dept_id)

    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "id": str(r.SubjectAssignment.id),
            "subject_id": str(r.SubjectAssignment.subject_id),
            "subject_name": r.subject_name,
            "subject_code": r.subject_code,
            "faculty_id": str(r.SubjectAssignment.faculty_id),
            "faculty_name": r.faculty_name,
            "division": r.SubjectAssignment.division,
            "batch": r.SubjectAssignment.batch,
        }
        for r in rows
    ]
