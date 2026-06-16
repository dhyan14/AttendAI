"""
Face registration endpoints — used by Dept Admin to enrol students' faces.

Routes:
  POST   /face/register              Register 1 face image for a student (angle: front | left | right)
  GET    /face/student/{student_id}  List registered angles + thumbnail previews
  DELETE /face/embedding/{id}        Remove a specific registered angle
  POST   /face/bulk-upload           Bulk register faces from a ZIP of roll_no folders
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sql_delete
from typing import Optional, List
import uuid
import base64
import io
import zipfile

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
# POST /face/bulk-upload
# ──────────────────────────────────────────────────────────────────────────────

SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
ANGLE_ORDER    = ["front", "left", "right"]


@router.post("/bulk-upload")
async def bulk_upload_faces(
    dept_id: str          = Form(..., description="Department UUID to scope student lookup"),
    zip_file: UploadFile  = File(..., description="ZIP containing roll_no-named folders with 3 images each"),
    db: AsyncSession      = Depends(get_db),
    current_user: User    = Depends(require_dept_admin),
):
    """
    Bulk register faces from a ZIP file.

    ZIP structure expected:
      CS001/           ← folder name = student roll_no
        any1.jpg       ← sorted alphabetically → front
        any2.jpg       ← sorted alphabetically → left
        any3.jpg       ← sorted alphabetically → right
      CS002/
        ...

    - Top-level folders only (sub-folders are ignored)
    - Images sorted alphabetically; 1st=front, 2nd=left, 3rd=right
    - Partial registration allowed (< 3 images = registers available angles)
    - Supported extensions: .jpg, .jpeg, .png, .webp
    """
    # ── Validate ZIP ──────────────────────────────────────────────────────────
    if not zip_file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive")

    zip_bytes = await zip_file.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid or corrupted ZIP file")

    # ── Ensure face model is ready ────────────────────────────────────────────
    if not face_service.initialized:
        try:
            await face_service.initialize()
        except Exception as e:
            print(f"[BulkUpload] Lazy init failed: {e}")

    if not face_service.initialized:
        raise HTTPException(
            status_code=503,
            detail=(
                f"⚠ Face recognition model is not loaded yet. "
                f"Please wait 30–60 seconds and try again. "
                f"Error: {face_service.load_error or 'Unknown'}"
            ),
        )

    # ── Validate dept_id ──────────────────────────────────────────────────────
    try:
        dept_uuid = uuid.UUID(dept_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid dept_id UUID format")

    # ── Build roll_no → Student map ───────────────────────────────────────────
    from app.models import Department
    res = await db.execute(
        select(Student).where(Student.dept_id == dept_uuid)
    )
    all_students = res.scalars().all()
    student_map: dict[str, Student] = {
        s.roll_no.strip().lower(): s for s in all_students
    }

    # ── Parse ZIP: collect folders and their images ───────────────────────────
    # Build: { folder_name: sorted list of ZipInfo entries for image files }
    folder_images: dict[str, list] = {}
    for info in zf.infolist():
        if info.is_dir():
            continue
        parts = info.filename.replace("\\", "/").split("/")
        # Only handle top-level folder entries: folder/image.jpg
        if len(parts) != 2:
            continue
        folder_name, filename = parts
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in SUPPORTED_EXTS:
            continue
        if folder_name not in folder_images:
            folder_images[folder_name] = []
        folder_images[folder_name].append(info)

    # Sort images inside each folder alphabetically by filename
    for folder_name in folder_images:
        folder_images[folder_name].sort(key=lambda x: x.filename.split("/")[-1].lower())

    # ── Process each folder ───────────────────────────────────────────────────
    total_folders       = len(folder_images)
    matched_students    = 0
    unmatched_folders   = 0
    total_angles_reg    = 0
    student_results: List[dict] = []
    all_errors: List[dict]      = []

    for folder_name, image_infos in folder_images.items():
        roll_key = folder_name.strip().lower()
        student  = student_map.get(roll_key)

        if student is None:
            unmatched_folders += 1
            student_results.append({
                "roll_no":          folder_name,
                "name":             None,
                "status":           "unmatched",
                "angles_registered": [],
            })
            continue

        matched_students += 1
        angles_registered: list[str] = []
        stu_uuid = student.id

        for idx, img_info in enumerate(image_infos[:3]):  # max 3 images
            angle = ANGLE_ORDER[idx]
            try:
                image_bytes = zf.read(img_info.filename)
                if not image_bytes:
                    all_errors.append({
                        "roll_no": folder_name, "angle": angle,
                        "reason": "Empty image file",
                    })
                    continue

                # Extract embedding
                embedding = face_service.get_embedding_single(image_bytes)
                if embedding is None:
                    all_errors.append({
                        "roll_no": folder_name, "angle": angle,
                        "reason": "No face detected in image",
                    })
                    continue

                # Generate thumbnail
                thumbnail = _make_thumbnail_b64(image_bytes)

                # Upsert: delete existing same-angle, insert new
                await db.execute(
                    sql_delete(FaceEmbedding).where(
                        FaceEmbedding.student_id == stu_uuid,
                        FaceEmbedding.angle == angle,
                    )
                )
                fe = FaceEmbedding(
                    student_id=stu_uuid,
                    embedding=embedding,
                    image_url=thumbnail,
                    angle=angle,
                )
                db.add(fe)
                angles_registered.append(angle)
                total_angles_reg += 1

            except Exception as e:
                all_errors.append({
                    "roll_no": folder_name, "angle": angle,
                    "reason": str(e),
                })

        # Flush per-student so partial failures don't roll back other students
        try:
            await db.flush()
        except Exception as e:
            await db.rollback()
            all_errors.append({
                "roll_no": folder_name, "angle": "all",
                "reason": f"DB flush error: {str(e)}",
            })
            angles_registered = []
            total_angles_reg -= len(angles_registered)

        status = (
            "success" if len(angles_registered) == 3
            else "partial" if len(angles_registered) > 0
            else "failed"
        )
        student_results.append({
            "roll_no":           folder_name,
            "name":              student.name,
            "status":            status,
            "angles_registered": angles_registered,
        })

    await db.commit()

    return {
        "total_folders":         total_folders,
        "matched_students":      matched_students,
        "unmatched_folders":     unmatched_folders,
        "total_angles_registered": total_angles_reg,
        "students":              student_results,
        "errors":                all_errors,
    }


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
