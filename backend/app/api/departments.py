from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from pydantic import BaseModel
import uuid

from app.database import get_db
from app.models import Department
from app.api.deps import get_current_user

router = APIRouter()

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
