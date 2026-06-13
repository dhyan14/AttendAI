-- ============================================================
-- AttendAI – Complete Supabase Database Setup
-- Run this in: Supabase → SQL Editor → New query
-- ============================================================

-- Enable pgvector extension (already available on Supabase)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Enums ──────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student','faculty','dept_admin','org_admin','super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('present','absent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_source AS ENUM ('auto','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lecture_status AS ENUM ('pending','finalized');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE dispute_status AS ENUM ('open','resolved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Organizations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  code       TEXT UNIQUE NOT NULL,
  settings   JSONB DEFAULT '{"minAttendancePercent": 75}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL,
  org_id        UUID REFERENCES organizations(id),
  is_active     BOOLEAN DEFAULT true,
  fcm_token     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── Departments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID REFERENCES organizations(id) NOT NULL,
  name           TEXT NOT NULL,
  code           TEXT NOT NULL,
  institute_name TEXT
);

-- ─── Students ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES users(id),
  roll_no          TEXT NOT NULL,
  enrollment_no    TEXT,
  name             TEXT NOT NULL,
  division         TEXT,
  batch            TEXT,
  semester         INTEGER,
  dept_id          UUID REFERENCES departments(id) NOT NULL,
  profile_image_url TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_students_dept ON students(dept_id);
CREATE INDEX IF NOT EXISTS idx_students_roll ON students(roll_no);

-- ─── Faculty ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS faculty (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  name        TEXT NOT NULL,
  designation TEXT,
  dept_id     UUID REFERENCES departments(id) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Subjects ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name     TEXT NOT NULL,
  code     TEXT NOT NULL,
  dept_id  UUID REFERENCES departments(id) NOT NULL,
  semester INTEGER
);

-- ─── Subject Assignments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS subject_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  faculty_id UUID REFERENCES faculty(id) NOT NULL,
  division   TEXT,
  batch      TEXT,
  semester   INTEGER
);

-- ─── Lectures ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lectures (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id            UUID REFERENCES subjects(id) NOT NULL,
  faculty_id            UUID REFERENCES faculty(id) NOT NULL,
  division              TEXT,
  batch                 TEXT,
  lecture_no            INTEGER,
  date                  TIMESTAMPTZ NOT NULL,
  time_start            TIMESTAMPTZ,
  status                lecture_status DEFAULT 'pending',
  mode                  TEXT DEFAULT 'ai',
  classroom_image_urls  TEXT[] DEFAULT '{}',
  total_students        INTEGER DEFAULT 0,
  present_count         INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lectures_faculty ON lectures(faculty_id);
CREATE INDEX IF NOT EXISTS idx_lectures_date    ON lectures(date);

-- ─── Attendance Records ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_records (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID REFERENCES lectures(id) NOT NULL,
  student_id UUID REFERENCES students(id) NOT NULL,
  subject_id UUID REFERENCES subjects(id) NOT NULL,
  status     attendance_status NOT NULL,
  source     attendance_source DEFAULT 'auto',
  confidence FLOAT,
  marked_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_att_student   ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_att_lecture   ON attendance_records(lecture_id);
CREATE INDEX IF NOT EXISTS idx_att_subject   ON attendance_records(subject_id);

-- ─── Attendance Evidence ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_evidence (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id         UUID REFERENCES attendance_records(id),
  lecture_id            UUID REFERENCES lectures(id) NOT NULL,
  student_id            UUID REFERENCES students(id) NOT NULL,
  classroom_image_url   TEXT,
  cropped_face_url      TEXT,
  confidence            FLOAT,
  detected_at           TIMESTAMPTZ DEFAULT now()
);

-- ─── Attendance Disputes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_disputes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES students(id) NOT NULL,
  lecture_id  UUID REFERENCES lectures(id) NOT NULL,
  reason      TEXT NOT NULL,
  status      dispute_status DEFAULT 'open',
  admin_note  TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Face Embeddings (pgvector) ───────────────────────────────
CREATE TABLE IF NOT EXISTS face_embeddings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) NOT NULL,
  embedding  vector(512),    -- InsightFace buffalo_l 512-dim
  image_url  TEXT,
  angle      TEXT,           -- 'front' | 'left' | 'right' | 'up' | 'down'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast cosine similarity search (sub-100ms for 500+ students)
CREATE INDEX IF NOT EXISTS face_embeddings_hnsw_idx
  ON face_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_face_student ON face_embeddings(student_id);

-- ─── Audit Logs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID REFERENCES users(id),
  action     TEXT NOT NULL,
  resource   TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Seed: Sample Organization ────────────────────────────────
-- Run this once to create your org. Change as needed.
INSERT INTO organizations (name, code, settings)
VALUES (
  'Sardar Vallabhbhai Global University',
  'SVGU',
  '{"minAttendancePercent": 75}'
) ON CONFLICT (code) DO NOTHING;

-- ─── Done! ────────────────────────────────────────────────────
-- After running this, note down the org ID from:
-- SELECT id, name FROM organizations;
-- You'll need it when creating departments and the first admin user.
