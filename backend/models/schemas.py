from pydantic import BaseModel
from typing import Optional, List

# ── User ──────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str

class UserResponse(BaseModel):
    username: str
    created_at: str

# ── Progress ──────────────────────────────────────────
class ProgressUpdate(BaseModel):
    session_id: str
    module_id: int
    status: Optional[str] = None
    quiz_score: Optional[int] = None

class ProgressItem(BaseModel):
    module_id: int
    status: str
    quiz_score: int

# ── Lesson ────────────────────────────────────────────
class LessonRequest(BaseModel):
    session_id: str
    module_id: int
    difficulty: str = "beginner"

class LessonResponse(BaseModel):
    content: str
    difficulty: str
    module_id: int

# ── Tutor Chat ────────────────────────────────────────
class TutorRequest(BaseModel):
    session_id: str
    module_id: int
    message: str
    difficulty: str = "beginner"
    lesson_context: Optional[str] = ""

class TutorResponse(BaseModel):
    response: str
    updated_difficulty: Optional[str] = None
    lesson_adjustment: bool = False

# ── Quiz ──────────────────────────────────────────────
class QuizRequest(BaseModel):
    session_id: str
    module_id: int
    difficulty: str = "beginner"

class QuizQuestion(BaseModel):
    question: str
    options: List[str]
    answer: str
    explanation: str
    topic: Optional[str] = None

class QuizResponse(BaseModel):
    questions: List[QuizQuestion]
    module_id: int
    difficulty: str

class QuizResultRequest(BaseModel):
    session_id: str
    module_id: int
    score: int
    total: int
    wrong_topics: List[str] = []

class QuizResultResponse(BaseModel):
    saved: bool
    new_difficulty: Optional[str] = None
    message: str

# ── TTS ───────────────────────────────────────────────
class TTSRequest(BaseModel):
    text: str
    speed: float = 1.0
