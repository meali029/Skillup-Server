import base64
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from urllib.request import urlopen, Request

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .ocr_engine import CNICExtractor


extractor: Optional[CNICExtractor] = None


class OCRRequest(BaseModel):
    front_url: Optional[str] = Field(default=None, alias="frontUrl")
    back_url: Optional[str] = Field(default=None, alias="backUrl")
    front_image_base64: Optional[str] = Field(default=None, alias="frontImageBase64")
    back_image_base64: Optional[str] = Field(default=None, alias="backImageBase64")


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
    global extractor
    os.environ.setdefault("EASYOCR_MODULE_PATH", str(Path.cwd() / ".EasyOCR"))
    os.environ.setdefault("OMP_NUM_THREADS", "1")
    os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
    os.environ.setdefault("MKL_NUM_THREADS", "1")
    os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

    extractor = CNICExtractor()
    yield


app = FastAPI(title="Skillup OCR Service", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "engineReady": extractor is not None}


def _verify_api_key(api_key: Optional[str]) -> None:
    expected = os.environ.get("OCR_SERVICE_API_KEY")
    if expected and api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid OCR service API key")


@app.post("/ocr/cnic")
def extract_cnic(payload: OCRRequest, x_ocr_service_key: Optional[str] = Header(default=None)):
    _verify_api_key(x_ocr_service_key)

    if extractor is None:
        raise HTTPException(status_code=503, detail="OCR engine is not ready")

    temp_files = []
    try:
        front_path = _input_to_temp(payload.front_url, payload.front_image_base64, "front")
        back_path = _input_to_temp(payload.back_url, payload.back_image_base64, "back")
        temp_files.extend([p for p in [front_path, back_path] if p])

        result = extractor.process(front_path, back_path)
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
