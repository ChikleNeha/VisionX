from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from bytez import Bytez
import os, base64, asyncio, re
from concurrent.futures import ThreadPoolExecutor
from models.schemas import TTSRequest

router = APIRouter()

BYTEZ_KEY = os.getenv("BYTEZ_API_KEY")
if not BYTEZ_KEY:
    raise RuntimeError("BYTEZ_API_KEY not set in .env file")
_sdk = Bytez(BYTEZ_KEY)
_tts_model = _sdk.model("openai/tts-1-hd")
_executor = ThreadPoolExecutor(max_workers=4)

# Keep chunks under this size to avoid MediaError on long texts
MAX_CHARS = 800


def _to_audio_bytes(output) -> bytes:
    if isinstance(output, (bytes, bytearray)):
        return bytes(output)
    if isinstance(output, str):
        if ',' in output:
            output = output.split(',', 1)[1]
        return base64.b64decode(output)
    if isinstance(output, dict):
        for key in ('audio', 'data', 'content', 'output', 'result'):
            if key in output:
                return _to_audio_bytes(output[key])
        raise RuntimeError(f"Unexpected dict keys from TTS: {list(output.keys())}")
    if isinstance(output, list) and output:
        return _to_audio_bytes(output[0])
    raise RuntimeError(f"Unrecognised TTS output type: {type(output)}")


def _run_tts_sync(text: str) -> bytes:
    result = _tts_model.run(text)
    if result.error:
        raise RuntimeError(f"Bytez TTS error: {result.error}")
    return _to_audio_bytes(result.output)


def _split_for_tts(text: str) -> list[str]:
    """Split long text into sentence chunks under MAX_CHARS each."""
    if len(text) <= MAX_CHARS:
        return [text]
    # Split on sentence endings
    sentences = re.split(r'(?<=[।.!?])\s+', text.strip())
    chunks = []
    current = ''
    for sentence in sentences:
        if len(current) + len(sentence) + 1 <= MAX_CHARS:
            current = (current + ' ' + sentence).strip()
        else:
            if current:
                chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)
    return chunks or [text[:MAX_CHARS]]


@router.post("/tts")
async def text_to_speech(body: TTSRequest):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    # Take first chunk only — frontend should call multiple times for long text
    # or use the /tts/full endpoint below
    chunk = _split_for_tts(text)[0]

    loop = asyncio.get_event_loop()
    try:
        audio_bytes = await loop.run_in_executor(_executor, _run_tts_sync, chunk)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")

    # Do NOT set Content-Length manually — FastAPI sets it correctly
    # Setting it manually causes MediaError if byte count is off by even 1
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-cache"}
    )


@router.post("/tts/chunks")
async def tts_get_chunks(body: TTSRequest):
    """Returns list of text chunks the frontend should request one by one."""
    chunks = _split_for_tts(body.text.strip())
    return {"chunks": chunks, "total": len(chunks)}