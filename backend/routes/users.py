from fastapi import APIRouter, HTTPException
from database.db import get_db
from models.schemas import UserCreate, UserResponse

router = APIRouter()


@router.post("/users", response_model=UserResponse)
async def create_user(body: UserCreate):
    username = body.username.strip()
    if not username or len(username) < 2:
        raise HTTPException(status_code=400, detail="Username must be at least 2 characters")

    async for db in get_db():
        try:
            await db.execute(
                "INSERT OR IGNORE INTO users (username) VALUES (?)", (username,)
            )
            await db.commit()
            row = await db.execute_fetchall(
                "SELECT username, created_at FROM users WHERE username = ?", (username,)
            )
            if row:
                return UserResponse(username=row[0][0], created_at=str(row[0][1]))
            raise HTTPException(status_code=500, detail="User creation failed")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{username}", response_model=UserResponse)
async def get_user(username: str):
    async for db in get_db():
        rows = await db.execute_fetchall(
            "SELECT username, created_at FROM users WHERE username = ?", (username,)
        )
        if not rows:
            raise HTTPException(status_code=404, detail="User not found")
        return UserResponse(username=rows[0][0], created_at=str(rows[0][1]))
