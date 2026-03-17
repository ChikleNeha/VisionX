from fastapi import APIRouter, HTTPException, UploadFile, File
from bytez import Bytez
import os, asyncio, tempfile, base64
from concurrent.futures import ThreadPoolExecutor

router = APIRouter()

BYTEZ_KEY = os.getenv("BYTEZ_API_KEY")
if not BYTEZ_KEY:
    raise RuntimeError("BYTEZ_API_KEY not set in .env file")
_sdk = Bytez(BYTEZ_KEY)
_stt_model = _sdk.model("mistral/voxtral-mini-2507")
_executor = ThreadPoolExecutor(max_workers=4)


def _run_stt_sync(audio_b64: str) -> str:
    """
    Voxtral accepts a data URI or public URL.
    We pass a base64 data URI of the recorded audio.
    """
    data_uri = f"data:audio/webm;base64,{audio_b64}"
    result = _stt_model.run(data_uri)

    if result.error:
        raise RuntimeError(f"Voxtral STT error: {result.error}")

    output = result.output
    # Voxtral returns the transcript as a string or in a dict
    if isinstance(output, str):
        return output.strip()
    if isinstance(output, dict):
        # common keys: 'text', 'transcript', 'transcription'
        for key in ('text', 'transcript', 'transcription', 'output'):
            if key in output:
                return str(output[key]).strip()
    if isinstance(output, list) and output:
        return str(output[0]).strip()
    return str(output).strip()


@router.post("/stt")
async def speech_to_text(file: UploadFile = File(...)):
    """
    Accepts a webm/ogg audio blob from the browser MediaRecorder,
    sends it to Voxtral for transcription, returns the transcript.
    """
    audio_bytes = await file.read()
    if not audio_bytes or len(audio_bytes) < 100:
        raise HTTPException(status_code=400, detail="Audio file too small or empty")

    audio_b64 = base64.b64encode(audio_bytes).decode()

    loop = asyncio.get_event_loop()
    try:
        transcript = await loop.run_in_executor(_executor, _run_stt_sync, audio_b64)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT failed: {str(e)}")

    if not transcript:
        raise HTTPException(status_code=422, detail="No speech detected")

    return {"transcript": transcript}