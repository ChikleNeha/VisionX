from typing import Literal
from .state import TutorState


def route_by_intent(state: TutorState) -> Literal["tutor", "quiz", "lesson"]:
    """Routes from router node to the appropriate handler node."""
    return state.get("intent", "tutor")
