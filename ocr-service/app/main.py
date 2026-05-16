import base64
import os
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from urllib.request import urlopen, Request

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .ocr_engine import CNICExtractor


extractor: Optional[CNICExtractor] = None
ocr_lock = threading.Lock()
extractor_lock = threading.Lock()


class OCRRequest(BaseModel):
    frontUrl: Optional[str] = None
    backUrl: Optional[str] = None
    frontImageBase64: Optional[str] = None
    backImageBase64: Optional[str] = None


def _write_url_to_temp(url: str) -> str:
    suffix = Path(url.split("?", 1)[0]).suffix or ".jpg"
    fd, path = tempfile.mkstemp(prefix="cnic_", suffix=suffix)
    os.close(fd)

    request = Request(url, headers={"User-Agent": "Skillup-OCR-Service/1.0"})
    with urlopen(request, timeout=30) as response:
        Path(path).write_bytes(response.read())

    return path


def _write_base64_to_temp(value: str) -> str:
    if "," in value and value.lower().startswith("data:"):
        value = value.split(",", 1)[1]

    fd, path = tempfile.mkstemp(prefix="cnic_", suffix=".jpg")
    os.close(fd)
    Path(path).write_bytes(base64.b64decode(value))
    return path


def _input_to_temp(url: Optional[str], image_base64: Optional[str], label: str) -> Optional[str]:
    if url:
        return _write_url_to_temp(url)
    if image_base64:
        return _write_base64_to_temp(image_base64)
    if label == "front":
        raise HTTPException(status_code=400, detail="frontUrl or frontImageBase64 is required")
    return None


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.environ.setdefault("EASYOCR_MODULE_PATH", str(Path.cwd() / ".EasyOCR"))
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    os.environ.setdefault("MKL_NUM_THREADS", "1")
    os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

    yield


app = FastAPI(title="Skillup OCR Service", version="1.0.0", lifespan=lifespan)


@app.get("/")
def root():
    return {"service": "skillup-ocr-service", "status": "ok", "engineReady": extractor is not None}


@app.get("/health")
def health():
    return {"status": "ok", "engineReady": extractor is not None}


def _verify_api_key(api_key: Optional[str]) -> None:
    expected = os.environ.get("OCR_SERVICE_API_KEY")
    if expected and api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid OCR service API key")


def _get_extractor() -> CNICExtractor:
    global extractor
    if extractor is not None:
        return extractor

    with extractor_lock:
        if extractor is None:
            extractor = CNICExtractor()
        return extractor


@app.post("/ocr/cnic")
def extract_cnic(payload: OCRRequest, x_ocr_service_key: Optional[str] = Header(default=None)):
    _verify_api_key(x_ocr_service_key)

    temp_files = []
    try:
        front_path = _input_to_temp(payload.frontUrl, payload.frontImageBase64, "front")
        back_path = _input_to_temp(payload.backUrl, payload.backImageBase64, "back")
        temp_files.extend([p for p in [front_path, back_path] if p])

        if not ocr_lock.acquire(blocking=False):
            raise HTTPException(status_code=429, detail="OCR service is busy, please retry shortly")

        try:
            result = _get_extractor().process(front_path, back_path)
        finally:
            ocr_lock.release()

        result["extractionMethod"] = result.get("method") or "easyocr-service"
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        for file_path in temp_files:
            try:
                Path(file_path).unlink(missing_ok=True)
            except Exception:
                pass
