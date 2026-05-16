# Skillup OCR Service

Standalone EasyOCR service for CNIC extraction.

## Railway

Deploy this folder as a separate Railway service with root directory:

```txt
ocr-service
```

Give it more memory than the main Node backend, because EasyOCR loads Torch models at startup.

After deployment, set this variable on `Skillup-Server`:

```txt
OCR_SERVICE_URL=https://your-ocr-service.up.railway.app
OCR_SERVICE_API_KEY=use-a-long-random-secret
```

Set the same secret on the OCR service:

```txt
OCR_SERVICE_API_KEY=use-a-long-random-secret
```

## API

```http
GET /health
POST /ocr/cnic
```

Request body:

```json
{
  "frontUrl": "https://...",
  "backUrl": "https://..."
}
```

The service also accepts `frontImageBase64` and `backImageBase64`.
