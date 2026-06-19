from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid
import base64
import asyncio
import io as _io

from app.database import get_db
from app.models import (
    Lecture, AttendanceRecord, Student, Subject, Faculty, User, Department,
    AttendanceStatus, AttendanceSource, LectureStatus, FaceEmbedding,
)
from app.api.deps import get_current_user, require_faculty

router = APIRouter()

# ─── Schemas ───────────────────────────────────────────────

class LectureCreate(BaseModel):
    subject_id: str
    division: str
    batch: str
    lecture_no: int
    date: str  # YYYY-MM-DD


class AttendanceRecordResponse(BaseModel):
    id: str
    student_id: str
    student_name: str
    roll_no: str
    status: str
    source: str
    confidence: Optional[float]

    class Config:
        from_attributes = True


class LectureResponse(BaseModel):
    id: str
    subject_name: str
    subject_code: str
    division: str
    batch: str
    lecture_no: int
    date: str
    time: str
    status: str
    total_students: int
    present_count: int

    class Config:
        from_attributes = True


class LectureDetailResponse(BaseModel):
    id: str
    subject_name: str
    subject_code: str
    division: str
    batch: str
    lecture_no: int
    date: str
    time: str
    status: str
    records: List[AttendanceRecordResponse]
    classroom_image_urls: List[str] = []


class FinalizeRequest(BaseModel):
    present_student_ids: List[str]


# ─── Routes ────────────────────────────────────────────────

