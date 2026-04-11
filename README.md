# CloudShelve Backend

> REST API powering CloudShelve — unified cloud storage management, OAuth provider integrations, and cross-provider file operations.

## Overview

CloudShelve Backend is a Node.js/Express REST API written in TypeScript. It handles Supabase-based authentication, OAuth orchestration for six cloud storage providers, storage quota syncing, and deep-link OAuth callback flows. It is deployed on Railway and consumed by the CloudShelve mobile app.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20 |
| Framework | Express 5 |
| Language | TypeScript 6 |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| Validation | Zod 4 |
| Job Scheduling | BullMQ + Redis *(infrastructure ready)* |
| Deployment | Railway (Nixpacks) |

## Supported Cloud Providers

| Provider | Auth Method |
|---|---|
| Google Drive | OAuth 2.0 |
| Microsoft OneDrive | OAuth 2.0 (MSAL) |
| Dropbox | OAuth 2.0 |
| Box | OAuth 2.0 |
| MEGA | Credential (email + password) |
| AWS S3 | Credential (access key + secret) |

## Prerequisites

- [Node.js](https://nodejs.org/) v20 LTS or later
- npm v10+
- A [Supabase](https://supabase.com/) project (URL, anon key, service key)
- OAuth app credentials for whichever providers you want to support

## Getting Started

### 1. Clone & install

```bash
git clone https://github.com/cloud-shelve-org/cloudshelve-backend.git
cd cloudshelve-backend
npm install
```

### 2. Configure environment variables

Copy the example and fill in your values:

```bash
cp .env.example .env
```

```env
# ─── Core ───────────────────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development

# ─── Supabase ───────────────────────────────────────────────────────────────────
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-role-key>

# ─── JWT (used by legacy /api/auth endpoints only) ───────────────────────────────
JWT_SECRET=<your-jwt-secret>

# ─── Redis ──────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Google Drive OAuth ──────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ─── Microsoft OneDrive OAuth ────────────────────────────────────────────────────
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# ─── Dropbox OAuth ───────────────────────────────────────────────────────────────
DROPBOX_CLIENT_ID=
DROPBOX_CLIENT_SECRET=

# ─── Box OAuth ───────────────────────────────────────────────────────────────────
BOX_CLIENT_ID=
BOX_CLIENT_SECRET=
```

> MEGA and AWS S3 use credential-based auth — their credentials are submitted by the user at connect time via the hosted auth form and are never stored in `.env`.

### 3. Run the database migration

Ensure your Supabase project is linked and push migrations:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Start the development server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`.

## Project Structure

```
cloudshelve-backend/
├── src/
│   ├── config/
│   │   ├── env.ts              # Typed environment variables
│   │   └── supabase.ts         # Supabase anon + admin clients
│   ├── controllers/
│   │   ├── auth.controller.ts          # OTP & Google auth
│   │   ├── confirm.controller.ts       # Email confirm deep-link page
│   │   ├── legal.controller.ts         # Terms & privacy HTML pages
│   │   └── providers.controller.ts     # Provider CRUD + OAuth flow
│   ├── middleware/
│   │   ├── auth.middleware.ts          # Validates Supabase access tokens
│   │   └── error.middleware.ts         # Global error handler
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── legal.routes.ts
│   │   └── providers.routes.ts
│   ├── services/
│   │   ├── provider-adapters.ts        # Per-provider OAuth, user info, quota, revoke
│   │   └── providers.service.ts        # Provider business logic (list, connect, sync, disconnect)
│   ├── types/
│   │   └── express.d.ts                # Augments req.user on Express Request
│   ├── validators/
│   │   ├── auth.validator.ts
│   │   └── providers.validator.ts      # Zod schemas for provider endpoints
│   ├── jobs/                           # BullMQ workers (reserved for future tasks)
│   ├── utils/
│   ├── app.ts                          # Express app setup & route mounting
│   └── server.ts                       # HTTP server entry point
├── supabase/
│   └── migrations/
│       ├── 20260410000001_profiles.sql
│       ├── 20260410000002_providers.sql
│       ├── 20260410000003_tasks.sql
│       ├── 20260410000004_subscriptions.sql
│       └── 20260411000001_providers_update_types.sql
├── nixpacks.toml
├── railway.toml
├── tsconfig.json
├── .env                        # Environment variables (git-ignored)
├── .env.example
└── package.json
```

## API Endpoints

### Health

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Server health check |

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/auth/confirm` | — | Email confirmation deep-link bridge page |
| `POST` | `/api/auth/otp/phone/send` | — | Send OTP to a phone number |
| `POST` | `/api/auth/otp/phone/verify` | — | Verify phone OTP, returns Supabase session |
| `POST` | `/api/auth/otp/email/send` | — | Send OTP to an email address |
| `POST` | `/api/auth/otp/email/verify` | — | Verify email OTP, returns Supabase session |
| `POST` | `/api/auth/google` | — | Exchange Google ID token for Supabase session |
| `DELETE` | `/api/auth/account` | ✅ Bearer | Permanently delete the authenticated user's account |

### Legal — `/api/legal`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/legal/terms` | — | Terms of Service HTML page |
| `GET` | `/api/legal/privacy` | — | Privacy Policy HTML page |

### Providers — `/api/providers`

All protected routes require a `Authorization: Bearer <supabase_access_token>` header.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/providers` | ✅ | List all connected providers for the user |
| `GET` | `/api/providers/:id` | ✅ | Get detail of a specific connected provider |
| `GET` | `/api/providers/oauth-url?provider=<type>` | ✅ | Get OAuth authorization URL for a provider |
| `POST` | `/api/providers/connect` | ✅ | Exchange OAuth code / temp credentials to connect a provider |
| `DELETE` | `/api/providers/:id` | ✅ | Disconnect a provider (revoke tokens + delete record) |
| `POST` | `/api/providers/:id/sync` | ✅ | Trigger manual storage quota sync |
| `GET` | `/api/providers/auth-form` | — | Hosted credential form for MEGA / AWS S3 (in-app browser) |
| `POST` | `/api/providers/auth-form` | — | Submit credential form — stores temp credentials and redirects to deep link |

#### Provider Types

`google_drive` · `onedrive` · `dropbox` · `box` · `mega` · `aws_s3`

## Authentication Architecture

The mobile app authenticates directly via the Supabase SDK (OTP, Google Sign-In). The resulting `access_token` from the Supabase session is sent as a Bearer token on all protected API calls. The backend validates it using `supabaseAdmin.auth.getUser(token)` — no custom JWT secret required.

```
Mobile App
  └─ supabase.auth.signIn*()   ← Supabase returns session
  └─ session.access_token      → sent as Authorization: Bearer <token>
                                         ↓
                               Backend: supabaseAdmin.auth.getUser(token)
                                         ↓
                               req.user = { id, email, phone }
```

## OAuth Flow for Cloud Providers

**OAuth providers (Google Drive, OneDrive, Dropbox, Box):**

```
1. App calls GET /api/providers/oauth-url?provider=google_drive
2. Backend generates CSRF state, returns authorization_url
3. App opens URL in in-app browser
4. User consents → provider redirects to cloudshelve://oauth/callback?code=...&state=...
5. App sends POST /api/providers/connect { provider_type, authorization_code, state, redirect_uri }
6. Backend exchanges code for tokens, fetches user info + storage quota, stores provider record
```

**Credential providers (MEGA, AWS S3):**

```
1. App calls GET /api/providers/oauth-url?provider=mega
2. Backend returns URL to hosted credential form (GET /api/providers/auth-form)
3. App opens form in in-app browser; user submits credentials
4. Backend stores credentials temporarily, redirects to cloudshelve://oauth/callback?code=cred_...
5. App sends POST /api/providers/connect with the temp code
6. Backend validates credentials with provider API, stores encrypted credentials
```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run lint` | Run ESLint across source files |

## Deployment (Railway)

The project deploys automatically from the `main` branch via Railway's GitHub integration.

**Build:** `npm run build` (TypeScript → `dist/`)  
**Start:** `npm start` (`node dist/server.js`)  
**Health check:** `GET /health`

To deploy manually:
1. Push to `main` on GitHub — Railway auto-deploys
2. Set all environment variables in the Railway dashboard
3. Add a Redis instance from Railway's marketplace (for future BullMQ jobs)

## Database Migrations

Migrations live in `supabase/migrations/`. To apply to your project:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

## Frontend

The companion React Native app lives in the [cloudshelve](../cloudshelve) directory.