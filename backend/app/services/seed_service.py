from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
import bcrypt
import uuid
from app.models import (
    Organization, Department, User, UserRole, Faculty, Subject, Student,
    Lecture, LectureStatus, AttendanceRecord, AttendanceStatus, AttendanceSource,
    AttendanceDispute, DisputeStatus, FaceEmbedding
)

async def seed_database(db: AsyncSession):
    """Auto-seeds database with organizations, departments, faculty, subjects, students, lectures, and disputes if empty."""
    # ─── 1. Seed Organization ──────────────────────────────────
    org_result = await db.execute(select(Organization).limit(1))
    org = org_result.scalar_one_or_none()
    if not org:
        org = Organization(
            name="Sardar Vallabhbhai Global University",
            code="SVGU",
            settings={"minAttendancePercent": 75}
        )
        db.add(org)
        await db.commit()
        await db.refresh(org)
        print("[SEED] Seeded organization 'Sardar Vallabhbhai Global University'")
    else:
        print(f"[SEED] Organization found: {org.name}")

    # ─── 2. Seed Departments ───────────────────────────────────
    dept_result = await db.execute(select(Department).limit(1))
    depts = []
    if not dept_result.scalar_one_or_none():
        depts_data = [
            {"name": "Computer Science & Engineering", "code": "CSE", "institute_name": "Institute of Technology"},
            {"name": "Information Technology", "code": "IT", "institute_name": "Institute of Technology"},
            {"name": "Electronics & Communication", "code": "ECE", "institute_name": "Institute of Technology"},
            {"name": "Mechanical Engineering", "code": "ME", "institute_name": "Institute of Technology"},
        ]
        for d in depts_data:
            dept = Department(
                org_id=org.id,
                name=d["name"],
                code=d["code"],
                institute_name=d["institute_name"]
            )
            db.add(dept)
            depts.append(dept)
        await db.commit()
        for d in depts:
            await db.refresh(d)
        print("[SEED] Seeded 4 default departments")
    else:
        depts_res = await db.execute(select(Department).where(Department.org_id == org.id))
        depts = list(depts_res.scalars().all())
        print(f"[SEED] {len(depts)} departments found")

    # ─── 3. Seed Faculty ───────────────────────────────────────
    faculty_list = []
    faculty_user_result = await db.execute(select(User).where(User.email == "jaimin@svgu.edu"))
    user_fac = faculty_user_result.scalar_one_or_none()
    
    if not user_fac:
        salt = bcrypt.gensalt()
        password_hash = bcrypt.hashpw(b"Faculty@123", salt).decode("utf-8")
        user_fac = User(
            email="jaimin@svgu.edu",
            password_hash=password_hash,
            role=UserRole.faculty,
            org_id=org.id,
            is_active=True
        )
        db.add(user_fac)
        await db.commit()
        await db.refresh(user_fac)

        fac = Faculty(
            user_id=user_fac.id,
            name="Dr. Jaimin Patel",
            designation="Professor",
            dept_id=depts[0].id
        )
        db.add(fac)
        await db.commit()
        await db.refresh(fac)
        faculty_list.append(fac)
        print("[SEED] Seeded faculty user 'jaimin@svgu.edu'")
    else:
        fac_res = await db.execute(select(Faculty).where(Faculty.user_id == user_fac.id))
        fac = fac_res.scalar_one_or_none()
        if fac:
            faculty_list.append(fac)

    # ─── 4. Seed Subjects ──────────────────────────────────────
    subjects_list = []
    subjects_data = [
        {"name": "Data Structures", "code": "CSE-301", "semester": 3, "dept_index": 0},
        {"name": "Engineering Mathematics 4", "code": "M4", "semester": 4, "dept_index": 0},
        {"name": "Database Management Systems", "code": "CSE-402", "semester": 4, "dept_index": 0},
    ]
    for s in subjects_data:
        subj_result = await db.execute(select(Subject).where(Subject.code == s["code"]))
        subj = subj_result.scalar_one_or_none()
        if not subj:
            subj = Subject(
                name=s["name"],
                code=s["code"],
                dept_id=depts[s["dept_index"]].id,
                semester=s["semester"]
            )
            db.add(subj)
            await db.commit()
            await db.refresh(subj)
            subjects_list.append(subj)
        else:
            subjects_list.append(subj)
    print(f"[SEED] {len(subjects_list)} subjects loaded/seeded")

    # ─── 5. Seed Students ──────────────────────────────────────
    student_result = await db.execute(select(Student).limit(1))
    students_list = []
    if not student_result.scalar_one_or_none():
        students_data = [
            {"name": "Rahul Sharma", "roll_no": "CS001", "email": "rahul@svgu.edu", "div": "A", "batch": "B1", "sem": 4},
            {"name": "Priya Patel",  "roll_no": "CS002", "email": "priya@svgu.edu",  "div": "A", "batch": "B2", "sem": 4},
            {"name": "Amit Patel",   "roll_no": "CS003", "email": "amit@svgu.edu",   "div": "A", "batch": "B1", "sem": 4},
            {"name": "Sneha Shah",   "roll_no": "CS004", "email": "sneha@svgu.edu",  "div": "A", "batch": "B2", "sem": 4},
            {"name": "Rohan Mehta",  "roll_no": "CS005", "email": "rohan@svgu.edu",  "div": "A", "batch": "B1", "sem": 4},
        ]
        
        salt = bcrypt.gensalt()
        password_hash = bcrypt.hashpw(b"Student@123", salt).decode("utf-8")
        
        for sd in students_data:
            # Create user
            user = User(
                email=sd["email"],
                password_hash=password_hash,
                role=UserRole.student,
                org_id=org.id,
                is_active=True
            )
            db.add(user)
            await db.flush()
            
            # Create student
            student = Student(
                user_id=user.id,
                roll_no=sd["roll_no"],
                enrollment_no=f"EN2024{sd['roll_no']}",
                name=sd["name"],
                division=sd["div"],
                batch=sd["batch"],
                semester=sd["sem"],
                dept_id=depts[0].id
            )
            db.add(student)
            students_list.append(student)
            
            # Seed dummy 512-dim face embedding for pgvector
            dummy_embedding = [0.0] * 512
            dummy_embedding[0] = 1.0 # arbitrary non-zero embedding
            face_emb = FaceEmbedding(
                student_id=student.id,
                embedding=dummy_embedding,
                angle="front",
                image_url="https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&fit=crop"
            )
            db.add(face_emb)
            
        await db.commit()
        for s in students_list:
            await db.refresh(s)
        print(f"[SEED] Seeded {len(students_list)} students with face embeddings")
    else:
        students_res = await db.execute(select(Student))
        students_list = list(students_res.scalars().all())
        print(f"[SEED] {len(students_list)} existing students loaded")

    # ─── 6. Seed Lectures & Attendance Records ─────────────────
    lecture_result = await db.execute(select(Lecture).limit(1))
    lectures_list = []
    if not lecture_result.scalar_one_or_none() and students_list and faculty_list and subjects_list:
        # Create 5 historical lectures for Data Structures and Mathematics
        now = datetime.utcnow()
        lecture_dates = [
            now - timedelta(days=5),
            now - timedelta(days=4),
            now - timedelta(days=3),
            now - timedelta(days=2),
            now - timedelta(days=1),
        ]
        
        # We will seed 5 lectures
        for idx, date in enumerate(lecture_dates):
            subject = subjects_list[idx % len(subjects_list)]
            faculty = faculty_list[0]
            
            lecture = Lecture(
                subject_id=subject.id,
                faculty_id=faculty.id,
                division="A",
                batch="All",
                lecture_no=idx + 1,
                date=date,
                status=LectureStatus.finalized if idx < 4 else LectureStatus.pending,
                mode="ai",
                total_students=len(students_list),
                present_count=len(students_list) - 1 # 1 absent per lecture
            )
            db.add(lecture)
            await db.flush()
            lectures_list.append(lecture)

            # Seed attendance records for this lecture
            for s_idx, student in enumerate(students_list):
                # Make 1 student absent in each lecture to create interesting statistics
                is_present = s_idx != (idx % len(students_list))
                
                record = AttendanceRecord(
                    lecture_id=lecture.id,
                    student_id=student.id,
                    subject_id=subject.id,
                    status=AttendanceStatus.present if is_present else AttendanceStatus.absent,
                    source=AttendanceSource.auto,
                    confidence=0.92 if is_present else 0.12
                )
                db.add(record)
        
        await db.commit()
        print(f"[SEED] Seeded {len(lectures_list)} lectures and their attendance records")
    else:
        print("[SEED] Lectures or attendance records already exist")

    # ─── 7. Seed Disputes ──────────────────────────────────────
    dispute_result = await db.execute(select(AttendanceDispute).limit(1))
    if not dispute_result.scalar_one_or_none() and students_list and lectures_list:
        # Create an open dispute: Student Rahul Sharma (CS001) disputes math lecture (lecture_no: 2)
        # Find an absent record for Rahul Sharma
        absent_record_res = await db.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.student_id == students_list[0].id,
                AttendanceRecord.status == AttendanceStatus.absent
            ).limit(1)
        )
        absent_record = absent_record_res.scalar_one_or_none()
        
        if absent_record:
            dispute = AttendanceDispute(
                student_id=students_list[0].id,
                lecture_id=absent_record.lecture_id,
                reason="I was present in the class and sitting on the 3rd row, but the camera did not capture my face properly due to lighting.",
                status=DisputeStatus.open
            )
            db.add(dispute)
            await db.commit()
            print("[SEED] Seeded 1 open attendance dispute for Rahul Sharma")
        else:
            # Fallback if no absent records are matched
            dispute = AttendanceDispute(
                student_id=students_list[0].id,
                lecture_id=lectures_list[0].id,
                reason="I was present in the class, but marked absent.",
                status=DisputeStatus.open
            )
            db.add(dispute)
            await db.commit()
            print("[SEED] Seeded 1 fallback open attendance dispute")