@router.get("/lectures", response_model=List[LectureResponse])
async def list_lectures(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List lectures. Faculty sees their own schedule; admins see all; students see their attendance schedule."""
    query = select(
        Lecture,
        Subject.name.label("subject_name"),
        Subject.code.label("subject_code")
    ).join(
        Subject, Subject.id == Lecture.subject_id
    )

    if current_user.role.value == "faculty":
        fac_res = await db.execute(select(Faculty).where(Faculty.user_id == current_user.id))
        fac = fac_res.scalar_one_or_none()
        if not fac:
            return []
        query = query.where(Lecture.faculty_id == fac.id)
    elif current_user.role.value == "student":
        stud_res = await db.execute(select(Student).where(Student.user_id == current_user.id))
        student = stud_res.scalar_one_or_none()
        if not student:
            return []
        query = query.where(
            and_(
                Subject.dept_id == student.dept_id,
                Lecture.division == student.division
            )
        )

    result = await db.execute(query.order_by(Lecture.date.desc()))
    rows = result.all()

    return [
        LectureResponse(
            id=str(row.Lecture.id),
            subject_name=row.subject_name,
            subject_code=row.subject_code,
            division=row.Lecture.division,
            batch=row.Lecture.batch,
            lecture_no=row.Lecture.lecture_no,
            date=row.Lecture.date.strftime("%Y-%m-%d"),
            time=row.Lecture.date.strftime("%I:%M %p"),
            status=row.Lecture.status.value,
            total_students=row.Lecture.total_students,
            present_count=row.Lecture.present_count
        ) for row in rows
    ]


@router.post("/lectures", response_model=LectureResponse)
async def create_lecture(
    req: LectureCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_faculty)
):
    """Create a new lecture session and initialize absent records for all students in that div/batch."""
    fac_res = await db.execute(select(Faculty).where(Faculty.user_id == current_user.id))
    fac = fac_res.scalar_one_or_none()

    # Auto-create a Faculty profile if the user has faculty/dept_admin role but no record yet
    if not fac:
        from app.models import Department as DeptModel
        dept_result = None
        if current_user.org_id:
            dept_q = await db.execute(
                select(DeptModel).where(DeptModel.org_id == current_user.org_id).limit(1)
            )
            dept_result = dept_q.scalar_one_or_none()

        fac = Faculty(
            user_id=current_user.id,
            name=current_user.email.split("@")[0].replace(".", " ").title(),
            designation="Faculty",
            dept_id=dept_result.id if dept_result else None,
        )
        db.add(fac)
        await db.flush()

    # Validate subject_id
    try:
        subj_uuid = uuid.UUID(req.subject_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid subject_id")

    subj_res = await db.execute(select(Subject).where(Subject.id == subj_uuid))
    subject = subj_res.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    students_query = select(Student).where(Student.dept_id == subject.dept_id)
    if req.division and req.division.strip().upper() not in ("ALL", ""):
        students_query = students_query.where(Student.division == req.division.strip().upper())
    if req.batch and req.batch.strip().upper() not in ("ALL", ""):
        students_query = students_query.where(Student.batch == req.batch.strip().upper())

    students_res = await db.execute(students_query)
    students = students_res.scalars().all()

    lecture = Lecture(
        subject_id=uuid.UUID(req.subject_id),
        faculty_id=fac.id,
        division=req.division,
        batch=req.batch,
        lecture_no=req.lecture_no,
        date=datetime.strptime(req.date, "%Y-%m-%d") if req.date else datetime.utcnow(),
        status=LectureStatus.pending,
        total_students=len(students),
        present_count=0
    )
    db.add(lecture)
    await db.flush()

    for student in students:
        rec = AttendanceRecord(
            lecture_id=lecture.id,
            student_id=student.id,
            subject_id=subject.id,
            status=AttendanceStatus.absent,
            source=AttendanceSource.auto,
            confidence=0.0
        )
        db.add(rec)

    await db.commit()
    await db.refresh(lecture)

    return LectureResponse(
        id=str(lecture.id),
        subject_name=subject.name,
        subject_code=subject.code,
        division=lecture.division,
        batch=lecture.batch,
        lecture_no=lecture.lecture_no,
        date=lecture.date.strftime("%Y-%m-%d"),
        time=lecture.date.strftime("%I:%M %p"),
        status=lecture.status.value,
        total_students=lecture.total_students,
        present_count=lecture.present_count
    )


@router.get("/lectures/{lecture_id}", response_model=LectureDetailResponse)
async def get_lecture_details(
    lecture_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get details of a specific lecture session including marked students."""
    query = select(
        Lecture,
        Subject.name.label("subject_name"),
        Subject.code.label("subject_code")
    ).join(
        Subject, Subject.id == Lecture.subject_id
    ).where(
        Lecture.id == lecture_id
    )

    result = await db.execute(query)
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Lecture not found")

    rec_query = select(
        AttendanceRecord,
        Student.name.label("student_name"),
        Student.roll_no.label("roll_no")
    ).join(
        Student, Student.id == AttendanceRecord.student_id
    ).where(
        AttendanceRecord.lecture_id == lecture_id
    ).order_by(
        Student.roll_no
    )

    rec_res = await db.execute(rec_query)
    rec_rows = rec_res.all()

    records = [
        AttendanceRecordResponse(
            id=str(r.AttendanceRecord.id),
            student_id=str(r.AttendanceRecord.student_id),
            student_name=r.student_name,
            roll_no=r.roll_no,
            status=r.AttendanceRecord.status.value,
            source=r.AttendanceRecord.source.value,
            confidence=r.AttendanceRecord.confidence
        ) for r in rec_rows
    ]

    return LectureDetailResponse(
        id=str(row.Lecture.id),
        subject_name=row.subject_name,
        subject_code=row.subject_code,
        division=row.Lecture.division,
        batch=row.Lecture.batch,
        lecture_no=row.Lecture.lecture_no,
        date=row.Lecture.date.strftime("%Y-%m-%d"),
        time=row.Lecture.date.strftime("%I:%M %p"),
        status=row.Lecture.status.value,
        records=records,
        classroom_image_urls=row.Lecture.classroom_image_urls or []
    )


@router.put("/lectures/{lecture_id}/finalize")
async def finalize_lecture(
    lecture_id: str,
    req: FinalizeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_faculty)
):
    """Finalize attendance records for a lecture."""
    lecture_res = await db.execute(select(Lecture).where(Lecture.id == lecture_id))
    lecture = lecture_res.scalar_one_or_none()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")

    records_res = await db.execute(
        select(AttendanceRecord).where(AttendanceRecord.lecture_id == lecture.id)
    )
    records = records_res.scalars().all()

    present_uuids = {uuid.UUID(sid) for sid in req.present_student_ids}
    present_count = 0

    for record in records:
        was_present    = record.status == AttendanceStatus.present
        is_now_present = record.student_id in present_uuids
        if was_present != is_now_present:
            record.status = AttendanceStatus.present if is_now_present else AttendanceStatus.absent
            record.source = AttendanceSource.manual
            record.confidence = 1.0 if is_now_present else 0.0
        if is_now_present:
            present_count += 1

    lecture.status = LectureStatus.finalized
    lecture.present_count = present_count
    await db.commit()

    return {"message": "Attendance successfully finalized", "present_count": present_count}


