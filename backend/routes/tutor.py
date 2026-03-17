from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage
from database.db import get_db
from models.schemas import TutorRequest, TutorResponse
from graph.graph import get_graph
from services.curriculum import get_module

router = APIRouter()


@router.post("/tutor", response_model=TutorResponse)
async def tutor_chat(body: TutorRequest):
    mod = get_module(body.module_id)
    graph = await get_graph()

    # Thread ID ties conversation history to this session + module
    thread_id = f"{body.session_id}-{body.module_id}"
    config = {"configurable": {"thread_id": thread_id}}

    # Save user message to DB
    async for db in get_db():
        await db.execute(
            "INSERT INTO messages (session_id, module_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)",
            (body.session_id, body.module_id, "user", body.message, "chat")
        )
        await db.commit()

    # Build state — LangGraph checkpointer will merge with existing history
    state = {
        "messages": [HumanMessage(content=body.message)],
        "session_id": body.session_id,
        "module_id": body.module_id,
        "module_title": mod["title"],
        "module_topics": mod["topics"],
        "lesson_context": body.lesson_context or "",
        "difficulty": body.difficulty,
        "updated_difficulty": None,
        "lesson_adjustment": False,
        "intent": "tutor",
        "response": "",
        "quiz_questions": [],
    }

    try:
        result = await graph.ainvoke(state, config=config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tutor error: {str(e)}")

    response = result["response"]
    updated_difficulty = result.get("updated_difficulty")
    lesson_adjustment = result.get("lesson_adjustment", False)

    # Save assistant response to DB
    async for db in get_db():
        await db.execute(
            "INSERT INTO messages (session_id, module_id, role, content, message_type) VALUES (?, ?, ?, ?, ?)",
            (body.session_id, body.module_id, "assistant", response, "chat")
        )

        # Log difficulty change
        if updated_difficulty and updated_difficulty != body.difficulty:
            await db.execute(
                """INSERT INTO difficulty_log
                   (session_id, module_id, old_difficulty, new_difficulty, reason)
                   VALUES (?, ?, ?, ?, ?)""",
                (body.session_id, body.module_id, body.difficulty, updated_difficulty,
                 f"Adapted based on: {body.message[:100]}")
            )

        await db.commit()

    return TutorResponse(
        response=response,
        updated_difficulty=updated_difficulty,
        lesson_adjustment=lesson_adjustment
    )