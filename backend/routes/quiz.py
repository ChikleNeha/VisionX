import json
from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage
from database.db import get_db
from models.schemas import QuizRequest, QuizResponse, QuizResultRequest, QuizResultResponse
from graph.graph import get_graph
from services.curriculum import get_module
from services.difficulty import adapt_difficulty

router = APIRouter()


@router.post("/quiz", response_model=QuizResponse)
async def get_quiz(body: QuizRequest):
    mod = get_module(body.module_id)
    graph = await get_graph()

    config = {"configurable": {"thread_id": f"{body.session_id}-{body.module_id}-quiz"}}

    state = {
        "messages": [HumanMessage(content="Generate quiz questions")],
        "session_id": body.session_id,
        "module_id": body.module_id,
        "module_title": mod["title"],
        "module_topics": mod["topics"],
        "lesson_context": "",
        "difficulty": body.difficulty,
        "updated_difficulty": None,
        "lesson_adjustment": False,
        "intent": "quiz",
        "response": "",
        "quiz_questions": [],
    }

    try:
        result = await graph.ainvoke(state, config=config)
        questions = result.get("quiz_questions", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quiz generation failed: {str(e)}")

    if not questions:
        raise HTTPException(status_code=500, detail="No quiz questions were generated")

    return QuizResponse(
        questions=questions,
        module_id=body.module_id,
        difficulty=body.difficulty
    )


@router.post("/quiz/result", response_model=QuizResultResponse)
async def submit_quiz_result(body: QuizResultRequest):
    # Determine if difficulty should adapt
    new_difficulty = adapt_difficulty(
        current="beginner",   # will be overridden below
        score=body.score,
        total=body.total,
        wrong_topics=body.wrong_topics
    )

    # Get current difficulty from last difficulty_log or default beginner
    async for db in get_db():
        rows = await db.execute_fetchall(
            """SELECT new_difficulty FROM difficulty_log
               WHERE session_id = ? AND module_id = ?
               ORDER BY changed_at DESC LIMIT 1""",
            (body.session_id, body.module_id)
        )
        current_difficulty = rows[0][0] if rows else "beginner"

    new_difficulty = adapt_difficulty(
        current=current_difficulty,
        score=body.score,
        total=body.total,
        wrong_topics=body.wrong_topics
    )

    async for db in get_db():
        # Save quiz attempt
        await db.execute(
            """INSERT INTO quiz_attempts
               (session_id, module_id, score, total, wrong_topics)
               VALUES (?, ?, ?, ?, ?)""",
            (body.session_id, body.module_id, body.score, body.total,
             json.dumps(body.wrong_topics))
        )

        # Log difficulty change if needed
        if new_difficulty and new_difficulty != current_difficulty:
            await db.execute(
                """INSERT INTO difficulty_log
                   (session_id, module_id, old_difficulty, new_difficulty, reason)
                   VALUES (?, ?, ?, ?, ?)""",
                (body.session_id, body.module_id, current_difficulty, new_difficulty,
                 f"Quiz result: {body.score}/{body.total}")
            )

        await db.commit()

    pct = round((body.score / body.total) * 100) if body.total > 0 else 0
    msg = (
        f"Score saved: {body.score}/{body.total} ({pct}%). "
        + (f"Difficulty adjusted to {new_difficulty}." if new_difficulty else "Difficulty unchanged.")
    )

    return QuizResultResponse(saved=True, new_difficulty=new_difficulty, message=msg)