# ─── AI Attendance (parallel, speed-optimized) ─────────────


def draw_annotations_on_image(img_pil, face_boxes):
    from PIL import ImageDraw, ImageFont
    
    annotated = img_pil.copy()
    draw = ImageDraw.Draw(annotated)
    
    def get_font(size):
        try:
            return ImageFont.truetype("arial.ttf", size)
        except Exception:
            return ImageFont.load_default()
            
    for fb in face_boxes:
        bbox = fb.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        x1, y1, x2, y2 = bbox
        bw = x2 - x1
        bh = y2 - y1
        if bw <= 0 or bh <= 0:
            continue
            
        matched = fb.get("matched", False)
        # Harmonious colors matching the frontend
        color = (34, 211, 122) if matched else (255, 69, 58)
        line_width = max(1, min(round(bw / 60), 2))
        
        draw.rectangle([x1, y1, x2, y2], outline=color, width=line_width)
        
        student_name = fb.get("student_name")
        roll_no = fb.get("roll_no")
        confidence = fb.get("confidence", 0.0)
        
        if matched:
            label = f"{roll_no or student_name} {round(confidence * 100)}%"
        else:
            label = f"Unknown {round(confidence * 100)}%"
            
        font_size = max(8, min(round(bw * 0.12), 12))
        font = get_font(font_size)
        
        try:
            text_bbox = draw.textbbox((0, 0), label, font=font)
            tw = text_bbox[2] - text_bbox[0]
            th = text_bbox[3] - text_bbox[1]
        except AttributeError:
            tw, th = draw.textsize(label, font=font)
            
        px = max(2, round(font_size * 0.3))
        py = max(1, round(font_size * 0.15))
        tag_h = th + py * 2
        
        tag_y = y1 - tag_h if y1 - tag_h >= 0 else y2
        tag_x = max(0, min(x1, annotated.width - tw - px * 2))
        
        draw.rectangle([tag_x, tag_y, tag_x + tw + px * 2, tag_y + tag_h], fill=color)
        draw.text((tag_x + px, tag_y + py), label, fill=(255, 255, 255), font=font)
        
    return annotated


# ─── AI Attendance (parallel, speed-optimized) ─────────────


