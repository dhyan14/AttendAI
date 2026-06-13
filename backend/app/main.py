from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
import sys

app = FastAPI(title="AttendAI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers with error trapping so we can see exactly which one fails
_import_errors = {}

def safe_include(name, prefix, tags):
    try:
        import importlib
        mod = importlib.import_module(f"app.api.{name}")
        app.include_router(mod.router, prefix=prefix, tags=tags)
        print(f"OK: {name}")
    except Exception as e:
        _import_errors[name] = str(e)
        print(f"FAILED: {name} -> {e}", file=sys.stderr)

safe_include("auth",        "/auth",       ["Auth"])
safe_include("users",       "/users",      ["Users"])
safe_include("students",    "/students",   ["Students"])
safe_include("faculty",     "/faculty",    ["Faculty"])
safe_include("subjects",    "/subjects",   ["Subjects"])
safe_include("attendance",  "/attendance", ["Attendance"])
safe_include("recognition", "/face",       ["Face Recognition"])
safe_include("disputes",    "/disputes",   ["Disputes"])
safe_include("reports",     "/reports",    ["Reports"])


@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "import_errors": _import_errors,
    }

@app.get("/")
def root():
    return {"message": "AttendAI API running", "errors": _import_errors}
