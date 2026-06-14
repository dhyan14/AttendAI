from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from app.database import get_db
from app.api.deps import get_current_user
from app.models import (
    Department, Student, Subject, Lecture, AttendanceRecord,
    AttendanceStatus, Faculty, User
)

router = APIRouter()


@router.get("/summary")
async def get_reports_summary(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Returns a full attendance summary for the org:
    - Per-department breakdown (students, lectures, present, absent, avg%)
    - Per-subject breakdown
    - Recent lectures (last 10)
    """
    present_case = case((AttendanceRecord.status == AttendanceStatus.present, 1), else_=0)

    # Get all departments in this org
    dept_res = await db.execute(
        select(Department).where(Department.org_id == current_user.org_id)
    )
    depts = dept_res.scalars().all()

    dept_summaries = []
    for dept in depts:
        # Students in dept
        s_q = await db.execute(select(func.count(Student.id)).where(Student.dept_id == dept.id))
        student_count = s_q.scalar() or 0

        # Attendance records for students in this dept
        att_q = await db.execute(
            select(
                func.count(AttendanceRecord.id).label("total"),
                func.sum(present_case).label("present")
            )
            .join(Student, Student.id == AttendanceRecord.student_id)
            .where(Student.dept_id == dept.id)
        )
        att = att_q.first()
        total = att.total or 0
        present = att.present or 0
        avg = round((present / total * 100), 1) if total > 0 else 0.0

        dept_summaries.append({
            "dept_id": str(dept.id),
            "dept_name": dept.name,
            "dept_code": dept.code,
            "student_count": student_count,
            "total_lectures_attendance": total,
            "present_count": present,
            "absent_count": total - present,
            "avg_attendance": avg,
        })

    # Per-subject breakdown
    subj_res = await db.execute(
        select(
            Subject.id,
            Subject.name,
            Subject.code,
            func.count(AttendanceRecord.id).label("total"),
            func.sum(present_case).label("present")
        )
        .join(Lecture, Lecture.subject_id == Subject.id)
        .join(AttendanceRecord, AttendanceRecord.lecture_id == Lecture.id)
        .join(Department, Department.id == Subject.dept_id)
        .where(Department.org_id == current_user.org_id)
        .group_by(Subject.id, Subject.name, Subject.code)
        .order_by(Subject.name)
    )
    subj_rows = subj_res.all()

    subject_summaries = []
    for row in subj_rows:
        total = row.total or 0
        present = row.present or 0
        avg = round((present / total * 100), 1) if total > 0 else 0.0
        subject_summaries.append({
            "subject_id": str(row.id),
            "subject_name": row.name,
            "subject_code": row.code,
            "total_records": total,
            "present_count": present,
            "absent_count": total - present,
            "avg_attendance": avg,
        })

    # Recent 10 lectures (finalized)
    recent_res = await db.execute(
        select(
            Lecture,
            Subject.name.label("subject_name"),
            Subject.code.label("subject_code"),
            Faculty.name.label("faculty_name")
        )
        .join(Subject, Subject.id == Lecture.subject_id)
        .join(Department, Department.id == Subject.dept_id)
        .join(Faculty, Faculty.id == Lecture.faculty_id)
        .where(Department.org_id == current_user.org_id)
        .order_by(Lecture.date.desc())
        .limit(10)
    )
    recent_rows = recent_res.all()

    recent_lectures = [
        {
            "id": str(row.Lecture.id),
            "subject_name": row.subject_name,
            "subject_code": row.subject_code,
            "faculty_name": row.faculty_name,
            "division": row.Lecture.division,
            "batch": row.Lecture.batch,
            "date": row.Lecture.date.strftime("%Y-%m-%d"),
            "status": row.Lecture.status.value,
            "total_students": row.Lecture.total_students,
            "present_count": row.Lecture.present_count,
            "absent_count": (row.Lecture.total_students or 0) - (row.Lecture.present_count or 0),
            "attendance_pct": round(
                (row.Lecture.present_count / row.Lecture.total_students * 100), 1
            ) if row.Lecture.total_students else 0.0,
        }
        for row in recent_rows
    ]

    return {
        "departments": dept_summaries,
        "subjects": subject_summaries,
        "recent_lectures": recent_lectures,
    }


@router.get("/attendance")
async def get_attendance_report(current_user=Depends(get_current_user)):
    """Legacy stub — use /reports/summary instead."""
    return {"status": "use /reports/summary"}
