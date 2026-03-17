# AccessCode 🎧

> AI-powered Python tutor for visually impaired learners.
> Voice-first. Keyboard-first. Screen-reader-ready.

---

## Project Structure

```
accesscode/
├── frontend/          # React + Vite + Tailwind
└── backend/           # FastAPI + LangGraph + SQLite + OpenAI
```

---

## Setup

### 1. Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Add your OpenAI API key
cp .env.example .env
# Edit .env and paste your OPENAI_API_KEY

# Run the server
uvicorn main:app --reload --port 8000
```

API will be at: http://localhost:8000
Docs at: http://localhost:8000/docs

---

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App will be at: http://localhost:5173

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/users | Create or find user by name |
| GET | /api/users/{username} | Get user info |
| GET | /api/progress/{session_id} | Get all module progress |
| POST | /api/progress | Update module progress |
| POST | /api/lesson | Generate adaptive lesson |
| POST | /api/tutor | Chat with AI tutor (interrupt handler) |
| POST | /api/quiz | Generate 5 adaptive quiz questions |
| POST | /api/quiz/result | Submit quiz score, adapt difficulty |
| POST | /api/tts | Convert text to speech (OpenAI tts-1-hd) |
| GET | /api/health | Health check |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| J or F | Interrupt lesson — ask a question |
| R | Replay last spoken message |
| Q | Start quiz |
| N / P | Next / Previous module |
| H | Hear all shortcuts |
| Esc | Stop speaking |
| Alt+C | Toggle high contrast |
| Alt+1–4 | Change font size |

---

## How Adaptive Difficulty Works

1. **During lesson**: If student asks confused/basic questions → tutor simplifies + flags `DIFFICULTY_CHANGE: beginner`
2. **After quiz**: Score ≥ 80% → moves up a level. Score < 50% → moves down.
3. **Lesson regeneration**: If `LESSON_ADJUST: true` is flagged → new lesson generated at new difficulty and spoken immediately.
4. All difficulty changes logged in `difficulty_log` table in SQLite.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Web Speech API
- **Backend**: FastAPI, Python 3.11+
- **AI**: OpenAI GPT-4o (tutoring), OpenAI tts-1-hd (voice)
- **Orchestration**: LangGraph with SqliteSaver checkpointer
- **Database**: SQLite (aiosqlite for async)

---

## Demo Flow (Eyes-Closed)

1. Tab to name field → type name → Enter
2. Press N to open Module 1
3. Press Enter on "Start Lesson" → lesson plays aloud
4. Press J to interrupt → speak a question → lesson adapts
5. Press Q → quiz starts → press 1/2/3/4 to answer
6. Hear score announcement

> Demoing this eyes-closed is the most powerful thing you can do for judges.