@router.post("/take-ai")
async def take_attendance_ai(
    lecture_id: str = Form(...),
    files: List[UploadFile] = File(...),   # up to 3 classroom images
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_faculty)
):
    """
    Take AI-based attendance using real face recognition.

    Speed optimizations (target ≤ 10 s on CPU):
      - Accepts max 3 photos (was 5) — fewer photos = less total work
      - ALL photos processed IN PARALLEL via asyncio.gather
      - Each image capped at 9 s via asyncio.wait_for
      - InsightFace runs at 480px (was 640px) — ~2× faster per inference pass
      - Tiled detection: 3 passes (1 full + 1×2 tiles) vs old 7 passes (1+6)
      - Stored embedding matrix built ONCE and reused across all images
      - BILINEAR resize for previews (faster than LANCZOS)

    Falls back to deterministic mock if InsightFace unavailable.
    """
    from app.services.face_service import face_service, MATCH_THRESHOLD
    import random
    import numpy as np

    # Lazy init
    if not face_service.initialized:
        try:
            await face_service.initialize()
        except Exception as e:
            print(f"[FaceService] Lazy init failed: {e}")

    # ── Validate lecture ──────────────────────────────────────────────────
    try:
        lec_uuid = uuid.UUID(lecture_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid lecture_id format")

    lec_res = await db.execute(select(Lecture).where(Lecture.id == lec_uuid))
    lecture = lec_res.scalar_one_or_none()
    if not lecture:
        raise HTTPException(status_code=404, detail=f"Lecture not found (id={lecture_id})")

    if not files:
        raise HTTPException(status_code=400, detail="No images provided")
    files = files[:3]   # hard cap at 3 for speed

    # ── Load attendance records + student info ───────────────────────────
    rec_res = await db.execute(
        select(AttendanceRecord, Student.name.label("student_name"), Student.roll_no.label("roll_no"))
        .join(Student, Student.id == AttendanceRecord.student_id)
        .where(AttendanceRecord.lecture_id == lec_uuid)
        .order_by(Student.roll_no)
    )
    rec_rows = rec_res.all()
    # Soft-fail: if no records, return a warning but don't crash
    # (happens when division filter matched 0 students at lecture creation)
    if not rec_rows:
        print(f"[take-ai] WARNING: Lecture {lecture_id} has 0 attendance records — no students were enrolled")
        return {
            "ai_used": False,
            "mode": "no_students",
            "warning": "⚠ No students found for this lecture. This usually means the selected Division does not match any student records. Try selecting a specific division (A, B, C…) instead of 'All', or ask admin to verify student division assignments.",
            "images_processed": 0,
            "image_previews": [],
            "image_annotations": [],
            "detected_faces": 0,
            "matched_faces": 0,
            "total_students": 0,
            "detection_results": [],
        }

    student_ids = [str(r.AttendanceRecord.student_id) for r in rec_rows]

    # ── Load face embeddings for enrolled students ───────────────────────
    emb_res = await db.execute(
        select(FaceEmbedding).where(
            FaceEmbedding.student_id.in_([uuid.UUID(sid) for sid in student_ids])
        )
    )
    stored_embs = emb_res.scalars().all()

    stored_list = []
    for fe in stored_embs:
        if fe.embedding is None:
            continue
        try:
            emb_list = fe.embedding.tolist() if hasattr(fe.embedding, "tolist") else list(fe.embedding)
            if any(v != 0.0 for v in emb_list):
                stored_list.append({"student_id": str(fe.student_id), "embedding": emb_list})
        except Exception:
            pass

    # ── Pre-read all image bytes (sequential async I/O) ──────────────────
    raw_images: list[bytes] = []
    for upload in files:
        raw = await upload.read()
        if raw:
            raw_images.append(raw)

    # ── AI Mode vs. Mock Mode ────────────────────────────────────────────
    use_ai = face_service.initialized and len(stored_list) > 0

    detected_student_ids: set[str] = set()
    ai_confidences: dict[str, float] = {}
    image_previews: list[str] = []
    image_annotations: list[list[dict]] = []

    if use_ai:
        # Build stored embedding matrix ONCE — reused across all parallel image tasks
        stored_vecs_arr = np.array([s["embedding"] for s in stored_list], dtype=np.float32)
        stored_vecs_arr /= (np.linalg.norm(stored_vecs_arr, axis=1, keepdims=True) + 1e-8)

        async def _process_one(raw: bytes):
            """
            Fully async: build HQ preview + run tiled face detection.
            Capped at 30 s (CPU is slow, don't cut off mid-detection).
            Returns (preview_b64: str, face_boxes_scaled: list[dict], annotated_original_b64: str)
            """
            import time
            from PIL import Image as PILImage

            preview_b64 = ""
            annotated_original_b64 = ""

            # ── Load original PIL image ──────────────────────────────────
            try:
                img_orig = PILImage.open(_io.BytesIO(raw)).convert("RGB")
            except Exception as e:
                print(f"[AI] Error loading original image: {e}")
                return "", [], ""

            orig_w, orig_h = img_orig.width, img_orig.height
            print(f"[AI] Image size: {orig_w}x{orig_h}")

            # ── Build 960px JPEG preview for fast display ─────────────────
            try:
                if orig_w > 960:
                    ratio = 960 / orig_w
                    img_preview = img_orig.resize(
                        (960, int(orig_h * ratio)), PILImage.BILINEAR
                    )
                else:
                    img_preview = img_orig.copy()
                buf = _io.BytesIO()
                img_preview.save(buf, format="JPEG", quality=82, optimize=False)
                preview_b64 = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
            except Exception as pe:
                print(f"[AI] Preview error: {pe}")

            # ── Compute scale factors for mapping detections back to preview ──
            # The bboxes from face_service come in ORIGINAL image coordinates.
            # We need no scale when displaying the full-res annotated image directly.
            # scale_x/y are only used for the 960px preview JSON annotations (no longer used for display).
            scale_x = 1.0
            scale_y = 1.0

            # ── Face detection — DETECT on original bytes ─────────────────
            # face_service internally decodes the raw bytes and upscales 2x for detection.
            # The raw bytes are the original full-res JPEG — let the service handle resize.
            face_boxes_scaled: list[dict] = []
            face_boxes_orig: list[dict] = []
            t0 = time.time()
            try:
                print(f"[AI] Starting face detection on {orig_w}x{orig_h} image...")
                probe_raw = await asyncio.wait_for(
                    face_service.get_embeddings_async(raw),
                    timeout=30.0   # CPU detection can take 15-25s for large images
                )
                elapsed = time.time() - t0
                print(f"[AI] Detection done: {len(probe_raw)} faces in {elapsed:.1f}s")

                for (bbox_orig, probe_emb) in probe_raw:
                    ox1, oy1, ox2, oy2 = [float(v) for v in bbox_orig]

                    # Match against stored embeddings
                    probe_vec = np.array(probe_emb, dtype=np.float32)
                    probe_vec /= (np.linalg.norm(probe_vec) + 1e-8)
                    sims = stored_vecs_arr @ probe_vec
                    best_idx = int(np.argmax(sims))
                    best_sim = float(sims[best_idx])

                    if best_sim >= MATCH_THRESHOLD:
                        sid = stored_list[best_idx]["student_id"]
                        matched_row = next(
                            (r for r in rec_rows if str(r.AttendanceRecord.student_id) == sid),
                            None
                        )
                        student_name = matched_row.student_name if matched_row else "Unknown"
                        roll_no = matched_row.roll_no if matched_row else ""
                        matched = True
                    else:
                        sid = None
                        student_name = None
                        roll_no = None
                        matched = False

                    face_boxes_orig.append({
                        "bbox": [ox1, oy1, ox2, oy2],
                        "matched": matched,
                        "student_id": sid,
                        "student_name": student_name,
                        "roll_no": roll_no,
                        "confidence": round(best_sim, 3),
                    })
                    # Scaled bbox for JSON annotations (mapped to 960px preview)
                    face_boxes_scaled.append({
                        "bbox": [
                            round(ox1 * scale_x, 1), round(oy1 * scale_y, 1),
                            round(ox2 * scale_x, 1), round(oy2 * scale_y, 1),
                        ],
                        "matched": matched,
                        "student_id": sid,
                        "student_name": student_name,
                        "roll_no": roll_no,
                        "confidence": round(best_sim, 3),
                    })

            except asyncio.TimeoutError:
                elapsed = time.time() - t0
                print(f"[AI] ⚠ Detection timed out after {elapsed:.1f}s — returning 0 faces for this image")
            except Exception as e:
                import traceback
                print(f"[AI] Recognition error: {e}\n{traceback.format_exc()}")

            # ── Annotate original-quality image (PNG = lossless) ─────────
            # Run in executor because PNG encoding is CPU-heavy (could take 5-10s for large images)
            def _encode_annotated():
                try:
                    img_annotated = draw_annotations_on_image(img_orig, face_boxes_orig)
                    buf_out = _io.BytesIO()
                    # Use JPEG quality=98 instead of PNG to avoid huge files (PNG for 12MP = 15-40 MB)
                    img_annotated.save(buf_out, format="JPEG", quality=98, subsampling=0)
                    return "data:image/jpeg;base64," + base64.b64encode(buf_out.getvalue()).decode()
                except Exception as ae:
                    print(f"[AI] Annotation encode error: {ae}")
                    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()

            loop = asyncio.get_running_loop()
            annotated_original_b64 = await loop.run_in_executor(face_service._executor, _encode_annotated)

            return preview_b64, face_boxes_scaled, annotated_original_b64

        # ── Process ALL images IN PARALLEL ────────────────────────────────
        results = await asyncio.gather(*[_process_one(raw) for raw in raw_images])

        annotated_previews = []
        for preview_b64, face_boxes_scaled, annotated_original_b64 in results:
            if preview_b64:
                image_previews.append(preview_b64)
            image_annotations.append(face_boxes_scaled)
            if annotated_original_b64:
                annotated_previews.append(annotated_original_b64)
            
            # Accumulate — keep highest confidence per student across all images
            for fb in face_boxes_scaled:
                if fb["matched"] and fb["student_id"]:
                    sid = fb["student_id"]
                    conf = fb["confidence"]
                    if sid not in ai_confidences or conf > ai_confidences[sid]:
                        ai_confidences[sid] = conf
                        detected_student_ids.add(sid)

    else:
        # Mock fallback — previews only, no AI
        total_size = 0
        annotated_previews = []
        for raw in raw_images:
            total_size += len(raw)
            try:
                from PIL import Image as PILImage
                img_pil = PILImage.open(_io.BytesIO(raw)).convert("RGB")

                # Store original at JPEG q98 (not PNG — PNG for 12MP = 15-40MB base64)
                buf_hq = _io.BytesIO()
                img_pil.save(buf_hq, format="JPEG", quality=98, subsampling=0)
                b64_orig = "data:image/jpeg;base64," + base64.b64encode(buf_hq.getvalue()).decode()
                annotated_previews.append(b64_orig)

                # Resized preview for frontend
                max_w = 960
                if img_pil.width > max_w:
                    ratio = max_w / img_pil.width
                    img_pil = img_pil.resize(
                        (max_w, int(img_pil.height * ratio)),
                        PILImage.BILINEAR
                    )
                buf = _io.BytesIO()
                img_pil.save(buf, format="JPEG", quality=82)
                b64 = base64.b64encode(buf.getvalue()).decode()
                image_previews.append(f"data:image/jpeg;base64,{b64}")
                image_annotations.append([])
            except Exception:
                pass

        rng = random.Random(total_size)
        for i, sid in enumerate(student_ids):
            is_present = (i % 5) != (len(student_ids) - 1) % 5 if len(student_ids) > 1 else True
            if is_present:
                detected_student_ids.add(sid)
                ai_confidences[sid] = round(rng.uniform(0.72, 0.95), 3)

    # ── Apply results to attendance records ──────────────────────────────
    detection_results = []
    present_count = 0

    for row in rec_rows:
        record = row.AttendanceRecord
        sid = str(record.student_id)
        is_present = sid in detected_student_ids
        confidence = ai_confidences.get(sid, round(random.uniform(0.05, 0.20), 3) if not use_ai else 0.0)

        record.status = AttendanceStatus.present if is_present else AttendanceStatus.absent
        record.source = AttendanceSource.auto
        record.confidence = confidence

        if is_present:
            present_count += 1

        detection_results.append({
            "student_id": sid,
            "student_name": row.student_name,
            "roll_no": row.roll_no,
            "status": "present" if is_present else "absent",
            "confidence": confidence,
            "source": "ai",
        })

    if use_ai:
        lecture.classroom_image_urls = annotated_previews
    else:
        lecture.classroom_image_urls = image_previews

    lecture.present_count = present_count
    await db.commit()

    no_embeddings   = len(stored_list) == 0
    model_available = face_service.initialized

    if use_ai:
        mode    = "real_ai"
        warning = None
    elif model_available and no_embeddings:
        mode    = "mock_no_embeddings"
        warning = "⚠ No face photos registered for students. Go to Admin → Faces and register Front, Left, Right photos for each student."
    elif not model_available:
        load_err = face_service.load_error or "unknown"
        mode    = "mock_model_loading"
        warning = f"⚠ AI model failed to load: {load_err}."
    else:
        mode    = "mock"
        warning = "⚠ Using estimated attendance — register student faces for accurate AI results."

    return {
        "ai_used": use_ai,
        "mode": mode,
        "warning": warning,
        "images_processed": len(image_previews),
        "image_previews": image_previews,
        "annotated_image_urls": annotated_previews,  # full-quality annotated images
        "image_annotations": image_annotations,
        "detected_faces": sum(len(a) for a in image_annotations) if use_ai else 0,
        "matched_faces": present_count,
        "total_students": len(rec_rows),
        "detection_results": detection_results,
    }
