from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.api import auth, users, students, faculty, subjects, attendance, recognition, disputes, reports, departments, super_admin

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (idempotent - safe to run every time)
    from app.database import get_engine, Base
    import app.models  # noqa: F401 – registers all models with Base.metadata
    try:
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("[STARTUP] Database tables created/verified successfully")
    except Exception as e:
        print(f"[STARTUP ERROR] Table creation failed: {e}")
    yield

app = FastAPI(
    title="AttendAI API",
    description="AI-powered attendance management for educational institutions",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,        prefix="/auth",        tags=["Auth"])
app.include_router(users.router,       prefix="/users",       tags=["Users"])
app.include_router(students.router,    prefix="/students",    tags=["Students"])
app.include_router(departments.router, prefix="/departments", tags=["Departments"])
app.include_router(faculty.router,     prefix="/faculty",     tags=["Faculty"])
app.include_router(subjects.router,    prefix="/subjects",    tags=["Subjects"])
app.include_router(attendance.router,  prefix="/attendance",  tags=["Attendance"])
app.include_router(recognition.router,  prefix="/face",        tags=["Face Recognition"])
app.include_router(disputes.router,     prefix="/disputes",    tags=["Disputes"])
app.include_router(reports.router,      prefix="/reports",     tags=["Reports"])
app.include_router(super_admin.router,  prefix="/admin",       tags=["Super Admin"])


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}


@app.get("/")
def root():
    return {"message": "AttendAI API is running"}
