from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from database.db import get_db
from models.schemas import LessonRequest, LessonResponse
from graph.graph import get_graph
from services.curriculum import get_module
import json, asyncio, re

router = APIRouter()

# Status messages sent as SSE events before/during generation
STATUS_MESSAGES = [
    ("status", "Lesson dhundh rahe hain..."),
    ("status", "AI se lesson manga rahe hain..."),
    ("status", "Thoda waqt lagega, almost ready hai..."),
]


def _split_sentences(text: str) -> list[str]:
    """Split lesson into natural spoken chunks (sentences)."""
    # Split on sentence endings, keeping the delimiter
    parts = re.split(r'(?<=[।.!?])\s+', text.strip())
    # Also split on double newlines (paragraph breaks)
    chunks = []
    for part in parts:
        sub = [p.strip() for p in part.split('\n\n') if p.strip()]
        chunks.extend(sub if sub else [part])
    return [c for c in chunks if c]


async def _stream_lesson(body: LessonRequest):
    """Generator that yields SSE events."""

    def sse(event: str, data: str) -> str:
        # Server-Sent Event format
        payload = json.dumps({"type": event, "text": data})
        return f"data: {payload}\n\n"

    # ── Check cache first ────────────────────────────────────────────────────
    cached_content = None
    async for db in get_db():
        rows = await db.execute_fetchall(
            """SELECT content FROM lessons
               WHERE session_id = ? AND module_id = ? AND difficulty = ?
               AND generated_at > datetime('now', '-24 hours')
               ORDER BY generated_at DESC LIMIT 1""",
            (body.session_id, body.module_id, body.difficulty)
        )
        if rows:
            cached_content = rows[0][0]
        break

    if cached_content:
        # Cached — skip all delays, send done immediately
        yield sse("done", cached_content)
        return

    # ── Generate fresh lesson ────────────────────────────────────────────────
    # Stream status messages while AI is working
    yield sse("status", "Lesson generate ho rahi hai...")
    await asyncio.sleep(0.1)

    # Run the slow Bytez call in a thread so we can yield status ticks
    mod = get_module(body.module_id)
    graph = await get_graph()
    config = {"configurable": {"thread_id": f"{body.session_id}-{body.module_id}-lesson"}}

    initial_state = {
        "messages": [{"role": "user", "content": f"Teach me {mod['title']}"}],
        "session_id": body.session_id,
        "module_id": body.module_id,
        "module_title": mod["title"],
        "module_topics": mod["topics"],
        "lesson_context": "",
        "difficulty": body.difficulty,
        "updated_difficulty": None,
        "lesson_adjustment": False,
        "intent": "lesson",
        "response": "",
        "quiz_questions": [],
    }

    # Run generation in background task, send status ticks while waiting
    import asyncio
    result_container = {}
    error_container = {}

    async def generate():
        try:
            result = await graph.ainvoke(initial_state, config=config)
            result_container["content"] = result["response"]
        except Exception as e:
            error_container["error"] = str(e)

    gen_task = asyncio.create_task(generate())

    # Send status ticks every 3 seconds while waiting
    status_cycle = [
        "AI soch raha hai...",
        "Lesson ban rahi hai, thoda waqt lagega...",
        "Almost ready, bas kuch seconds...",
        "Finishing touches lag rahe hain...",
    ]
    tick = 0
    while not gen_task.done():
        await asyncio.sleep(3)
        if not gen_task.done():
            yield sse("status", status_cycle[tick % len(status_cycle)])
            tick += 1

    await gen_task

    if "error" in error_container:
        yield sse("error", f"Lesson load nahi hui: {error_container['error']}")
        return

    content = result_container.get("content", "")
    if not content:
        yield sse("error", "Koi content nahi mila. Dobara try karo.")
        return

    # Cache in DB
    async for db in get_db():
        await db.execute(
            "INSERT INTO lessons (session_id, module_id, difficulty, content) VALUES (?, ?, ?, ?)",
            (body.session_id, body.module_id, body.difficulty, content)
        )
        await db.commit()
        break

    # Stream content sentence by sentence
    yield sse("status", "Audio ke liye tayyar ho raha hai...")
    await asyncio.sleep(0.2)

    sentences = _split_sentences(content)
    for sentence in sentences:
        yield sse("chunk", sentence)
        await asyncio.sleep(0.04)

    # Final event with full content (frontend uses this to start TTS)
    yield sse("done", content)


@router.post("/lesson/stream")
async def stream_lesson(body: LessonRequest):
    """SSE endpoint — streams lesson generation status + content chunks."""
    return StreamingResponse(
        _stream_lesson(body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering if proxied
        }
    )


@router.post("/lesson", response_model=LessonResponse)
async def get_lesson(body: LessonRequest):
    """Non-streaming fallback — returns full lesson at once."""
    mod = get_module(body.module_id)

    async for db in get_db():
        cached = await db.execute_fetchall(
            """SELECT content FROM lessons
               WHERE session_id = ? AND module_id = ? AND difficulty = ?
               AND generated_at > datetime('now', '-24 hours')
               ORDER BY generated_at DESC LIMIT 1""",
            (body.session_id, body.module_id, body.difficulty)
        )
        if cached:
            return LessonResponse(content=cached[0][0], difficulty=body.difficulty, module_id=body.module_id)
        break

    graph = await get_graph()
    config = {"configurable": {"thread_id": f"{body.session_id}-{body.module_id}-lesson"}}

    initial_state = {
        "messages": [{"role": "user", "content": f"Teach me {mod['title']}"}],
        "session_id": body.session_id,
        "module_id": body.module_id,
        "module_title": mod["title"],
        "module_topics": mod["topics"],
        "lesson_context": "",
        "difficulty": body.difficulty,
        "updated_difficulty": None,
        "lesson_adjustment": False,
        "intent": "lesson",
        "response": "",
        "quiz_questions": [],
    }

    try:
        result = await graph.ainvoke(initial_state, config=config)
        content = result["response"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lesson generation failed: {str(e)}")

    async for db in get_db():
        await db.execute(
            "INSERT INTO lessons (session_id, module_id, difficulty, content) VALUES (?, ?, ?, ?)",
            (body.session_id, body.module_id, body.difficulty, content)
        )
        await db.commit()
        break

    return LessonResponse(content=content, difficulty=body.difficulty, module_id=body.module_id)