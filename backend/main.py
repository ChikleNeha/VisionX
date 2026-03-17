import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()

from database.db import init_db
from routes import users, progress, lesson, tutor, quiz, tts, stt

app = FastAPI(
    title="AccessCode API",
    description="AI-powered Python tutor for visually impaired learners",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    init_db()
    print("AccessCode API started")

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "AccessCode API"}

app.include_router(users.router, prefix="/api", tags=["Users"])
app.include_router(progress.router, prefix="/api", tags=["Progress"])
app.include_router(lesson.router, prefix="/api", tags=["Lesson"])
app.include_router(tutor.router, prefix="/api", tags=["Tutor"])
app.include_router(quiz.router, prefix="/api", tags=["Quiz"])
app.include_router(tts.router, prefix="/api", tags=["TTS"])
app.include_router(stt.router, prefix="/api", tags=["STT"])