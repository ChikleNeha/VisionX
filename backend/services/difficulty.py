from typing import Optional

LEVELS = ["beginner", "intermediate", "advanced"]


def adapt_difficulty(current: str, score: int, total: int, wrong_topics: list) -> Optional[str]:
    """
    Returns a new difficulty level or None if no change needed.
    - Score >= 80% and no wrong topics → move up
    - Score < 50% → move down
    - Otherwise → stay
    """
    if total == 0:
        return None

    pct = score / total
    idx = LEVELS.index(current) if current in LEVELS else 0

    if pct >= 0.8 and idx < len(LEVELS) - 1:
        return LEVELS[idx + 1]
    elif pct < 0.5 and idx > 0:
        return LEVELS[idx - 1]

    return None


def difficulty_from_mistakes(current: str, consecutive_mistakes: int) -> Optional[str]:
    """
    Mid-lesson adaptation: if student gets 3+ things wrong in a row, simplify.
    """
    if consecutive_mistakes >= 3:
        idx = LEVELS.index(current) if current in LEVELS else 0
        if idx > 0:
            return LEVELS[idx - 1]
    return None
