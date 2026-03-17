from fastapi import APIRouter, HTTPException
from datetime import datetime
from database.db import get_db
from models.schemas import ProgressUpdate, ProgressItem

router = APIRouter()


@router.get("/progress/{session_id}")
async def get_progress(session_id: str):
    async for db in get_db():
        rows = await db.execute_fetchall(
            "SELECT module_id, status, quiz_score FROM progress WHERE session_id = ?",
            (session_id,)
        )
        return [
            ProgressItem(module_id=r[0], status=r[1], quiz_score=r[2])
            for r in rows
        ]


@router.post("/progress")
async def update_progress(body: ProgressUpdate):
    async for db in get_db():
        # Upsert progress row
        existing = await db.execute_fetchall(
            "SELECT id FROM progress WHERE session_id = ? AND module_id = ?",
            (body.session_id, body.module_id)
        )

        now = datetime.utcnow().isoformat()

        if existing:
            updates = []
            params = []
            if body.status:
                updates.append("status = ?")
                params.append(body.status)
            if body.quiz_score is not None:
                updates.append("quiz_score = ?")
                params.append(body.quiz_score)
            if body.status == "completed":
                updates.append("completed_at = ?")
                params.append(now)
            updates.append("updated_at = ?")
            params.append(now)
            params += [body.session_id, body.module_id]

            await db.execute(
                f"UPDATE progress SET {', '.join(updates)} WHERE session_id = ? AND module_id = ?",
                params
            )
        else:
            await db.execute(
                """INSERT INTO progress (session_id, module_id, status, quiz_score, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (body.session_id, body.module_id,
                 body.status or "in_progress",
                 body.quiz_score or 0,
                 now)
            )

        await db.commit()
        return {"saved": True}
