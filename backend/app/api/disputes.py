from fastapi import APIRouter, Depends
from app.api.deps import get_current_user
router = APIRouter()

@router.get("/")
async def list_disputes(current_user=Depends(get_current_user)):
    return []

@router.post("/")
async def create_dispute(current_user=Depends(get_current_user)):
    return {"status": "coming soon"}
