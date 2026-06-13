from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.api import auth, users, students, faculty, subjects, attendance, recognition, disputes, reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: load InsightFace in background (non-blocking)
    # We do NOT await here so health check responds immediately
    import asyncio
    async def load_face_model():
        try:
            from app.services.face_service import face_service
            await face_service.initialize()
            print("✅ InsightFace model loaded")
        except Exception as e:
            print(f"⚠️ InsightFace load failed (non-fatal): {e}")

    asyncio.create_task(load_face_model())
    print("🚀 AttendAI backend starting...")
    yield
    print("👋 Shutting down AttendAI backend")


app = FastAPI(
    title="AttendAI API",
    description="AI-powered attendance management for educational institutions",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow Vercel frontend + local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ───────────────────────────────────────────────
app.include_router(auth.router,        prefix="/auth",        tags=["Auth"])
app.include_router(users.router,       prefix="/users",       tags=["Users"])
app.include_router(students.router,    prefix="/students",    tags=["Students"])
app.include_router(faculty.router,     prefix="/faculty",     tags=[" Faculty"])
app.include_router(subjects.router,    prefix="/subjects",    tags=["Subjects"])
app.include_router(attendance.router,  prefix="/attendance",  tags=["Attendance"])
app.include_router(recognition.router, prefix="/face",        tags=["Face Recognition"])
app.include_router(disputes.router,    prefix="/disputes",    tags=["Disputes"])
app.include_router(reports.router,     prefix="/reports",     tags=["Reports"])


@app.get("/health")
async def health():
    """Health check — always returns 200 so Railway knows app is running."""
    db_ok = bool(settings.DATABASE_URL)
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "db_configured": db_ok,
        "env": settings.APP_ENV,
    }


@app.get("/")
async def root():
    return {"message": "AttendAI API is running 🚀"}
