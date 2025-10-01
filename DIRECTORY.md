# 📂 Server Directory Guide – SkillUp

This document explains the **folder structure** of the `server/` application and the purpose of each directory.  
Use this guide to know **where to place files** and how to maintain a clean, scalable backend.  

---

## Root Files
server/
│── .env # Environment variables (DB URI, JWT secret, API keys)
│── package.json # Dependencies & scripts
│── README.md # Backend documentation

markdown
Copy code

---

## 📂 src/
Main backend source code.  

---

### 📂 config/
Application configurations.  

- `db.js` → MongoDB connection setup (Mongoose).  
- `logger.js` → Centralized logging (Winston/Pino).  
- `env.js` → Environment variable loader.  
- `cloudinary.js` → Cloudinary setup for file uploads.  
- `paymentGateways.js` → Integration with JazzCash, Easypaisa, Bank APIs.  

---

### 📂 middleware/
Express middlewares used across the app.  

- `authMiddleware.js` → JWT authentication + role-based access control.  
- `errorMiddleware.js` → Centralized error handling.  
- `rateLimiter.js` → Request limiting for security.  
- `validateRequest.js` → Input validation middleware.  
- `uploadMiddleware.js` → File upload handling (Multer + Cloud).  

---

### 📂 models/
Mongoose schemas for MongoDB collections.  

- `User.js` → Freelancer/Client/Admin user model.  
- `Job.js` → Job postings.  
- `Proposal.js` → Proposals and bids.  
- `Payment.js` → Wallet & escrow transactions.  
- `Message.js` → Chat messages.  
- `Admin.js` → Admin management model.  

---

### 📂 modules/
Feature-based folder structure (**Clean Architecture**: Controller → Service → Routes → Validation).  

- 📂 **auth/** → Authentication & verification.  
  - `auth.controller.js` → Handles login/register logic.  
  - `auth.service.js` → Business logic for auth.  
  - `auth.routes.js` → Auth-related endpoints.  
  - `auth.validation.js` → Joi/Yup validation for requests.  

- 📂 **users/** → User profiles (freelancers, clients, admins).  
- 📂 **jobs/** → Job posting, browsing, management.  
- 📂 **proposals/** → Proposal submission, approval/rejection.  
- 📂 **payments/** → Escrow, wallet, transactions.  
- 📂 **messaging/** → Real-time chat (Socket.IO + REST fallback).  
- 📂 **admin/** → Admin panel, dispute resolution.  

👉 Each module contains:
- `*.controller.js` → Request/response handling.  
- `*.service.js` → Core business logic.  
- `*.routes.js` → Express routes.  
- `*.validation.js` → Request validations.  

---

### 📂 services/
External services integration.  

- `emailService.js` → Nodemailer (email verification, notifications).  
- `smsService.js` → SMS OTP & alerts.  
- `aiService.js` → AI-based job matching (OpenAI API).  
- `nadraService.js` → CNIC verification with NADRA API.  
- `cacheService.js` → Redis caching (improves scalability).  

---

### 📂 utils/
Helper functions (reusable across modules).  

- `generateToken.js` → JWT token generation.  
- `responseHandler.js` → Standardized API responses.  
- `passwordHash.js` → Password hashing & comparison (bcrypt).  
- `validators.js` → Generic input validators.  

---

### 📂 sockets/
Socket.IO event handlers for real-time features.  

- `chat.socket.js` → Real-time chat messaging.  
- `notifications.socket.js` → Notifications (proposals, payments, system alerts).  

---

### Core Files
- `app.js` → Main Express app configuration (routes, middleware).  
- `server.js` → Server entry (starts HTTP + WebSocket server).  
- `index.js` → App entry point.  

---

# ✅ Summary
- **config/** → Application & third-party configs.  
- **middleware/** → Express middlewares (auth, validation, error handling).  
- **models/** → MongoDB schemas.  
- **modules/** → Feature-based architecture (auth, jobs, payments, etc.).  
- **services/** → External service integrations (email, AI, NADRA, payments).  
- **utils/** → Helper functions.  
- **sockets/** → Real-time WebSocket event handlers.  
- **app.js/server.js** → Core application bootstrap.  

---