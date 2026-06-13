from fastapi import APIRouter, Depends
from app.api.deps import get_current_user
router = APIRouter()

@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "role": current_user.role.value,
    }
