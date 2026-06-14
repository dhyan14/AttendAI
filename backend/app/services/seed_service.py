from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from datetime import datetime, timedelta
import bcrypt
import uuid
from app.models import (
    Organization, Department, User, UserRole, Faculty, Subject, Student,
    Lecture, LectureStatus, AttendanceRecord, AttendanceStatus, AttendanceSource,
    AttendanceDispute, DisputeStatus, FaceEmbedding, SubjectAssignment
)


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def seed_database(db: AsyncSession):
    """
    Full reset seed:
    - Drops all user / student / faculty / lecture / attendance data
    - Re-creates one org, 4 departments, 3 subjects
    - Creates exactly 5 users — one per role — with clean passwords
    - Seeds sample lectures, attendance records, and one dispute
    """

    # ─── 0. Wipe all existing data (order matters for FK constraints) ──
    existing_users = await db.execute(select(User).limit(1))
    if existing_users.scalar_one_or_none():
        print("[SEED] Wiping existing data for clean re-seed...")
        await db.execute(text("DELETE FROM attendance_disputes"))
        await db.execute(text("DELETE FROM attendance_evidence"))
        await db.execute(text("DELETE FROM attendance_records"))
        await db.execute(text("DELETE FROM lectures"))
        await db.execute(text("DELETE FROM subject_assignments"))
        await db.execute(text("DELETE FROM subjects"))
        await db.execute(text("DELETE FROM face_embeddings"))
        await db.execute(text("DELETE FROM students"))
        await db.execute(text("DELETE FROM faculty"))
        await db.execute(text("DELETE FROM users"))
        await db.execute(text("DELETE FROM departments"))
        await db.execute(text("DELETE FROM organizations"))
        await db.execute(text("DELETE FROM audit_logs"))
        await db.commit()
        print("[SEED] All data wiped successfully.")

    # ─── 1. Organization ───────────────────────────────────────────────
    org = Organization(
        name="Sardar Vallabhbhai Global University",
        code="SVGU",
        settings={"minAttendancePercent": 75}
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)
    print(f"[SEED] Organization created: {org.name}")

    # ─── 2. Departments ────────────────────────────────────────────────
    dept_data = [
        {"name": "Computer Science & Engineering", "code": "CSE", "institute_name": "Institute of Technology"},
        {"name": "Information Technology",         "code": "IT",  "institute_name": "Institute of Technology"},
        {"name": "Electronics & Communication",    "code": "ECE", "institute_name": "Institute of Technology"},
        {"name": "Mechanical Engineering",         "code": "ME",  "institute_name": "Institute of Technology"},
    ]
    depts = []
    for d in dept_data:
        dept = Department(org_id=org.id, name=d["name"], code=d["code"], institute_name=d["institute_name"])
        db.add(dept)
        depts.append(dept)
    await db.commit()
    for d in depts:
        await db.refresh(d)
    cse = depts[0]
    print(f"[SEED] {len(depts)} departments created")

    # ─── 3. ROLE 1 — Super Admin ───────────────────────────────────────
    user_super = User(
        email="superadmin@attendai.com",
        password_hash=_hash("SuperAdmin@123"),
        role=UserRole.super_admin,
        org_id=org.id,
        is_active=True,
    )
    db.add(user_super)
    await db.commit()
    await db.refresh(user_super)
    print("[SEED] Created super admin: superadmin@attendai.com / SuperAdmin@123")

    # ─── 4. ROLE 2 — Org Admin ────────────────────────────────────────
    user_org_admin = User(
        email="admin@svgu.edu",
        password_hash=_hash("OrgAdmin@123"),
        role=UserRole.org_admin,
        org_id=org.id,
        is_active=True,
    )
    db.add(user_org_admin)
    await db.commit()
    await db.refresh(user_org_admin)
    print("[SEED] Created org admin: admin@svgu.edu / OrgAdmin@123")

    # ─── 5. ROLE 3 — Department Admin ─────────────────────────────────
    user_dept_admin = User(
        email="deptadmin@svgu.edu",
        password_hash=_hash("DeptAdmin@123"),
        role=UserRole.dept_admin,
        org_id=org.id,
        is_active=True,
    )
    db.add(user_dept_admin)
    # Create faculty profile for dept admin (they are head of CSE)
    fac_dept_admin = Faculty(
        user_id=None,  # will set after flush
        name="Prof. Rakesh Shah",
        designation="Head of Department",
        dept_id=cse.id,
    )
    db.add(user_dept_admin)
    await db.flush()
    fac_dept_admin.user_id = user_dept_admin.id
    db.add(fac_dept_admin)
    await db.commit()
    await db.refresh(user_dept_admin)
    await db.refresh(fac_dept_admin)
    print("[SEED] Created dept admin: deptadmin@svgu.edu / DeptAdmin@123")

    # ─── 6. ROLE 4 — Faculty ──────────────────────────────────────────
    user_faculty = User(
        email="faculty@svgu.edu",
        password_hash=_hash("Faculty@123"),
        role=UserRole.faculty,
        org_id=org.id,
        is_active=True,
    )
    db.add(user_faculty)
    await db.flush()

    fac = Faculty(
        user_id=user_faculty.id,
        name="Dr. Jaimin Patel",
        designation="Professor",
        dept_id=cse.id,
    )
    db.add(fac)
    await db.commit()
    await db.refresh(user_faculty)
    await db.refresh(fac)
    print("[SEED] Created faculty: faculty@svgu.edu / Faculty@123")

    # ─── 7. Subjects ──────────────────────────────────────────────────
    subjects_data = [
        {"name": "Data Structures",              "code": "CSE-301", "semester": 3},
        {"name": "Database Management Systems",  "code": "CSE-402", "semester": 4},
        {"name": "Engineering Mathematics 4",    "code": "M4",      "semester": 4},
    ]
    subjects_list = []
    for s in subjects_data:
        subj = Subject(name=s["name"], code=s["code"], dept_id=cse.id, semester=s["semester"])
        db.add(subj)
        subjects_list.append(subj)
    await db.commit()
    for s in subjects_list:
        await db.refresh(s)

    # Faculty subject assignments
    for subj in subjects_list:
        assign = SubjectAssignment(
            subject_id=subj.id,
            faculty_id=fac.id,
            division="A",
            batch="All",
            semester=subj.semester,
        )
        db.add(assign)
    await db.commit()
    print(f"[SEED] {len(subjects_list)} subjects created and assigned to faculty")

    # ─── 8. ROLE 5 — Student ──────────────────────────────────────────
    user_student = User(
        email="student@svgu.edu",
        password_hash=_hash("Student@123"),
        role=UserRole.student,
        org_id=org.id,
        is_active=True,
    )
    db.add(user_student)
    await db.flush()

    student = Student(
        user_id=user_student.id,
        roll_no="CS001",
        enrollment_no="EN2024CS001",
        name="Rahul Sharma",
        division="A",
        batch="B1",
        semester=4,
        dept_id=cse.id,
    )
    db.add(student)
    await db.flush()

    # Dummy face embedding
    dummy_emb = [0.0] * 512
    dummy_emb[0] = 1.0
    face_emb = FaceEmbedding(
        student_id=student.id,
        embedding=dummy_emb,
        angle="front",
        image_url="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&fit=crop",
    )
    db.add(face_emb)
    await db.commit()
    await db.refresh(user_student)
    await db.refresh(student)
    print("[SEED] Created student: student@svgu.edu / Student@123 (Rahul Sharma / CS001)")

    # Also seed 4 more students (no login accounts) for realistic attendance data
    extra_students_data = [
        {"name": "Priya Patel",  "roll_no": "CS002", "div": "A", "batch": "B2"},
        {"name": "Amit Patel",   "roll_no": "CS003", "div": "A", "batch": "B1"},
        {"name": "Sneha Shah",   "roll_no": "CS004", "div": "A", "batch": "B2"},
        {"name": "Rohan Mehta",  "roll_no": "CS005", "div": "A", "batch": "B1"},
    ]
    extra_students = [student]
    for es in extra_students_data:
        s = Student(
            user_id=None,
            roll_no=es["roll_no"],
            enrollment_no=f"EN2024{es['roll_no']}",
            name=es["name"],
            division=es["div"],
            batch=es["batch"],
            semester=4,
            dept_id=cse.id,
        )
        db.add(s)
        extra_students.append(s)
    await db.commit()
    for s in extra_students:
        await db.refresh(s)
    print(f"[SEED] {len(extra_students)} total students in CSE/Div-A")

    # ─── 9. Lectures & Attendance Records ─────────────────────────────
    all_students = extra_students
    now = datetime.utcnow()
    lecture_dates = [
        now - timedelta(days=5),
        now - timedelta(days=4),
        now - timedelta(days=3),
        now - timedelta(days=2),
        now - timedelta(days=1),
    ]

    lectures_list = []
    for idx, date in enumerate(lecture_dates):
        subject = subjects_list[idx % len(subjects_list)]
        lecture = Lecture(
            subject_id=subject.id,
            faculty_id=fac.id,
            division="A",
            batch="All",
            lecture_no=idx + 1,
            date=date,
            status=LectureStatus.finalized if idx < 4 else LectureStatus.pending,
            mode="ai",
            total_students=len(all_students),
            present_count=len(all_students) - 1,
        )
        db.add(lecture)
        await db.flush()
        lectures_list.append(lecture)

        for s_idx, stud in enumerate(all_students):
            is_present = s_idx != (idx % len(all_students))
            record = AttendanceRecord(
                lecture_id=lecture.id,
                student_id=stud.id,
                subject_id=subject.id,
                status=AttendanceStatus.present if is_present else AttendanceStatus.absent,
                source=AttendanceSource.auto,
                confidence=0.92 if is_present else 0.12,
            )
            db.add(record)

    await db.commit()
    print(f"[SEED] {len(lectures_list)} lectures seeded with attendance records")

    # ─── 10. Sample Dispute ───────────────────────────────────────────
    absent_res = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.student_id == student.id,
            AttendanceRecord.status == AttendanceStatus.absent,
        ).limit(1)
    )
    absent_record = absent_res.scalar_one_or_none()
    if absent_record:
        dispute = AttendanceDispute(
            student_id=student.id,
            lecture_id=absent_record.lecture_id,
            reason="I was present in the class on 3rd row but the camera missed my face due to poor lighting.",
            status=DisputeStatus.open,
        )
        db.add(dispute)
        await db.commit()
        print("[SEED] 1 open dispute seeded for Rahul Sharma (CS001)")

    print("\n" + "=" * 55)
    print("  ATTENDAI — FRESH SEED COMPLETE")
    print("=" * 55)
    print(f"  Org:         Sardar Vallabhbhai Global University")
    print(f"  Departments: CSE, IT, ECE, ME")
    print(f"  Students:    {len(all_students)} (5 in CSE Div-A)")
    print("=" * 55)
    print("  LOGIN CREDENTIALS")
    print("-" * 55)
    print(f"  Super Admin:  superadmin@attendai.com / SuperAdmin@123")
    print(f"  Org Admin:    admin@svgu.edu          / OrgAdmin@123")
    print(f"  Dept Admin:   deptadmin@svgu.edu      / DeptAdmin@123")
    print(f"  Faculty:      faculty@svgu.edu         / Faculty@123")
    print(f"  Student:      student@svgu.edu          / Student@123")
    print("=" * 55 + "\n")
