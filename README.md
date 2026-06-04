# SkillUp Server

SkillUp Server is the backend API, realtime, worker, payment, OCR coordination, AI, and admin operations service for the SkillUp freelancing platform.

It powers the SkillUp Client web app, handles authentication, user sessions, jobs, proposals, contracts, payments, notifications, messaging, email delivery, admin moderation, analytics, and platform communication.

## What This Application Is For

SkillUp is a marketplace platform where clients post jobs, freelancers submit proposals, contracts are created, work is submitted and reviewed, and payments are managed through wallet, escrow, and Safepay workflows.

The backend provides:

- REST APIs for the web client.
- Socket.IO realtime events.
- Background workers through BullMQ and Redis.
- Admin modules for platform operations.
- Email delivery through Resend, SendGrid, or Nodemailer.
- Integration points for Google OAuth, Safepay, Cloudinary, Gemini AI, and OCR.

## Key Features

- Local email/password authentication.
- Google OAuth sign-in and profile-completion onboarding.
- JWT authentication with DB-backed user session tracking.
- Role-based access for clients, freelancers, admins, and super admins.
- Job posting, moderation, browsing, recommendations, and lifecycle management.
- Proposal submission, acceptance, rejection, withdrawal, and status updates.
- Contract creation, work submission, review, payment release, and closure.
- Wallet, transactions, withdrawals, platform fees, escrow, and Safepay checkout.
- Safepay callback, webhook, and scheduled pending-transaction verification.
- CNIC verification with optional standalone OCR service.
- Realtime notifications, messages, and cache-refresh events.
- Admin user management, job checking, CNIC verification, payments, analytics, audit logs, sessions, communication, system health, and settings.
- AI-powered job recommendations, freelancer recommendations, proposal drafting, and match scoring.
- Email provider switcher for Resend, SendGrid, and Nodemailer.
- Communication campaigns for admin announcements and account cleanup notices.

## Technology Stack

- Node.js 20 with Express.
- MongoDB with Mongoose.
- Redis with BullMQ, Socket.IO adapter, caching, and session support.
- Socket.IO for realtime communication.
- Passport Google OAuth 2.0.
- JWT for API authentication.
- Express Session with MongoDB/Redis-backed storage.
- Nodemailer, Resend HTTP API, and SendGrid HTTP API for email delivery.
- Cloudinary for media storage.
- Safepay for payment checkout and verification.
- Google Gemini for AI features.
- Swagger/OpenAPI documentation through `swagger-jsdoc` and `swagger-ui-express`.
- Jest, Supertest, and MongoDB Memory Server for testing.
- Railway/Nixpacks for deployment.

## Architecture

The server uses a modular domain structure:

```txt
src/
  app.js                     Express app setup and route mounting
  server.js                  HTTP server bootstrap, sockets, workers, cron jobs
  config/                    database, redis, queues, passport, permissions, swagger
  core/
    errors/                  app errors and error handler
    middlewares/             auth, upload, validation, permissions
    utils/                   email service, templates, audit, responses, env loading
  models/                    Mongoose models
  modules/
    admin/                   admin feature modules
    auth/                    login, register, OAuth, sessions, password reset
    jobs/                    job marketplace APIs
    proposals/               proposal workflows
    contracts/               contract workflows
    payments/                wallet, Safepay, withdrawals, escrow
    messages/                conversations and messages
    notifications/           notification APIs
    cnic/                    CNIC submission and OCR orchestration
    subscriptions/           subscription and plan usage flows
  services/                  AI, matching, payment gateway services
  sockets/                   Socket.IO server and room/event helpers
  workers/                   BullMQ workers and scheduled jobs
  scripts/                   maintenance and seed scripts
```

The standalone OCR service lives in:

```txt
ocr-service/
```

It is deployed separately because EasyOCR and Torch require more memory than the main Node service.

## Communication Flow

### Browser To API

1. SkillUp Client calls REST endpoints under `/api`.
2. Auth uses JWT in `Authorization: Bearer <token>` and/or secure cookies.
3. Middleware validates JWT, checks session status, attaches `req.user`, and enforces permissions.
4. Controllers call domain services.
5. Services read/write MongoDB and optionally emit socket events or queue worker jobs.

### Realtime Flow

1. Client opens one Socket.IO connection to the backend.
2. Backend authenticates the socket and joins user/admin/role rooms.
3. Domain services emit compact events, such as job, proposal, contract, notification, and message updates.
4. Client invalidates React Query caches and fetches fresh API data.

