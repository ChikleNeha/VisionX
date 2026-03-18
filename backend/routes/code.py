from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from bytez import Bytez
import subprocess, sys, os, tempfile, asyncio
from concurrent.futures import ThreadPoolExecutor

router = APIRouter()

BYTEZ_KEY = os.getenv("BYTEZ_API_KEY")
if not BYTEZ_KEY:
    raise RuntimeError("BYTEZ_API_KEY not set in .env file")

_sdk   = Bytez(BYTEZ_KEY)
_model = _sdk.model("openai/gpt-4o-mini")
_executor = ThreadPoolExecutor(max_workers=4)

SYSTEM_PROMPT = """
Tu ek Python code converter hai jo spoken Hinglish instructions ko valid Python code mein convert karta hai.

RULES:
- Sirf valid Python code return karo — koi explanation nahi, koi markdown nahi, koi backticks nahi
- Pure Python code only, pehli line se shuru karo
- Agar input already valid Python hai toh waise hi return karo
- Agar input clearly Python nahi hai (jaise sirf ek word) toh ek simple print statement likho

EXAMPLES:
Input: "print hello world"
Output: print("Hello World")

Input: "variable naam equals Rahul"
Output: naam = "Rahul"
print(naam)

Input: "for loop 1 se 5 tak print karo"
Output: for i in range(1, 6):
    print(i)

Input: "function jo do numbers add kare"
Output: def add(a, b):
    return a + b
print(add(3, 5))
""".strip()

ERROR_PROMPT = """
Tu ek Python tutor hai. Ek Python error aaya hai. Hinglish mein samjhao kya galat hua aur kaise theek karein.
2-3 sentences mein, simple language mein. Koi code mat likho — sirf samjhao.
""".strip()


class CodeRequest(BaseModel):
    spoken_text: str
    current_module: int = 1


class CodeResponse(BaseModel):
    code: str
    output: str
    error: str | None
    error_explanation: str | None
    success: bool


def _speech_to_code(spoken: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": spoken}
    ]
    result = _model.run(messages)
    if result.error:
        raise RuntimeError(f"GPT error: {result.error}")
    output = result.output
    if isinstance(output, str):   return output.strip()
    if isinstance(output, dict):  return (output.get("content") or output.get("text", "")).strip()
    if isinstance(output, list):  return str(output[0].get("content", "")).strip()
    return str(output).strip()


def _explain_error(code: str, error: str) -> str:
    messages = [
        {"role": "system", "content": ERROR_PROMPT},
        {"role": "user",   "content": f"Code:\n{code}\n\nError:\n{error}"}
    ]
    result = _model.run(messages)
    if result.error:
        return "Kuch error aaya hai. Code check karo."
    output = result.output
    if isinstance(output, str):  return output.strip()
    if isinstance(output, dict): return (output.get("content") or output.get("text", "")).strip()
    if isinstance(output, list): return str(output[0].get("content", "")).strip()
    return str(output).strip()


def _run_code_sync(code: str) -> tuple[str, str | None]:
    """Run Python code in a subprocess, return (stdout, stderr_or_none)."""
    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.py', delete=False, encoding='utf-8'
    ) as f:
        f.write(code)
        fname = f.name

    try:
        result = subprocess.run(
            [sys.executable, fname],
            capture_output=True,
            text=True,
            timeout=5,
            encoding='utf-8'
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip() if result.returncode != 0 else None
        return stdout, stderr
    except subprocess.TimeoutExpired:
        return "", "TimeoutError: Code 5 seconds se zyada chal raha tha, rok diya."
    except Exception as e:
        return "", str(e)
    finally:
        try:
            os.unlink(fname)
        except Exception:
            pass


@router.post("/code/run", response_model=CodeResponse)
async def run_code(body: CodeRequest):
    if not body.spoken_text.strip():
        raise HTTPException(status_code=400, detail="Spoken text required")

    loop = asyncio.get_event_loop()

    # Step 1: Convert speech to code
    try:
        code = await loop.run_in_executor(_executor, _speech_to_code, body.spoken_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code generation failed: {str(e)}")

    # Step 2: Run code
    stdout, stderr = await loop.run_in_executor(_executor, _run_code_sync, code)

    # Step 3: Explain error in Hinglish if failed
    error_explanation = None
    if stderr:
        try:
            error_explanation = await loop.run_in_executor(
                _executor, _explain_error, code, stderr
            )
        except Exception:
            error_explanation = "Code mein kuch error hai. Dobara try karo."

    # Build spoken output
    if stderr:
        output_spoken = f"Error aaya. {error_explanation}"
    elif stdout:
        output_spoken = f"Code chala! Output hai: {stdout}"
    else:
        output_spoken = "Code successfully chala, koi output nahi tha."

    return CodeResponse(
        code=code,
        output=output_spoken,
        error=stderr,
        error_explanation=error_explanation,
        success=stderr is None
    )