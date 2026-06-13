from fastapi import APIRouter, Depends
from app.api.deps import get_current_user
router = APIRouter()

@router.post("/register")
async def register_face(current_user=Depends(get_current_user)):
    return {"status": "coming soon"}

@router.post("/recognize")
async def recognize_faces(current_user=Depends(get_current_user)):
    return {"status": "coming soon"}
