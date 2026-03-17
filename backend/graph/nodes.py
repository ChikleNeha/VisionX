import json
import re
import os
from bytez import Bytez
from langchain_core.messages import HumanMessage, AIMessage
from .state import TutorState
from services.prompts import TUTOR_SYSTEM, LESSON_SYSTEM, QUIZ_SYSTEM, ROUTER_SYSTEM

BYTEZ_KEY = os.getenv("BYTEZ_API_KEY")
if not BYTEZ_KEY:
    raise RuntimeError("BYTEZ_API_KEY not set in .env file")
_sdk = Bytez(BYTEZ_KEY)

# gpt-4o for tutor (quality answers), gpt-4o-mini for lessons/quiz (speed)
_tutor_model  = _sdk.model("openai/gpt-4o")
_lesson_model = _sdk.model("openai/gpt-4o-mini")
_quiz_model   = _sdk.model("openai/gpt-4o-mini")
_router_model = _sdk.model("openai/gpt-4o-mini")


def _run(model, system: str, user_messages: list) -> str:
    """
    Call Bytez model with a messages array.
    Prepends system message then appends conversation history.
    """
    messages = [{"role": "system", "content": system}] + user_messages

    result = model.run(messages)

    if result.error:
        raise RuntimeError(f"Bytez error: {result.error}")

    output = result.output
    # Bytez returns the assistant message content
    if isinstance(output, str):
        return output
    if isinstance(output, dict):
        return output.get("content", "") or output.get("text", "") or str(output)
    if isinstance(output, list) and output:
        item = output[0]
        if isinstance(item, dict):
            return item.get("content", "") or item.get("text", "")
        return str(item)
    return str(output)


def _lc_to_dicts(messages: list) -> list:
    """Convert LangChain message objects or dicts to plain role/content dicts."""
    result = []
    for m in messages[-10:]:  # last 10 only
        if isinstance(m, dict):
            result.append({"role": m.get("role", "user"), "content": m.get("content", "")})
        elif hasattr(m, "type"):
            role = "user" if m.type == "human" else "assistant"
            result.append({"role": role, "content": m.content})
        elif hasattr(m, "role"):
            result.append({"role": m.role, "content": m.content})
    return result


def _last_user_content(state: TutorState) -> str:
    for m in reversed(state.get("messages", [])):
        if isinstance(m, dict) and m.get("role") == "user":
            return m["content"]
        if hasattr(m, "type") and m.type == "human":
            return m.content
    return ""


# ── Nodes ──────────────────────────────────────────────────────────────────

def router_node(state: TutorState) -> TutorState:
    last_user = _last_user_content(state)
    try:
        intent = _run(
            _router_model,
            ROUTER_SYSTEM,
            [{"role": "user", "content": last_user}]
        ).strip().lower()
    except Exception:
        intent = "tutor"

    if intent not in ("tutor", "quiz", "lesson"):
        intent = "tutor"

    return {**state, "intent": intent}


def tutor_node(state: TutorState) -> TutorState:
    system = TUTOR_SYSTEM.format(
        module_title=state["module_title"],
        difficulty=state["difficulty"],
        lesson_context=state.get("lesson_context", "")
    )

    history = _lc_to_dicts(state.get("messages", []))
    raw = _run(_tutor_model, system, history)

    updated_difficulty = None
    lesson_adjustment = False

    diff_match = re.search(r"DIFFICULTY_CHANGE:\s*(beginner|intermediate|advanced)", raw)
    if diff_match:
        updated_difficulty = diff_match.group(1)
        raw = raw.replace(diff_match.group(0), "").strip()

    if "LESSON_ADJUST: true" in raw:
        lesson_adjustment = True
        raw = raw.replace("LESSON_ADJUST: true", "").strip()

    return {
        **state,
        "response": raw,
        "updated_difficulty": updated_difficulty,
        "lesson_adjustment": lesson_adjustment,
    }


def lesson_node(state: TutorState) -> TutorState:
    system = LESSON_SYSTEM.format(
        module_title=state["module_title"],
        topics=", ".join(state.get("module_topics", [])),
        difficulty=state["difficulty"]
    )

    content = _run(
        _lesson_model,
        system,
        [{"role": "user", "content": f"Mujhe {state['module_title']} sikhao {state['difficulty']} level par."}]
    )

    return {**state, "response": content, "lesson_adjustment": False}


def quiz_node(state: TutorState) -> TutorState:
    system = QUIZ_SYSTEM.format(
        module_title=state["module_title"],
        topics=", ".join(state.get("module_topics", [])),
        difficulty=state["difficulty"]
    )

    raw = _run(
        _quiz_model,
        system,
        [{"role": "user", "content": "Quiz questions generate karo abhi."}]
    )

    raw = re.sub(r"```json|```", "", raw).strip()

    try:
        questions = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        try:
            questions = json.loads(match.group()) if match else []
        except Exception:
            questions = []

    return {**state, "quiz_questions": questions}