### Email Flow

1. Transactional emails call `sendEmailMessage()`.
2. Active provider is resolved from admin settings.
3. Runtime secrets are loaded from environment/admin env-variable storage.
4. Resend or SendGrid sends through HTTPS APIs in production.
5. Nodemailer remains available for local SMTP or supported production SMTP.
6. Bulk campaign emails use BullMQ when Redis is available.

### Payment Flow

1. Client creates deposit/checkout request.
2. Backend creates Safepay session and returns checkout URL.
3. Safepay redirects to backend callback after checkout.
4. Backend verifies tracker status and updates transaction/wallet/escrow.
5. Scheduled verifier retries pending Safepay transactions.

### OCR Flow

1. User uploads CNIC documents.
2. Backend stores media and calls OCR service when enabled.
3. OCR service extracts text and returns structured data.
4. Admin reviews and approves/rejects verification.

## Benefits

- Modular backend suitable for marketplace growth.
- Strong role and permission boundaries.
- Production-friendly email delivery on Railway through HTTPS email APIs.
- Realtime UX without heavy polling.
- Worker-based background jobs for scalable email and payment verification.
- Separate OCR service prevents main backend memory pressure.
- Admin communication tools for operational announcements and account cleanup.

## Prerequisites

- Node.js 20 or newer.
- npm 9 or newer.
- MongoDB Atlas or local MongoDB.
- Redis for production workers, rate limiting, queues, and realtime scaling.
- Cloudinary account for uploads.
- Google Cloud OAuth credentials.
- Resend or SendGrid account for production email.
- Safepay sandbox or production credentials.
- Optional: Gemini API key for AI features.
- Optional: separate OCR service deployment.

## Initial Setup

```bash
git clone <server-repository-url>
cd Skillup-Server
npm ci
cp .env.example .env
```

Edit `.env` with local values.

Start the backend:

```bash
npm run dev
```

The API runs by default on:

```txt
http://localhost:5000
```

Swagger docs are available at:

```txt
http://localhost:5000/api-docs
```

Seed admin users when needed:

```bash
npm run seed:admin
```

## Environment Configuration

The repo includes `.env.example`. Never commit real secrets.

Important groups:

### Server

```env
NODE_ENV=development
PORT=5000
API_URL=http://localhost:5000
CLIENT_URL=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

### Auth

```env
JWT_SECRET=replace_with_32_plus_character_secret
JWT_EXPIRES_IN=30m
SESSION_SECRET=replace_with_32_plus_character_secret
COOKIE_SECURE=false
```

### Database And Redis

```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<database>
REDIS_URL=redis://localhost:6379
```

Redis is required for production workers and recommended for Socket.IO scaling. If Redis is unavailable, the server falls back for some features, but BullMQ workers are disabled.

### Google OAuth

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback
```

Google Cloud Console must include the same callback URL in Authorized Redirect URIs.

For staging and production, use the deployed backend callback:

```txt
https://staging-api.example.com/api/auth/google/callback
https://api.example.com/api/auth/google/callback
```

### Email

Production default should use Resend or SendGrid:

```env
EMAIL_FROM="SkillUp <support@yourdomain.com>"
EMAIL_REPLY_TO=support@yourdomain.com
RESEND_API_KEY=your_resend_key
SENDGRID_API_KEY=your_sendgrid_key
```

Local SMTP fallback:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_SECURE=false
```

The active provider is managed through Admin Settings.

### Cloudinary

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### AI

```env
AI_ENABLED=true
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite
GEMINI_TIMEOUT=15000
```

### Safepay

```env
SAFEPAY_API_KEY=sec_xxxxx
SAFEPAY_SECRET_KEY=your_secret_key
SAFEPAY_WEBHOOK_SECRET=your_webhook_secret
SAFEPAY_SANDBOX=true
SAFEPAY_CALLBACK_URL=http://localhost:5000/api/payments/callback/safepay
```

### OCR

```env
ENABLE_CNIC_OCR=true
OCR_SERVICE_URL=http://localhost:8000
OCR_SERVICE_API_KEY=local-ocr-secret
OCR_SERVICE_TIMEOUT_MS=180000
```

## OCR Service

The OCR service is a separate FastAPI service under `ocr-service/`.

Local setup:

```bash
cd ocr-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
OCR_SERVICE_API_KEY=local-ocr-secret EASYOCR_MODULE_PATH=.EasyOCR python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Main backend `.env` must use the same `OCR_SERVICE_API_KEY`.

