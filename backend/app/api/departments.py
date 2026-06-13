from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from pydantic import BaseModel
import uuid

from app.database import get_db
from app.models import Department
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

@router.get("/", response_model=List[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all departments in the current user's organization."""
    if not current_user.org_id:
        return []
    result = await db.execute(
        select(Department).where(Department.org_id == current_user.org_id)
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
        
    # Check if department with code already exists in this org
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

