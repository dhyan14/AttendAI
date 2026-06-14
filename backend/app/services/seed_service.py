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
    - Wipes all data using TRUNCATE ... CASCADE (safe for FK constraints)
    - Re-creates org, 4 depts, 3 subjects, 5 students, 5 lectures, 1 dispute
    - Creates exactly 5 login accounts — one per role
    """
    # ─── 0. Wipe all existing data ─────────────────────────────────────
    existing = await db.execute(select(User).limit(1))
    if existing.scalar_one_or_none():
        print("[SEED] Wiping existing data...")
        # TRUNCATE with CASCADE handles all FK constraints in one shot
        await db.execute(text("""
            TRUNCATE
                audit_logs,
                attendance_disputes,
                attendance_evidence,
                attendance_records,
                lectures,
                subject_assignments,
                subjects,
                face_embeddings,
                students,
                faculty,
                users,
                departments,
                organizations
            RESTART IDENTITY CASCADE
        """))
        await db.commit()
        print("[SEED] All data wiped via TRUNCATE CASCADE.")

    # ─── 1. Organization ───────────────────────────────────────────────
    org = Organization(
        name="Sardar Vallabhbhai Global University",
        code="SVGU",
        settings={"minAttendancePercent": 75}
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)

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

    # ─── 3. ROLE 1: Super Admin ────────────────────────────────────────
    user_super = User(
        email="superadmin@attendai.com",
        password_hash=_hash("SuperAdmin@123"),
        role=UserRole.super_admin,
        org_id=org.id,
        is_active=True,
    )
    db.add(user_super)
    await db.commit()

    # ─── 4. ROLE 2: Org Admin ─────────────────────────────────────────
    user_org_admin = User(
        email="admin@svgu.edu",
        password_hash=_hash("OrgAdmin@123"),
        role=UserRole.org_admin,
        org_id=org.id,
        is_active=True,
    )
    db.add(user_org_admin)
    await db.commit()

    # ─── 5. ROLE 3: Dept Admin (also has faculty profile) ─────────────
    user_dept_admin = User(
        email="deptadmin@svgu.edu",
        password_hash=_hash("DeptAdmin@123"),
        role=UserRole.dept_admin,
        org_id=org.id,
        is_active=True,
    )
    db.add(user_dept_admin)
    await db.flush()
    fac_dept_admin = Faculty(
        user_id=user_dept_admin.id,
        name="Prof. Rakesh Shah",
        designation="Head of Department",
        dept_id=cse.id,
    )
    db.add(fac_dept_admin)
    await db.commit()
    await db.refresh(fac_dept_admin)

    # ─── 6. ROLE 4: Faculty ───────────────────────────────────────────
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

    # ─── 7. Subjects + Assignments ────────────────────────────────────
    subjects_data = [
        {"name": "Data Structures",             "code": "CSE-301", "semester": 3},
        {"name": "Database Management Systems", "code": "CSE-402", "semester": 4},
        {"name": "Engineering Mathematics 4",   "code": "M4",      "semester": 4},
    ]
    subjects_list = []
    for s in subjects_data:
        subj = Subject(name=s["name"], code=s["code"], dept_id=cse.id, semester=s["semester"])
        db.add(subj)
        subjects_list.append(subj)
    await db.flush()
    for s in subjects_list:
        db.add(SubjectAssignment(subject_id=s.id, faculty_id=fac.id, division="A", batch="All", semester=s.semester))
    await db.commit()
    for s in subjects_list:
        await db.refresh(s)

    # ─── 8. ROLE 5: Student ───────────────────────────────────────────
    user_student = User(
        email="student@svgu.edu",
        password_hash=_hash("Student@123"),
        role=UserRole.student,
        org_id=org.id,
        is_active=True,
    )
    db.add(user_student)
    await db.flush()

    student_primary = Student(
        user_id=user_student.id,
        roll_no="CS001",
        enrollment_no="EN2024CS001",
        name="Rahul Sharma",
        division="A", batch="B1", semester=4,
        dept_id=cse.id,
    )
    db.add(student_primary)
    await db.flush()

    dummy_emb = [0.0] * 512
    dummy_emb[0] = 1.0
    db.add(FaceEmbedding(student_id=student_primary.id, embedding=dummy_emb, angle="front"))
    await db.commit()
    await db.refresh(student_primary)

    # 4 extra students (no login) for realistic attendance data
    extra_data = [
        {"name": "Priya Patel",  "roll": "CS002", "div": "A", "batch": "B2"},
        {"name": "Amit Patel",   "roll": "CS003", "div": "A", "batch": "B1"},
        {"name": "Sneha Shah",   "roll": "CS004", "div": "A", "batch": "B2"},
        {"name": "Rohan Mehta",  "roll": "CS005", "div": "A", "batch": "B1"},
    ]
    all_students = [student_primary]
    for es in extra_data:
        s = Student(
            user_id=None, roll_no=es["roll"],
            enrollment_no=f"EN2024{es['roll']}", name=es["name"],
            division=es["div"], batch=es["batch"], semester=4, dept_id=cse.id,
        )
        db.add(s)
        all_students.append(s)
    await db.commit()
    for s in all_students:
        await db.refresh(s)

    # ─── 9. Lectures & Attendance ─────────────────────────────────────
    now = datetime.utcnow()
    lectures_list = []
    for idx in range(5):
        date = now - timedelta(days=5 - idx)
        subject = subjects_list[idx % len(subjects_list)]
        lecture = Lecture(
            subject_id=subject.id, faculty_id=fac.id,
            division="A", batch="All", lecture_no=idx + 1, date=date,
            status=LectureStatus.finalized if idx < 4 else LectureStatus.pending,
            mode="ai", total_students=len(all_students), present_count=len(all_students) - 1,
        )
        db.add(lecture)
        await db.flush()
        lectures_list.append(lecture)
        for s_idx, stud in enumerate(all_students):
            is_present = s_idx != (idx % len(all_students))
            db.add(AttendanceRecord(
                lecture_id=lecture.id, student_id=stud.id, subject_id=subject.id,
                status=AttendanceStatus.present if is_present else AttendanceStatus.absent,
                source=AttendanceSource.auto, confidence=0.92 if is_present else 0.12,
            ))
    await db.commit()

    # ─── 10. Open Dispute ─────────────────────────────────────────────
    absent_res = await db.execute(
        select(AttendanceRecord).where(
            AttendanceRecord.student_id == student_primary.id,
            AttendanceRecord.status == AttendanceStatus.absent,
        ).limit(1)
    )
    absent_rec = absent_res.scalar_one_or_none()
    if absent_rec:
        db.add(AttendanceDispute(
            student_id=student_primary.id, lecture_id=absent_rec.lecture_id,
            reason="I was present in class on row 3, but the camera missed my face due to lighting.",
            status=DisputeStatus.open,
        ))
        await db.commit()

    # ─── Done — Print credentials ──────────────────────────────────────
    print("\n" + "=" * 58)
    print("  ATTENDAI — DATABASE SEEDED SUCCESSFULLY")
    print("=" * 58)
    print("  Org: Sardar Vallabhbhai Global University (SVGU)")
    print("  Depts: CSE, IT, ECE, ME  |  Students: 5  |  Lectures: 5")
    print("-" * 58)
    print("  ROLE           EMAIL                    PASSWORD")
    print("-" * 58)
    print("  super_admin    superadmin@attendai.com  SuperAdmin@123")
    print("  org_admin      admin@svgu.edu           OrgAdmin@123")
    print("  dept_admin     deptadmin@svgu.edu       DeptAdmin@123")
    print("  faculty        faculty@svgu.edu          Faculty@123")
    print("  student        student@svgu.edu           Student@123")
    print("=" * 58 + "\n")
