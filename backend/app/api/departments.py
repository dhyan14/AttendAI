from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from typing import List
from pydantic import BaseModel
import uuid

from app.database import get_db
from app.models import (
    Department, Student, Faculty, User, Subject,
    AttendanceRecord, AttendanceStatus, Lecture,
    AttendanceDispute, DisputeStatus
)
from app.api.deps import get_current_user, require_org_admin

router = APIRouter()

class DepartmentCreate(BaseModel):
    name: str
    code: str
    institute_name: str | None = None

class DepartmentResponse(BaseModel):
    id: str
    name: str
    code: str
    org_id: str
    institute_name: str | None

    class Config:
        from_attributes = True


@router.get("/stats")
async def get_org_stats(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Return live org-wide stats: total students, faculty, avg attendance, open disputes, and per-dept breakdown."""

    # --- Total students in org ---
    student_q = await db.execute(
        select(func.count(Student.id))
        .join(Department, Department.id == Student.dept_id)
        .where(Department.org_id == current_user.org_id)
    )
    total_students = student_q.scalar() or 0

    # --- Total faculty in org ---
    faculty_q = await db.execute(
        select(func.count(Faculty.id))
        .join(User, User.id == Faculty.user_id)
        .where(User.org_id == current_user.org_id)
    )
    total_faculty = faculty_q.scalar() or 0

    # --- Avg attendance across all records in org ---
    present_case = case((AttendanceRecord.status == AttendanceStatus.present, 1), else_=0)
    att_q = await db.execute(
        select(
            func.count(AttendanceRecord.id).label("total"),
            func.sum(present_case).label("present")
        )
        .join(Student, Student.id == AttendanceRecord.student_id)
        .join(Department, Department.id == Student.dept_id)
        .where(Department.org_id == current_user.org_id)
    )
    att_row = att_q.first()
    total_att = att_row.total or 0
    present_att = att_row.present or 0
    avg_attendance = round((present_att / total_att * 100), 1) if total_att > 0 else 0.0

    # --- Open disputes in org ---
    dispute_q = await db.execute(
        select(func.count(AttendanceDispute.id))
        .join(Student, Student.id == AttendanceDispute.student_id)
        .join(Department, Department.id == Student.dept_id)
        .where(
            Department.org_id == current_user.org_id,
            AttendanceDispute.status == DisputeStatus.open
        )
    )
    open_disputes = dispute_q.scalar() or 0

    # --- Per-department breakdown ---
    dept_result = await db.execute(
        select(Department).where(Department.org_id == current_user.org_id)
    )
    depts = dept_result.scalars().all()

    dept_stats = []
    for dept in depts:
        s_q = await db.execute(select(func.count(Student.id)).where(Student.dept_id == dept.id))
        f_q = await db.execute(select(func.count(Faculty.id)).where(Faculty.dept_id == dept.id))

        # Avg attendance per dept
        dept_att_q = await db.execute(
            select(
                func.count(AttendanceRecord.id).label("total"),
                func.sum(present_case).label("present")
            )
            .join(Student, Student.id == AttendanceRecord.student_id)
            .where(Student.dept_id == dept.id)
        )
        dept_att = dept_att_q.first()
        dept_total = dept_att.total or 0
        dept_present = dept_att.present or 0
        dept_avg = round((dept_present / dept_total * 100), 1) if dept_total > 0 else 0.0

        dept_stats.append({
            "id": str(dept.id),
            "name": dept.name,
            "code": dept.code,
            "institute_name": dept.institute_name,
            "student_count": s_q.scalar() or 0,
            "faculty_count": f_q.scalar() or 0,
            "avg_attendance": dept_avg,
        })

    return {
        "total_students": total_students,
        "total_faculty": total_faculty,
        "avg_attendance": avg_attendance,
        "open_disputes": open_disputes,
        "departments": dept_stats,
    }


@router.get("/", response_model=List[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all departments in the current user's organization."""
    org_id = current_user.org_id

    # Fallback: dept_admin may be linked via Faculty table if org_id is somehow null
    if not org_id:
        from app.models import Faculty as FacultyModel, Department as DeptModel
        fac_res = await db.execute(
            select(FacultyModel).where(FacultyModel.user_id == current_user.id)
        )
        fac = fac_res.scalar_one_or_none()
        if fac:
            dept = await db.get(DeptModel, fac.dept_id)
            if dept:
                org_id = dept.org_id

    if not org_id:
        return []

    result = await db.execute(
        select(Department).where(Department.org_id == org_id)
    )
    depts = result.scalars().all()
    return [
        DepartmentResponse(
            id=str(d.id),
            name=d.name,
            code=d.code,
            org_id=str(d.org_id),
            institute_name=d.institute_name
        ) for d in depts
    ]

@router.post("/", response_model=DepartmentResponse)
async def create_department(
    data: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_org_admin)
):
    """Create a new department in the current admin's organization."""
    if not current_user.org_id:
        raise HTTPException(status_code=400, detail="Admin user does not belong to any organization")
        
    existing_dept_res = await db.execute(
        select(Department).where(
            Department.org_id == current_user.org_id,
            Department.code == data.code
        )
    )
    if existing_dept_res.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail=f"Department with code '{data.code}' already exists in your organization"
        )

    new_dept = Department(
        org_id=current_user.org_id,
        name=data.name,
        code=data.code,
        institute_name=data.institute_name
    )
    db.add(new_dept)
    await db.commit()
    await db.refresh(new_dept)

    return DepartmentResponse(
        id=str(new_dept.id),
        name=new_dept.name,
        code=new_dept.code,
        org_id=str(new_dept.org_id),
        institute_name=new_dept.institute_name
    )
