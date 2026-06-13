from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import bcrypt
from app.models import Organization, Department, User, UserRole, Faculty, Subject, Student

async def seed_database(db: AsyncSession):
    """Auto-seeds database with organizations, departments, faculty, and subjects if empty."""
    # 1. Seed Organization
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

    # 2. Seed Departments
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
        # Load existing depts
        depts_res = await db.execute(select(Department).where(Department.org_id == org.id))
        depts = list(depts_res.scalars().all())
        print(f"[SEED] {len(depts)} departments found")

    # 3. Seed Faculty
    if depts:
        faculty_user_result = await db.execute(select(User).where(User.email == "jaimin@svgu.edu"))
        if not faculty_user_result.scalar_one_or_none():
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
            print("[SEED] Seeded faculty user 'jaimin@svgu.edu'")

    # 4. Seed Subjects
    if depts:
        subjects_data = [
            {"name": "Data Structures", "code": "CSE-301", "semester": 3, "dept_index": 0},
            {"name": "Engineering Mathematics 4", "code": "M4", "semester": 4, "dept_index": 0},
            {"name": "Database Management Systems", "code": "CSE-402", "semester": 4, "dept_index": 0},
        ]
        seeded_subjects = 0
        for s in subjects_data:
            subj_result = await db.execute(select(Subject).where(Subject.code == s["code"]))
            if not subj_result.scalar_one_or_none():
                subj = Subject(
                    name=s["name"],
                    code=s["code"],
                    dept_id=depts[s["dept_index"]].id,
                    semester=s["semester"]
                )
                db.add(subj)
                seeded_subjects += 1
        if seeded_subjects > 0:
            await db.commit()
            print(f"[SEED] Seeded {seeded_subjects} default subjects")
