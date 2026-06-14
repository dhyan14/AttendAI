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

router = APIRouter()


class OrgCreate(BaseModel):
    name: str
    code: str
    min_attendance: int = 75


@router.get("/stats")
async def get_platform_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """Platform-wide stats for the Super Admin dashboard."""
    # Total organizations
    org_q = await db.execute(select(func.count(Organization.id)))
    total_orgs = org_q.scalar() or 0

    # Total users by role
    users_q = await db.execute(select(func.count(User.id)))
    total_users = users_q.scalar() or 0

    students_q = await db.execute(select(func.count(User.id)).where(User.role == UserRole.student))
    total_students = students_q.scalar() or 0

    faculty_q = await db.execute(select(func.count(User.id)).where(User.role == UserRole.faculty))
    total_faculty = faculty_q.scalar() or 0

    # Total lectures
    lectures_q = await db.execute(select(func.count(Lecture.id)))
    total_lectures = lectures_q.scalar() or 0

    # Total attendance records
    att_q = await db.execute(select(func.count(AttendanceRecord.id)))
    total_att = att_q.scalar() or 0

    # Open disputes across platform
    disputes_q = await db.execute(
        select(func.count(AttendanceDispute.id))
        .where(AttendanceDispute.status == DisputeStatus.open)
    )
    open_disputes = disputes_q.scalar() or 0

    # Per-org breakdown
    orgs_res = await db.execute(select(Organization).order_by(Organization.created_at))
    orgs = orgs_res.scalars().all()

    org_details = []
    for org in orgs:
        dept_q = await db.execute(select(func.count(Department.id)).where(Department.org_id == org.id))
        stud_q = await db.execute(
            select(func.count(Student.id)).join(Department, Department.id == Student.dept_id)
            .where(Department.org_id == org.id)
        )
        fac_q = await db.execute(
            select(func.count(Faculty.id)).join(User, User.id == Faculty.user_id)
            .where(User.org_id == org.id)
        )
        lec_q = await db.execute(
            select(func.count(Lecture.id))
            .join(Subject, Subject.id == Lecture.subject_id)
            .join(Department, Department.id == Subject.dept_id)
            .where(Department.org_id == org.id)
        )
        org_details.append({
            "id": str(org.id),
            "name": org.name,
            "code": org.code,
            "departments": dept_q.scalar() or 0,
            "students": stud_q.scalar() or 0,
            "faculty": fac_q.scalar() or 0,
            "lectures": lec_q.scalar() or 0,
            "created_at": org.created_at.strftime("%Y-%m-%d") if org.created_at else "—",
            "settings": org.settings or {},
        })

    return {
        "total_orgs": total_orgs,
        "total_users": total_users,
        "total_students": total_students,
        "total_faculty": total_faculty,
        "total_lectures": total_lectures,
        "total_attendance_records": total_att,
        "open_disputes": open_disputes,
        "organizations": org_details,
    }


@router.get("/orgs")
async def list_all_orgs(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """List all organizations on the platform."""
    res = await db.execute(select(Organization).order_by(Organization.name))
    orgs = res.scalars().all()
    return [{"id": str(o.id), "name": o.name, "code": o.code, "settings": o.settings} for o in orgs]


@router.post("/orgs")
async def create_org(
    data: OrgCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin)
):
    """Create a new organization."""
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
    """Delete an organization and all its data."""
    org = await db.get(Organization, uuid.UUID(org_id))
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    await db.delete(org)
    await db.commit()
    return {"message": f"Organization '{org.name}' deleted"}


@router.get("/users")
async def list_all_users(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(require_super_admin),
    role: Optional[str] = None,
):
    """List all users on the platform, optionally filtered by role."""
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
    """Activate or deactivate a user."""
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
    """Permanently delete a user account."""
    user = await db.get(User, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    email = user.email
    await db.delete(user)
    await db.commit()
    return {"message": f"User '{email}' deleted"}
