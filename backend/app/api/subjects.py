from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
import uuid

from app.database import get_db
from app.models import Subject
from app.api.deps import get_current_user

router = APIRouter()

# ─── Schemas ───────────────────────────────────────────────

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
    """List subjects. Can be filtered by department and semester."""
    query = select(Subject)
    
    if dept_id:
        query = query.where(Subject.dept_id == dept_id)
    else:
        # Default to user's org subjects if not specified (implicit filter)
        from app.models import Department, User
        query = query.join(Department, Department.id == Subject.dept_id).join(User, User.org_id == Department.org_id).where(User.id == current_user.id)
        
    if semester:
        query = query.where(Subject.semester == semester)
        
    result = await db.execute(query.order_by(Subject.code))
    subjects = result.scalars().all()
    
    return [
        SubjectResponse(
            id=str(s.id),
            name=s.name,
            code=s.code,
            dept_id=str(s.dept_id),
            semester=s.semester
        ) for s in subjects
    ]
