import os
import aiosqlite
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from .state import TutorState
from .nodes import router_node, tutor_node, lesson_node, quiz_node
from .edges import route_by_intent

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "database", "accesscode.db")

_graph = None
_checkpointer = None


async def get_graph():
    """Returns compiled async LangGraph — singleton."""
    global _graph, _checkpointer

    if _graph is not None:
        return _graph

    # AsyncSqliteSaver — required for use with async FastAPI routes
    _checkpointer = AsyncSqliteSaver(await aiosqlite.connect(DB_PATH))

    builder = StateGraph(TutorState)

    builder.add_node("router", router_node)
    builder.add_node("tutor", tutor_node)
    builder.add_node("lesson", lesson_node)
    builder.add_node("quiz", quiz_node)

    builder.set_entry_point("router")

    builder.add_conditional_edges(
        "router",
        route_by_intent,
        {
            "tutor": "tutor",
            "quiz": "quiz",
            "lesson": "lesson",
        }
    )

    builder.add_edge("tutor", END)
    builder.add_edge("lesson", END)
    builder.add_edge("quiz", END)

    _graph = builder.compile(checkpointer=_checkpointer)
    print("LangGraph compiled with AsyncSqliteSaver")
    return _graph