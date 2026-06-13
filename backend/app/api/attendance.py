from fastapi import APIRouter, Depends
from app.api.deps import get_current_user
router = APIRouter()

@router.get("/")
async def list_attendance(current_user=Depends(get_current_user)):
    return []
