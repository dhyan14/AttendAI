"""Minimal health check - no external imports - diagnose Railway startup"""
from fastapi import FastAPI
import os

app = FastAPI()

@app.get("/health")
def health():
    return {
        "status": "ok",
        "port": os.environ.get("PORT", "not set"),
        "database_url_set": bool(os.environ.get("DATABASE_URL")),
    }

@app.get("/")
def root():
    return {"message": "AttendAI API running"}
