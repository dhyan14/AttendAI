import uuid
import enum
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer, Float,
    ForeignKey, Enum, Text, ARRAY, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.database import Base


# ─── Enums ─────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    student = "student"
    faculty = "faculty"
    dept_admin = "dept_admin"
    org_admin = "org_admin"
    super_admin = "super_admin"


class AttendanceStatus(str, enum.Enum):
    present = "present"
    absent = "absent"


class AttendanceSource(str, enum.Enum):
    auto = "auto"
    manual = "manual"


class LectureStatus(str, enum.Enum):
    pending = "pending"
    finalized = "finalized"


class DisputeStatus(str, enum.Enum):
    open = "open"
    resolved = "resolved"
    rejected = "rejected"


# ─── Organization ──────────────────────────────────────────

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    settings = Column(JSON, default={"minAttendancePercent": 75})
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    departments = relationship("Department", back_populates="organization")
    users = relationship("User", back_populates="organization")


# ─── Department ────────────────────────────────────────────

class Department(Base):
    __tablename__ = "departments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=False)
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)
    institute_name = Column(String)

    organization = relationship("Organization", back_populates="departments")
    students = relationship("Student", back_populates="department")
    faculty = relationship("Faculty", back_populates="department")
    subjects = relationship("Subject", back_populates="department")


# ─── User ──────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id"))
    is_active = Column(Boolean, default=True)
    fcm_token = Column(String)  # Firebase push notification token
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    organization = relationship("Organization", back_populates="users")
    student = relationship("Student", back_populates="user", uselist=False)
    faculty_profile = relationship("Faculty", back_populates="user", uselist=False)


# ─── Student ───────────────────────────────────────────────

class Student(Base):
    __tablename__ = "students"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    roll_no = Column(String, nullable=False)
    enrollment_no = Column(String)
    name = Column(String, nullable=False)
    division = Column(String)   # 'A', 'B', 'C'
    batch = Column(String)      # 'All', 'B1', 'B2'
    semester = Column(Integer)
    dept_id = Column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False)
    profile_image_url = Column(String)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    user = relationship("User", back_populates="student")
    department = relationship("Department", back_populates="students")
    face_embeddings = relationship("FaceEmbedding", back_populates="student")
    attendance_records = relationship("AttendanceRecord", back_populates="student")


# ─── Faculty ───────────────────────────────────────────────

class Faculty(Base):
    __tablename__ = "faculty"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    name = Column(String, nullable=False)
    designation = Column(String)
    dept_id = Column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    user = relationship("User", back_populates="faculty_profile")
    department = relationship("Department", back_populates="faculty")
    lectures = relationship("Lecture", back_populates="faculty")


# ─── Subject ───────────────────────────────────────────────

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)
    dept_id = Column(UUID(as_uuid=True), ForeignKey("departments.id"), nullable=False)
    semester = Column(Integer)

    department = relationship("Department", back_populates="subjects")
    assignments = relationship("SubjectAssignment", back_populates="subject")
    lectures = relationship("Lecture", back_populates="subject")


class SubjectAssignment(Base):
    __tablename__ = "subject_assignments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    faculty_id = Column(UUID(as_uuid=True), ForeignKey("faculty.id"), nullable=False)
    division = Column(String)
    batch = Column(String)
    semester = Column(Integer)

    subject = relationship("Subject", back_populates="assignments")
    faculty = relationship("Faculty")


# ─── Lecture ───────────────────────────────────────────────

class Lecture(Base):
    __tablename__ = "lectures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    faculty_id = Column(UUID(as_uuid=True), ForeignKey("faculty.id"), nullable=False)
    division = Column(String)
    batch = Column(String)
    lecture_no = Column(Integer)
    date = Column(DateTime(timezone=True), nullable=False)
    time_start = Column(DateTime(timezone=True))
    status = Column(Enum(LectureStatus), default=LectureStatus.pending)
    mode = Column(String, default="ai")  # 'ai' | 'manual'
    classroom_image_urls = Column(ARRAY(String), default=[])
    total_students = Column(Integer, default=0)
    present_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    subject = relationship("Subject", back_populates="lectures")
    faculty = relationship("Faculty", back_populates="lectures")
    attendance_records = relationship("AttendanceRecord", back_populates="lecture")
    evidence = relationship("AttendanceEvidence", back_populates="lecture")


# ─── Attendance Record ─────────────────────────────────────

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lecture_id = Column(UUID(as_uuid=True), ForeignKey("lectures.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    subject_id = Column(UUID(as_uuid=True), ForeignKey("subjects.id"), nullable=False)
    status = Column(Enum(AttendanceStatus), nullable=False)
    source = Column(Enum(AttendanceSource), default=AttendanceSource.auto)
    confidence = Column(Float)
    marked_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    lecture = relationship("Lecture", back_populates="attendance_records")
    student = relationship("Student", back_populates="attendance_records")
    subject = relationship("Subject")
    evidence = relationship("AttendanceEvidence", back_populates="attendance_record", uselist=False)


# ─── Attendance Evidence ───────────────────────────────────

class AttendanceEvidence(Base):
    __tablename__ = "attendance_evidence"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attendance_id = Column(UUID(as_uuid=True), ForeignKey("attendance_records.id"))
    lecture_id = Column(UUID(as_uuid=True), ForeignKey("lectures.id"), nullable=False)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    classroom_image_url = Column(String)
    cropped_face_url = Column(String)
    confidence = Column(Float)
    detected_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    lecture = relationship("Lecture", back_populates="evidence")
    attendance_record = relationship("AttendanceRecord", back_populates="evidence")


# ─── Attendance Dispute ────────────────────────────────────

class AttendanceDispute(Base):
    __tablename__ = "attendance_disputes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    lecture_id = Column(UUID(as_uuid=True), ForeignKey("lectures.id"), nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(Enum(DisputeStatus), default=DisputeStatus.open)
    admin_note = Column(Text)
    resolved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    resolved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


# ─── Face Embedding ────────────────────────────────────────

class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id = Column(UUID(as_uuid=True), ForeignKey("students.id"), nullable=False)
    embedding = Column(Vector(512))   # InsightFace 512-dim vector
    image_url = Column(String)
    angle = Column(String)            # 'front' | 'left' | 'right' | 'up' | 'down'
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    student = relationship("Student", back_populates="face_embeddings")


# ─── Audit Log ─────────────────────────────────────────────

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    action = Column(String, nullable=False)
    resource = Column(String)
    metadata = Column(JSON)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
