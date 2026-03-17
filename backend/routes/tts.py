from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from bytez import Bytez
import os, base64, asyncio
from concurrent.futures import ThreadPoolExecutor
from models.schemas import TTSRequest

router = APIRouter()

BYTEZ_KEY = os.getenv("BYTEZ_API_KEY")
if not BYTEZ_KEY:
    raise RuntimeError("BYTEZ_API_KEY not set in .env file")
_sdk = Bytez(BYTEZ_KEY)
_tts_model = _sdk.model("openai/tts-1-hd")
_executor = ThreadPoolExecutor(max_workers=4)

MAX_CHARS = 4000


def _to_audio_bytes(output) -> bytes:
    """
    Bytez tts-1-hd can return:
      - raw bytes / bytearray
      - base64-encoded string
      - dict with 'audio' or 'data' key (base64 or bytes)
      - list wrapping any of the above
    """
    if isinstance(output, (bytes, bytearray)):
        return bytes(output)

    if isinstance(output, str):
        # strip data-URI prefix if present: "data:audio/mpeg;base64,..."
        if ',' in output:
            output = output.split(',', 1)[1]
        return base64.b64decode(output)

    if isinstance(output, dict):
        # try common keys
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


@router.post("/tts")
async def text_to_speech(body: TTSRequest):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS]

    loop = asyncio.get_event_loop()
    try:
        audio_bytes = await loop.run_in_executor(_executor, _run_tts_sync, text)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Content-Length": str(len(audio_bytes)),
            "Cache-Control": "no-cache",
            "Accept-Ranges": "none",
        }
    )