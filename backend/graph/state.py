from typing import TypedDict, Literal, Annotated, Optional, List
from langgraph.graph.message import add_messages


class TutorState(TypedDict):
    # Conversation
    messages: Annotated[list, add_messages]

    # Context
    session_id: str
    module_id: int
    module_title: str
    module_topics: List[str]
    lesson_context: str

    # Difficulty
    difficulty: str                          # beginner | intermediate | advanced
    updated_difficulty: Optional[str]        # set if difficulty changed this turn
    lesson_adjustment: bool                  # True if lesson should be regenerated

    # Routing
    intent: Literal["tutor", "quiz", "lesson", "unknown"]

    # Output
    response: str
    quiz_questions: list
