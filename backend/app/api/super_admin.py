from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.database import get_db
from app.api.deps import require_super_admin
from app.models import (
    Organization, Department, Student, Faculty, User, UserRole, Subject,
    Lecture, AttendanceRecord, AttendanceDispute, DisputeStatus,
)
from pydantic import BaseModel
from typing import Optional
import uuid
import bcrypt

router = APIRouter()


# ─── Schemas ───────────────────────────────────────────────

class OrgCreate(BaseModel):
    name: str
    code: str
    min_attendance: int = 75


class DeptCreate(BaseModel):
    org_id: str
    name: str
    code: str
    institute_name: Optional[str] = None


class StudentCreate(BaseModel):
    name: str
    roll_no: str
    enrollment_no: Optional[str] = None
    email: str
    division: Optional[str] = None
    batch: Optional[str] = None
    semester: Optional[int] = None
    dept_id: str


class FacultyCreate(BaseModel):
    name: str
    email: str
    designation: Optional[str] = None
    dept_id: str


# ─── Helper ────────────────────────────────────────────────

def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ═══════════════════════════════════════════════════════════
# PLATFORM STATS
# ═══════════════════════════════════════════════════════════

@router.get("/stats")
async def get_platform_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """Platform-wide stats for the Super Admin dashboard."""
    org_q    = await db.execute(select(func.count(Organization.id)))
    users_q  = await db.execute(select(func.count(User.id)))
    stud_q   = await db.execute(select(func.count(User.id)).where(User.role == UserRole.student))
    fac_q    = await db.execute(select(func.count(User.id)).where(User.role == UserRole.faculty))
    lec_q    = await db.execute(select(func.count(Lecture.id)))
    att_q    = await db.execute(select(func.count(AttendanceRecord.id)))
    disp_q   = await db.execute(
        select(func.count(AttendanceDispute.id))
        .where(AttendanceDispute.status == DisputeStatus.open)
    )

    orgs_res = await db.execute(select(Organization).order_by(Organization.created_at))
    orgs = orgs_res.scalars().all()

    org_details = []
    for org in orgs:
        d_q = await db.execute(select(func.count(Department.id)).where(Department.org_id == org.id))
        s_q = await db.execute(
            select(func.count(Student.id)).join(Department, Department.id == Student.dept_id)
            .where(Department.org_id == org.id)
        )
        f_q = await db.execute(
            select(func.count(Faculty.id)).join(User, User.id == Faculty.user_id)
            .where(User.org_id == org.id)
        )
        l_q = await db.execute(
            select(func.count(Lecture.id))
            .join(Subject, Subject.id == Lecture.subject_id)
            .join(Department, Department.id == Subject.dept_id)
            .where(Department.org_id == org.id)
        )
        org_details.append({
            "id": str(org.id),
            "name": org.name,
            "code": org.code,
            "departments": d_q.scalar() or 0,
            "students": s_q.scalar() or 0,
            "faculty": f_q.scalar() or 0,
            "lectures": l_q.scalar() or 0,
            "created_at": org.created_at.strftime("%Y-%m-%d") if org.created_at else "—",
            "settings": org.settings or {},
        })

    return {
        "total_orgs": org_q.scalar() or 0,
        "total_users": users_q.scalar() or 0,
        "total_students": stud_q.scalar() or 0,
        "total_faculty": fac_q.scalar() or 0,
        "total_lectures": lec_q.scalar() or 0,
        "total_attendance_records": att_q.scalar() or 0,
        "open_disputes": disp_q.scalar() or 0,
        "organizations": org_details,
    }


# ═══════════════════════════════════════════════════════════
# ORGANIZATIONS
# ═══════════════════════════════════════════════════════════

