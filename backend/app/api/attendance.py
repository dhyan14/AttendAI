from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid
import base64

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
        # Try to find the dept via org — pick first dept in their org
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
    if req.division:
        students_query = students_query.where(Student.division == req.division)
    if req.batch and req.batch != "All":
        students_query = students_query.where(Student.batch == req.batch)

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
        records=records
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
        was_present   = record.status == AttendanceStatus.present
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


# ─── AI Attendance (real face recognition) ─────────────────


@router.post("/take-ai")
async def take_attendance_ai(
    lecture_id: str = Form(...),
    files: List[UploadFile] = File(...),   # up to 5 classroom images
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_faculty)
):
    """
    Take AI-based attendance using real face recognition.

    Accepts up to 5 classroom photos. For each photo:
      1. Run InsightFace to detect all faces and extract 512-dim embeddings.
      2. Cosine-similarity match against all enrolled students' face embeddings.
      3. Mark student present if best match confidence >= 0.45.

    Falls back to deterministic mock (80% attendance) if InsightFace is unavailable.
    """
    from app.services.face_service import face_service
    import random

    # ── Validate lecture ──────────────────────────────────────────────────
    try:
        lec_uuid = uuid.UUID(lecture_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid lecture_id format")

    lec_res = await db.execute(select(Lecture).where(Lecture.id == lec_uuid))
    lecture = lec_res.scalar_one_or_none()
    if not lecture:
        raise HTTPException(status_code=404, detail="Lecture not found")

    if not files:
        raise HTTPException(status_code=400, detail="No images provided")
    files = files[:5]   # cap at 5

    # ── Load attendance records + student info ───────────────────────────
    rec_res = await db.execute(
        select(AttendanceRecord, Student.name.label("student_name"), Student.roll_no.label("roll_no"))
        .join(Student, Student.id == AttendanceRecord.student_id)
        .where(AttendanceRecord.lecture_id == lec_uuid)
        .order_by(Student.roll_no)
    )
    rec_rows = rec_res.all()
    if not rec_rows:
        raise HTTPException(status_code=404, detail="No students enrolled for this lecture")

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
            # pgvector returns numpy arrays — convert to list and check for placeholder zeros
            emb_list = fe.embedding.tolist() if hasattr(fe.embedding, "tolist") else list(fe.embedding)
            if any(v != 0.0 for v in emb_list):
                stored_list.append({"student_id": str(fe.student_id), "embedding": emb_list})
        except Exception:
            pass  # skip malformed embeddings


    # ── AI Mode vs. Mock Mode ────────────────────────────────────────────
    use_ai = face_service.initialized and len(stored_list) > 0

    detected_student_ids: set[str] = set()
    image_previews: list[str] = []
    ai_confidences: dict[str, float] = {}   # student_id → confidence

    if use_ai:
        # Real InsightFace recognition
        for upload in files:
            raw = await upload.read()
            if not raw:
                continue
            # thumbnail for preview
            try:
                from PIL import Image
                import io as _io
                img_pil = Image.open(_io.BytesIO(raw)).convert("RGB")
                img_pil.thumbnail((480, 360))
                buf = _io.BytesIO()
                img_pil.save(buf, format="JPEG", quality=60)
                b64 = base64.b64encode(buf.getvalue()).decode()
                image_previews.append(f"data:image/jpeg;base64,{b64}")
            except Exception:
                pass

            try:
                probe_embeddings_raw = face_service.get_embeddings(raw)
                probe_vecs = [emb for (_bbox, emb) in probe_embeddings_raw]
                matches = face_service.match_faces(probe_vecs, stored_list, threshold=0.45)
                for m in matches:
                    sid = m["student_id"]
                    conf = m["confidence"]
                    # keep highest confidence across all photos
                    if sid not in ai_confidences or conf > ai_confidences[sid]:
                        ai_confidences[sid] = conf
                        detected_student_ids.add(sid)
            except Exception as e:
                print(f"[AI] Recognition error on image: {e}")
                # continue with other images

    else:
        # ── Mock fallback ─────────────────────────────────────────────────
        # Read all files for previews only
        total_size = 0
        for upload in files:
            raw = await upload.read()
            total_size += len(raw)
            try:
                from PIL import Image
                import io as _io
                img_pil = Image.open(_io.BytesIO(raw)).convert("RGB")
                img_pil.thumbnail((480, 360))
                buf = _io.BytesIO()
                img_pil.save(buf, format="JPEG", quality=60)
                b64 = base64.b64encode(buf.getvalue()).decode()
                image_previews.append(f"data:image/jpeg;base64,{b64}")
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

    lecture.present_count = present_count
    await db.commit()

    no_embeddings   = len(stored_list) == 0
    model_available = face_service.initialized

    if use_ai:
        mode    = "real_ai"
        warning = None
    elif model_available and no_embeddings:
        mode    = "mock_no_embeddings"
        warning = "⚠ No face photos registered for students in this class. Go to Admin → Faces and register Front, Left, Right photos for each student first."
    elif not model_available:
        mode    = "mock_model_loading"
        warning = "⚠ AI model is still loading (first deploy takes ~60s). Refresh and try again — or results here are estimated."
    else:
        mode    = "mock"
        warning = "⚠ Using estimated attendance — register student faces for accurate AI results."

    return {
        "ai_used": use_ai,
        "mode": mode,
        "warning": warning,
        "images_processed": len(image_previews),
        "image_previews": image_previews,
        "detected_faces": present_count,
        "total_students": len(rec_rows),
        "detection_results": detection_results,
    }