Production deployment should create a separate Railway service with root directory:

```txt
ocr-service
```

## Available Scripts

```bash
npm start              # Start production server
npm run dev            # Start server with nodemon
npm run seed:admin     # Seed initial admin users
npm test               # Run Jest tests serially
npm run test:unit      # Run unit test project
npm run test:integration
npm run test:e2e
npm run test:watch
npm run test:coverage
npm run test:ci
```

## API Documentation And Client Generation

Swagger is mounted at:

```txt
GET /api-docs
```

Current frontend API clients are manually maintained in SkillUp Client.

Recommended generated-client workflow:

1. Export OpenAPI JSON from Swagger.
2. Generate a client using an OpenAPI generator into the frontend `src/api/generated/`.
3. Do not edit generated files manually.
4. Wrap generated methods in React Query hooks.
5. Keep manual API wrappers only for endpoints that need custom behavior.

Example generator direction:

```bash
npx openapi-typescript <openapi-json-url> -o src/api/generated/schema.d.ts
```

For a JavaScript Axios client, use an OpenAPI generator package that fits the frontend build system, then commit only stable generated output if the team decides to version it.

## Deployment

### Railway Main Backend

The repo includes:

```txt
railway.json
nixpacks.toml
```

Railway configuration:

- Builder: Nixpacks.
- Start command: `npm start`.
- Required env vars: all production values listed above.
- Add a Redis service and set `REDIS_URL`.
- Add MongoDB Atlas URI in `MONGO_URI`.

### Railway OCR Service

Deploy `ocr-service/` as a separate service.

Set:

```env
OCR_SERVICE_API_KEY=use_the_same_secret_as_backend_reference
```

Then set on main backend:

```env
OCR_SERVICE_URL=https://your-ocr-service.up.railway.app
OCR_SERVICE_API_KEY=use_the_same_secret_as_ocr_service
```

### Staging And Production

Use separate backend services and databases:

```txt
SkillUp API Development
SkillUp API Staging
SkillUp API Production
```

Do not reuse production databases, Redis instances, payment credentials, or OAuth callback URLs in staging.

## GitHub And Environment Strategy

Recommended GitHub environments:

- `development`
- `staging`
- `production`

Recommended GitHub secrets:

- `MONGO_URI`
- `REDIS_URL`
- `JWT_SECRET`
- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `RESEND_API_KEY`
- `SENDGRID_API_KEY`
- `CLOUDINARY_*`
- `SAFEPAY_*`
- `GEMINI_API_KEY`
- `OCR_SERVICE_API_KEY`

Keep `.env.example` safe and update it when new config keys are added.

## Development Guidelines

- Keep controllers thin and move business logic into services.
- Keep route modules domain-specific.
- Use DTOs for shaping API responses where existing patterns do.
- Use `createAppError` / `AppError` for consistent failures.
- Use `successResponse` for consistent successful responses.
- Emit socket events with compact payloads and let the frontend refetch source-of-truth data.
- Queue background work when it may be slow or retryable.
- Do not store provider secrets in frontend code.

## Testing

Run all tests:

```bash
npm test
```

Run a project:

```bash
npm run test:unit
npm run test:integration
```

Some integration tests use MongoDB Memory Server and may need local port binding. In restricted environments, run them where local ports are allowed.

## Troubleshooting

### Workers disabled

If logs show:

```txt
[Workers] Redis not connected - BullMQ workers disabled
```

Check `REDIS_URL`, Redis service status, and network access.

### Google OAuth returns callback errors

Check:

- `GOOGLE_CALLBACK_URL`
- Google Cloud Console authorized redirect URI
- frontend `VITE_API_URL`
- backend `CLIENT_URL` / `FRONTEND_URL`

### Email fails on Railway SMTP

Railway may block SMTP on some plans. Use Resend or SendGrid through Admin Settings and configure:

```env
EMAIL_FROM
RESEND_API_KEY
```

or:

```env
EMAIL_FROM
SENDGRID_API_KEY
```

### Safepay payment remains pending

Check:

- `SAFEPAY_SANDBOX`
- `SAFEPAY_CALLBACK_URL`
- webhook URL in Safepay dashboard
- `SAFEPAY_WEBHOOK_SECRET`
- Redis/scheduled verifier logs

### OCR crashes or times out

Use the separate OCR service with enough memory. EasyOCR should not run inside the main Node backend in production.

## License

This project is part of the SkillUp platform codebase. Update this section with the final project license before public release.