@router.get("/orgs")
async def list_all_orgs(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    res = await db.execute(select(Organization).order_by(Organization.name))
    orgs = res.scalars().all()
    return [{"id": str(o.id), "name": o.name, "code": o.code, "settings": o.settings} for o in orgs]


@router.post("/orgs")
async def create_org(
    data: OrgCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    existing = await db.execute(select(Organization).where(Organization.code == data.code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Organization code '{data.code}' already exists")

    org = Organization(
        name=data.name,
        code=data.code.upper(),
        settings={"minAttendancePercent": data.min_attendance}
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return {"id": str(org.id), "name": org.name, "code": org.code, "settings": org.settings}


@router.delete("/orgs/{org_id}")
async def delete_org(
    org_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    org = await db.get(Organization, uuid.UUID(org_id))
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    await db.delete(org)
    await db.commit()
    return {"message": f"Organization '{org.name}' deleted"}


# ═══════════════════════════════════════════════════════════
# DEPARTMENTS
# ═══════════════════════════════════════════════════════════

@router.get("/departments")
async def list_all_departments(
    org_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """List all departments across the platform, optionally filtered by org."""
    q = select(Department, Organization.name.label("org_name")).join(
        Organization, Organization.id == Department.org_id
    )
    if org_id:
        q = q.where(Department.org_id == org_id)
    q = q.order_by(Organization.name, Department.name)
    res = await db.execute(q)
    rows = res.all()

    result = []
    for r in rows:
        # Count students in this dept
        s_q = await db.execute(select(func.count(Student.id)).where(Student.dept_id == r.Department.id))
        f_q = await db.execute(select(func.count(Faculty.id)).where(Faculty.dept_id == r.Department.id))
        result.append({
            "id": str(r.Department.id),
            "name": r.Department.name,
            "code": r.Department.code,
            "institute_name": r.Department.institute_name,
            "org_id": str(r.Department.org_id),
            "org_name": r.org_name,
            "student_count": s_q.scalar() or 0,
            "faculty_count": f_q.scalar() or 0,
        })
    return result


@router.post("/departments")
async def create_department(
    data: DeptCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """Create a department inside any organization."""
    org = await db.get(Organization, uuid.UUID(data.org_id))
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    existing = await db.execute(
        select(Department).where(
            Department.org_id == uuid.UUID(data.org_id),
            Department.code == data.code
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Department code '{data.code}' already exists in this org")

    dept = Department(
        org_id=uuid.UUID(data.org_id),
        name=data.name,
        code=data.code.upper(),
        institute_name=data.institute_name,
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return {
        "id": str(dept.id),
        "name": dept.name,
        "code": dept.code,
        "org_id": str(dept.org_id),
        "org_name": org.name,
        "student_count": 0,
        "faculty_count": 0,
    }


@router.delete("/departments/{dept_id}")
async def delete_department(
    dept_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    dept = await db.get(Department, uuid.UUID(dept_id))
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    await db.delete(dept)
    await db.commit()
    return {"message": f"Department '{dept.name}' deleted"}


# ═══════════════════════════════════════════════════════════
# STUDENTS
# ═══════════════════════════════════════════════════════════

@router.get("/students")
async def list_all_students(
    org_id: Optional[str] = None,
    dept_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """List all students across the platform, optionally filtered by org or dept."""
    q = (
        select(Student, Department.name.label("dept_name"), Organization.name.label("org_name"), User.email.label("email"))
        .join(Department, Department.id == Student.dept_id)
        .join(Organization, Organization.id == Department.org_id)
        .outerjoin(User, User.id == Student.user_id)
    )
    if dept_id:
        q = q.where(Student.dept_id == dept_id)
    elif org_id:
        q = q.where(Department.org_id == org_id)

    q = q.order_by(Department.name, Student.roll_no).limit(200)
    res = await db.execute(q)
    rows = res.all()

    return [
        {
            "id": str(r.Student.id),
            "name": r.Student.name,
            "roll_no": r.Student.roll_no,
            "enrollment_no": r.Student.enrollment_no,
            "division": r.Student.division,
            "batch": r.Student.batch,
            "semester": r.Student.semester,
            "dept_id": str(r.Student.dept_id),
            "dept_name": r.dept_name,
            "org_name": r.org_name,
            "email": r.email or "—",
        }
        for r in rows
    ]


@router.post("/students")
async def create_student(
    data: StudentCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """Create a student + user account inside any department."""
    # Verify department exists and get org
    dept = await db.get(Department, uuid.UUID(data.dept_id))
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Check email uniqueness
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Email '{data.email}' already exists")

    user = User(
        email=data.email,
        password_hash=_hash("Student@123"),
        role=UserRole.student,
        org_id=dept.org_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    student = Student(
        user_id=user.id,
        name=data.name,
        roll_no=data.roll_no,
        enrollment_no=data.enrollment_no,
        division=data.division,
        batch=data.batch,
        semester=data.semester,
        dept_id=uuid.UUID(data.dept_id),
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)

    # Get dept name for response
    return {
        "id": str(student.id),
        "name": student.name,
        "roll_no": student.roll_no,
        "enrollment_no": student.enrollment_no,
        "division": student.division,
        "batch": student.batch,
        "semester": student.semester,
        "dept_id": str(student.dept_id),
        "dept_name": dept.name,
        "email": data.email,
    }


@router.delete("/students/{student_id}")
async def delete_student(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    student = await db.get(Student, uuid.UUID(student_id))
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    name = student.name
    # Also delete their user account if linked
    if student.user_id:
        user = await db.get(User, student.user_id)
        if user:
            await db.delete(user)
    await db.delete(student)
    await db.commit()
    return {"message": f"Student '{name}' deleted"}


# ═══════════════════════════════════════════════════════════
# FACULTY
# ═══════════════════════════════════════════════════════════

@router.get("/faculty")
async def list_all_faculty(
    org_id: Optional[str] = None,
    dept_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """List all faculty across the platform, optionally filtered by org or dept."""
    q = (
        select(Faculty, Department.name.label("dept_name"), Organization.name.label("org_name"), User.email.label("email"))
        .join(User, User.id == Faculty.user_id)
        .join(Department, Department.id == Faculty.dept_id)
        .join(Organization, Organization.id == Department.org_id)
    )
    if dept_id:
        q = q.where(Faculty.dept_id == dept_id)
    elif org_id:
        q = q.where(User.org_id == org_id)

    q = q.order_by(Department.name, Faculty.name).limit(200)
    res = await db.execute(q)
    rows = res.all()

    return [
        {
            "id": str(r.Faculty.id),
            "name": r.Faculty.name,
            "designation": r.Faculty.designation,
            "dept_id": str(r.Faculty.dept_id),
            "dept_name": r.dept_name,
            "org_name": r.org_name,
            "email": r.email,
        }
        for r in rows
    ]


@router.post("/faculty")
async def create_faculty(
    data: FacultyCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """Create a faculty member + user account inside any department."""
    dept = await db.get(Department, uuid.UUID(data.dept_id))
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Email '{data.email}' already exists")

    user = User(
        email=data.email,
        password_hash=_hash("Faculty@123"),
        role=UserRole.faculty,
        org_id=dept.org_id,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    faculty = Faculty(
        user_id=user.id,
        name=data.name,
        designation=data.designation,
        dept_id=uuid.UUID(data.dept_id),
    )
    db.add(faculty)
    await db.commit()
    await db.refresh(faculty)

    return {
        "id": str(faculty.id),
        "name": faculty.name,
        "designation": faculty.designation,
        "dept_id": str(faculty.dept_id),
        "dept_name": dept.name,
        "email": data.email,
    }


@router.delete("/faculty/{faculty_id}")
async def delete_faculty(
    faculty_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    fac = await db.get(Faculty, uuid.UUID(faculty_id))
    if not fac:
        raise HTTPException(status_code=404, detail="Faculty not found")
    name = fac.name
    if fac.user_id:
        user = await db.get(User, fac.user_id)
        if user:
            await db.delete(user)
    await db.delete(fac)
    await db.commit()
    return {"message": f"Faculty '{name}' deleted"}


# ═══════════════════════════════════════════════════════════
# USERS (platform-wide)
# ═══════════════════════════════════════════════════════════

@router.get("/users")
async def list_all_users(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin),
    role: Optional[str] = None,
):
    q = select(User, Organization.name.label("org_name")).join(
        Organization, Organization.id == User.org_id, isouter=True
    )
    if role:
        q = q.where(User.role == role)
    q = q.order_by(User.created_at.desc()).limit(100)
    res = await db.execute(q)
    rows = res.all()
    return [
        {
            "id": str(r.User.id),
            "email": r.User.email,
            "role": r.User.role.value,
            "org_name": r.org_name or "—",
            "is_active": r.User.is_active,
            "created_at": r.User.created_at.strftime("%Y-%m-%d") if r.User.created_at else "—",
        }
        for r in rows
    ]


@router.patch("/users/{user_id}/toggle")
async def toggle_user_active(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    user = await db.get(User, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    await db.commit()
    return {"id": str(user.id), "is_active": user.is_active}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    user = await db.get(User, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    email = user.email
    await db.delete(user)
    await db.commit()
    return {"message": f"User '{email}' deleted"}
