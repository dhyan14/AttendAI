from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import List, Optional
import bcrypt
import uuid

from app.database import get_db
from app.models import Faculty, User, UserRole, Department
from app.api.deps import get_current_user, require_dept_admin

router = APIRouter()

# ─── Schemas ───────────────────────────────────────────────

class FacultyCreate(BaseModel):
    name: str
    email: EmailStr
    designation: Optional[str] = None
    dept_id: str


class FacultyResponse(BaseModel):
    id: str
    name: str
    designation: Optional[str]
    dept_id: str
    email: str

    class Config:
        from_attributes = True


# ─── Routes ────────────────────────────────────────────────

@router.get("/", response_model=List[FacultyResponse])
async def list_faculty(
    dept_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """List all faculty members in the current user's organization."""
    query = select(Faculty, User.email).join(User, User.id == Faculty.user_id)
    
    # Filter by user's organization
    query = query.where(User.org_id == current_user.org_id)
    
    if dept_id:
        query = query.where(Faculty.dept_id == dept_id)
        
    result = await db.execute(query.order_by(Faculty.name))
    rows = result.all()
    
    return [
        FacultyResponse(
            id=str(row.Faculty.id),
            name=row.Faculty.name,
            designation=row.Faculty.designation,
            dept_id=str(row.Faculty.dept_id),
            email=row.email
        ) for row in rows
    ]


@router.post("/", response_model=FacultyResponse)
async def create_faculty(
    data: FacultyCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_dept_admin)
):
    """Create a new faculty member and user profile."""
    # Check if user email already exists
    existing_user_res = await db.execute(select(User).where(User.email == data.email))
    if existing_user_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
        
    # Verify department exists
    dept_res = await db.execute(select(Department).where(Department.id == data.dept_id))
    if not dept_res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Department not found"
        )

    # Create user profile
    salt = bcrypt.gensalt()
    password_hash = bcrypt.hashpw(b"Faculty@123", salt).decode("utf-8") # Default password
    
    user = User(
        email=data.email,
        password_hash=password_hash,
        role=UserRole.faculty,
        org_id=current_user.org_id,
        is_active=True
    )
    db.add(user)
    await db.flush() # Populate user ID

    # Create faculty profile
    faculty = Faculty(
        user_id=user.id,
        name=data.name,
        designation=data.designation,
        dept_id=uuid.UUID(data.dept_id)
    )
    db.add(faculty)
    await db.commit()
    await db.refresh(faculty)
    
    return FacultyResponse(
        id=str(faculty.id),
        name=faculty.name,
        designation=faculty.designation,
        dept_id=str(faculty.dept_id),
        email=user.email
    )


@router.get("/me")
async def get_faculty_me(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """Get the current logged in faculty member's profile details."""
    result = await db.execute(
        select(Faculty).where(Faculty.user_id == current_user.id)
    )
    fac = result.scalar_one_or_none()
    if not fac:
        raise HTTPException(status_code=404, detail="Faculty profile not found")
        
    # Get department name
    dept_res = await db.execute(select(Department).where(Department.id == fac.dept_id))
    dept = dept_res.scalar_one_or_none()
    
    return {
        "id": str(fac.id),
        "name": fac.name,
        "designation": fac.designation,
        "dept_id": str(fac.dept_id),
        "dept_name": dept.name if dept else "Unknown",
        "email": current_user.email
    }
