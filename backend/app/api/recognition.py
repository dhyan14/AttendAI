"""
Face registration endpoints — used by Dept Admin to enrol students' faces.

Routes:
  POST   /face/register              Register 1 face image for a student (angle: front | left | right)
  GET    /face/student/{student_id}  List registered angles + thumbnail previews
  DELETE /face/embedding/{id}        Remove a specific registered angle
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sql_delete
from typing import Optional
import uuid
import base64
import io

from app.database import get_db
from app.api.deps import get_current_user, require_dept_admin
from app.models import Student, FaceEmbedding, User
from app.services.face_service import face_service

router = APIRouter()

VALID_ANGLES = {"front", "left", "right"}
THUMB_SIZE   = (200, 200)   # pixels — thumbnail stored in DB


def _make_thumbnail_b64(image_bytes: bytes, size: tuple = THUMB_SIZE) -> Optional[str]:
    """Resize image → JPEG thumbnail → base64 string."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img.thumbnail(size, Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=75)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


# ──────────────────────────────────────────────────────────────────────────────
# POST /face/register
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/register")
async def register_face(
    student_id: str = Form(...),
    angle: str      = Form(...),          # front | left | right
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_dept_admin),
):
    """
    Register one face angle for a student.
    - Extracts a 512-dim InsightFace embedding from the uploaded image.
    - Stores the embedding + thumbnail preview in face_embeddings table.
    - If the same angle already exists, it is replaced.
    - Falls back to a zero-vector if InsightFace is not available on this host
      (so the UI flow remains testable on Railway free tier).
    """
    if angle not in VALID_ANGLES:
        raise HTTPException(status_code=400, detail=f"angle must be one of {VALID_ANGLES}")

    try:
        stu_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student_id UUID")

    student = await db.get(Student, stu_uuid)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file")

    # ── Extract embedding ──────────────────────────────────────────────────
    if not face_service.initialized:
        try:
            await face_service.initialize()
        except Exception as e:
            print(f"[FaceService] Lazy init failed: {e}")

    if not face_service.initialized:
        # Return 503 — do NOT save a zero-vector and mislead the admin
        err_reason = face_service.load_error or "Unknown error"
        raise HTTPException(
            status_code=503,
            detail=(
                f"⚠ Face recognition model is not loaded yet. Please wait 30-60 seconds after deployment "
                f"and try again. Error: {err_reason}"
            ),
        )

    embedding: list[float]
    try:
        embedding = face_service.get_embedding_single(image_bytes)
        if embedding is None:
            raise HTTPException(
                status_code=422,
                detail="No face detected in the uploaded image. Please use a clear, well-lit front-facing photo.",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face extraction failed: {e}")

    # ── Thumbnail ─────────────────────────────────────────────────────────
    thumbnail = _make_thumbnail_b64(image_bytes)

    # ── Upsert: delete existing same-angle embedding, then insert ─────────
    await db.execute(
        sql_delete(FaceEmbedding).where(
            FaceEmbedding.student_id == stu_uuid,
            FaceEmbedding.angle == angle,
        )
    )
    fe = FaceEmbedding(
        student_id=stu_uuid,
        embedding=embedding,
        image_url=thumbnail,      # stored as base64 data-URL (thumbnail)
        angle=angle,
    )
    db.add(fe)
    await db.commit()
    await db.refresh(fe)

    return {
        "id": str(fe.id),
        "student_id": student_id,
        "student_name": student.name,
        "angle": angle,
        "ai_used": True,
        "thumbnail": thumbnail,
        "message": f"AI embedding registered for {angle} angle.",
    }


# ──────────────────────────────────────────────────────────────────────────────
# GET /face/student/{student_id}
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/student/{student_id}")
async def list_student_faces(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all registered face angles for a student with thumbnail previews."""
    try:
        stu_uuid = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid student_id UUID")

    student = await db.get(Student, stu_uuid)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    res = await db.execute(
        select(FaceEmbedding)
        .where(FaceEmbedding.student_id == stu_uuid)
        .order_by(FaceEmbedding.created_at)
    )
    embeddings = res.scalars().all()

    registered: dict = {a: None for a in VALID_ANGLES}
    for fe in embeddings:
        registered[fe.angle] = {
            "id": str(fe.id),
            "angle": fe.angle,
            "thumbnail": fe.image_url,
            "registered_at": fe.created_at.isoformat() if fe.created_at else None,
        }

    return {
        "student_id": student_id,
        "student_name": student.name,
        "roll_no": student.roll_no,
        "total_registered": sum(1 for v in registered.values() if v is not None),
        "angles": registered,      # {"front": {...} | null, "left": ..., "right": ...}
    }


# ──────────────────────────────────────────────────────────────────────────────
# DELETE /face/embedding/{embedding_id}
# ──────────────────────────────────────────────────────────────────────────────

@router.delete("/embedding/{embedding_id}")
async def delete_face_embedding(
    embedding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_dept_admin),
):
    """Delete a specific face angle registration."""
    try:
        emb_uuid = uuid.UUID(embedding_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid embedding_id UUID")

    fe = await db.get(FaceEmbedding, emb_uuid)
    if not fe:
        raise HTTPException(status_code=404, detail="Face embedding not found")

    angle = fe.angle
    student_id = str(fe.student_id)
    await db.delete(fe)
    await db.commit()

    return {"message": f"Removed '{angle}' face registration for student {student_id}"}


# ──────────────────────────────────────────────────────────────────────────────
# GET /face/status   — Debug endpoint: model loading state
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/status")
async def face_service_status(
    current_user: User = Depends(get_current_user),
):
    """
    Returns current InsightFace model loading status.
    Use this to debug face recognition issues — call this endpoint to see
    whether the model loaded, is still loading, or failed with an error.
    """
    return {
        "initialized": face_service.initialized,
        "loading": face_service._loading,
        "load_error": face_service.load_error,
        "status": (
            "ready" if face_service.initialized
            else "loading" if face_service._loading
            else f"failed: {face_service.load_error}" if face_service.load_error
            else "not_started"
        ),
    }
