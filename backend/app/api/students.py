import csv
import io
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import bcrypt

from app.database import get_db
from app.models import Student, User, UserRole, Department
from app.api.deps import get_current_user, require_dept_admin

router = APIRouter()

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


# ─── Schemas ───────────────────────────────────────────────

class StudentCreate(BaseModel):
    roll_no: str
    enrollment_no: Optional[str] = None
    name: str
    email: str
    division: Optional[str] = None
    batch: Optional[str] = None
    semester: Optional[int] = None
    dept_id: str


class StudentResponse(BaseModel):
    id: str
    roll_no: str
    enrollment_no: Optional[str]
    name: str
    division: Optional[str]
    batch: Optional[str]
    semester: Optional[int]
    dept_id: str
    profile_image_url: Optional[str]
    email: Optional[str] = None
    attendance_percentage: Optional[float] = None

    class Config:
        from_attributes = True


class CSVImportResponse(BaseModel):
    created: int
    skipped: int
    errors: List[str]


# ─── Routes ────────────────────────────────────────────────

@router.get("/", response_model=List[StudentResponse])
async def list_students(
    dept_id: Optional[str] = Query(None),
    division: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    semester: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    dept_uuid = None
    if dept_id and dept_id not in ("undefined", "null", ""):
        try:
            dept_uuid = uuid.UUID(dept_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid dept_id UUID format")

    from sqlalchemy import func, case
    from app.models import AttendanceRecord, AttendanceStatus
    
    present_cases = case((AttendanceRecord.status == AttendanceStatus.present, 1), else_=0)
    
    query = select(
        Student,
        User.email,
        func.count(AttendanceRecord.id).label("total_count"),
        func.sum(present_cases).label("present_count")
    ).join(
        User, User.id == Student.user_id
    ).outerjoin(
        AttendanceRecord, AttendanceRecord.student_id == Student.id
    ).options(
        selectinload(Student.face_embeddings)
    )
    
    if dept_uuid:
        query = query.where(Student.dept_id == dept_uuid)
    if division:
        query = query.where(Student.division == division)
    if batch:
        query = query.where(Student.batch == batch)
    if semester:
        query = query.where(Student.semester == semester)
        
    query = query.group_by(Student.id, User.email).order_by(Student.roll_no)
    
    result = await db.execute(query)
    rows = result.all()
    
    students_out = []
    for row in rows:
        s = row.Student
        total = row.total_count
        present = row.present_count or 0
        pct = round((present / total * 100), 1) if total > 0 else 0.0
        
        front_img = None
        for fe in s.face_embeddings:
            if fe.angle == "front":
                front_img = fe.image_url
                break
        
        students_out.append(
            StudentResponse(
                id=str(s.id),
                roll_no=s.roll_no,
                enrollment_no=s.enrollment_no,
                name=s.name,
                division=s.division,
                batch=s.batch,
                semester=s.semester,
                dept_id=str(s.dept_id),
                profile_image_url=s.profile_image_url or front_img,
                email=row.email,
                attendance_percentage=pct
            )
        )
    return students_out


@router.post("/", response_model=StudentResponse)
async def create_student(
    data: StudentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_dept_admin),
):
    # Create user account
    user = User(
        email=data.email,
        password_hash=hash_password("Student@123"),  # Default password
        role=UserRole.student,
        org_id=current_user.org_id,
    )
    db.add(user)
    await db.flush()

    student = Student(
        user_id=user.id,
        roll_no=data.roll_no,
        enrollment_no=data.enrollment_no,
        name=data.name,
        division=data.division,
        batch=data.batch,
        semester=data.semester,
        dept_id=data.dept_id,
    )
    db.add(student)
    await db.flush()

    return StudentResponse(
        id=str(student.id),
        roll_no=student.roll_no,
        enrollment_no=student.enrollment_no,
        name=student.name,
        division=student.division,
        batch=student.batch,
        semester=student.semester,
        dept_id=str(student.dept_id),
        profile_image_url=student.profile_image_url,
        email=user.email,
    )


@router.post("/import", response_model=CSVImportResponse)
async def import_students_csv(
    file: UploadFile = File(...),
    dept_id: str = Query(..., description="Department ID for all imported students"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_dept_admin),
):
    """
    Bulk import students from CSV file.
    
    CSV format:
    roll_no,enrollment_no,name,email,division,batch,semester
    CS001,EN2024001,Rahul Sharma,rahul@college.edu,A,B1,4
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    content = await file.read()
    text = content.decode("utf-8-sig")  # Handle BOM
    reader = csv.DictReader(io.StringIO(text))

    created = 0
    skipped = 0
    errors = []

    for i, row in enumerate(reader, start=2):  # Row 2 = first data row
        try:
            email = row.get("email", "").strip()
            roll_no = row.get("roll_no", "").strip()

            if not email or not roll_no:
                errors.append(f"Row {i}: Missing email or roll_no")
                skipped += 1
                continue

            # Check if email already exists
            existing = await db.execute(select(User).where(User.email == email))
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            user = User(
                email=email,
                password_hash=hash_password("Student@123"),
                role=UserRole.student,
                org_id=current_user.org_id,
            )
            db.add(user)
            await db.flush()

            student = Student(
                user_id=user.id,
                roll_no=roll_no,
                enrollment_no=row.get("enrollment_no", "").strip() or None,
                name=row.get("name", "").strip(),
                division=row.get("division", "").strip() or None,
                batch=row.get("batch", "").strip() or None,
                semester=int(row["semester"]) if row.get("semester", "").strip() else None,
                dept_id=dept_id,
            )
            db.add(student)
            created += 1

        except Exception as e:
            errors.append(f"Row {i}: {str(e)}")
            skipped += 1

    return CSVImportResponse(created=created, skipped=skipped, errors=errors)


@router.get("/{student_id}/attendance")
async def get_student_attendance(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from sqlalchemy import and_
    from app.models import AttendanceRecord, Subject, AttendanceStatus

    # Overall stats
    total_q = await db.execute(
        select(func.count()).where(AttendanceRecord.student_id == student_id)
    )
    total = total_q.scalar()

    present_q = await db.execute(
        select(func.count()).where(
            and_(
                AttendanceRecord.student_id == student_id,
                AttendanceRecord.status == AttendanceStatus.present,
            )
        )
    )
    present = present_q.scalar()

    percentage = round((present / total * 100), 1) if total > 0 else 0.0

    return {
        "student_id": student_id,
        "total_lectures": total,
        "present": present,
        "absent": total - present,
        "percentage": percentage,
    }


@router.get("/{student_id}/attendance/history")
async def get_student_attendance_history(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Retrieve history of attendance records for a student."""
    query = select(
        AttendanceRecord,
        Lecture.date.label("lecture_date"),
        Lecture.lecture_no.label("lecture_no"),
        Subject.name.label("subject_name"),
        Subject.code.label("subject_code"),
        Faculty.name.label("faculty_name")
    ).join(
        Lecture, Lecture.id == AttendanceRecord.lecture_id
    ).join(
        Subject, Subject.id == Lecture.subject_id
    ).join(
        Faculty, Faculty.id == Lecture.faculty_id
    ).where(
        AttendanceRecord.student_id == student_id
    ).order_by(
        Lecture.date.desc()
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    return [
        {
            "id": str(r.AttendanceRecord.id),
            "lecture_id": str(r.AttendanceRecord.lecture_id),
            "date": r.lecture_date.strftime("%Y-%m-%d"),
            "time": r.lecture_date.strftime("%I:%M %p"),
            "lecture_no": r.lecture_no,
            "subject_name": r.subject_name,
            "subject_code": r.subject_code,
            "faculty_name": r.faculty_name,
            "status": r.AttendanceRecord.status.value,
        } for r in rows
    ]


@router.get("/me")
async def get_student_me(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get the current logged in student's profile details."""
    result = await db.execute(
        select(Student).where(Student.user_id == current_user.id)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")
    return {
        "id": str(student.id),
        "roll_no": student.roll_no,
        "name": student.name,
        "division": student.division,
        "batch": student.batch,
        "semester": student.semester,
        "dept_id": str(student.dept_id),
        "profile_image_url": student.profile_image_url
    }
