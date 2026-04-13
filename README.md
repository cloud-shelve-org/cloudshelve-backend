# CloudShelve Backend

> REST API powering CloudShelve — unified cloud storage management, OAuth provider integrations, silent token refresh, AES-256-GCM credential encryption, and cross-provider file browsing.

## Overview

CloudShelve Backend is a Node.js/Express REST API written in TypeScript. It handles Supabase-based authentication, OAuth orchestration for cloud storage providers, storage quota syncing, deep-link OAuth callback flows, silent token refresh with re-encryption, and a unified file listing and search API across all connected providers. It is deployed on Railway and consumed by the CloudShelve mobile app.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20 |
| Framework | Express 5 |
| Language | TypeScript 6 |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| Validation | Zod 4 |
| Encryption | Node.js `crypto` — AES-256-GCM |
| Queue / Worker | BullMQ 5 + ioredis 5 |
| Deployment | Railway (Nixpacks) |

## Supported Cloud Providers

| Provider | Auth Method | File API |
|---|---|---|
| Google Drive | OAuth 2.0 | Drive v3 |
| Microsoft OneDrive | OAuth 2.0 (MSAL) | Microsoft Graph |
| Dropbox | OAuth 2.0 | Dropbox v2 |
| Box | OAuth 2.0 | Box 2.0 |
| MEGA | Credential (email + password) | megajs — full CRUD |
| AWS S3 | Credential (access key + secret) | AWS SDK — full CRUD |

## Prerequisites

- [Node.js](https://nodejs.org/) v20 LTS or later
- npm v10+
- A [Supabase](https://supabase.com/) project (URL, anon key, service key)
- OAuth app credentials for whichever providers you want to support
- A 32-byte hex credential encryption key (see `CREDENTIALS_ENCRYPTION_KEY` below)
- Redis ≥ 6 (local Docker or Railway managed instance — required for BullMQ job queue)

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

# ─── Credential Encryption ──────────────────────────────────────────────────────
# 64 hex chars = 32 bytes for AES-256-GCM. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CREDENTIALS_ENCRYPTION_KEY=<64-hex-chars>

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

> MEGA and AWS S3 use credential-based auth — credentials are submitted by the user at connect time via the hosted auth form and are never stored in `.env`.

### 3. Run the database migration

Ensure your Supabase project is linked and push migrations:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 4. Start Redis

BullMQ requires Redis. The easiest way locally is Docker:

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

Or with `docker compose`:
```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

### 5. Start the development server

```bash
npm run dev
```

The API will be available at `http://localhost:3000`. The BullMQ worker starts automatically in the same process.

## Project Structure

```
cloudshelve-backend/
├── src/
│   ├── config/
│   │   ├── env.ts                      # Typed, validated environment variables
│   │   ├── supabase.ts                 # Supabase anon + admin clients
│   │   ├── redis.ts                    # ioredis connection factory
│   │   └── queue.ts                    # BullMQ Queue instance + addDelayedJob / removeJobById
│   ├── controllers/
│   │   ├── auth.controller.ts          # OTP & Google auth
│   │   ├── confirm.controller.ts       # Email confirm deep-link bridge page
│   │   ├── files.controller.ts         # File CRUD endpoints
│   │   ├── jobs.controller.ts          # Scheduled job CRUD endpoints
│   │   ├── legal.controller.ts         # Terms & privacy HTML pages
│   │   └── providers.controller.ts     # Provider CRUD, OAuth flow, deep-link redirect
│   ├── lib/
│   │   └── credentials-crypto.ts       # AES-256-GCM encrypt/decrypt for stored credentials
│   ├── middleware/
│   │   ├── auth.middleware.ts          # Validates Supabase access tokens
│   │   └── error.middleware.ts         # Global error handler
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── files.routes.ts
│   │   ├── jobs.routes.ts              # GET|POST /api/jobs, PATCH /:id/toggle, etc.
│   │   ├── legal.routes.ts
│   │   └── providers.routes.ts
│   ├── services/
│   │   ├── files-adapters.ts           # Per-provider file ops (all 6 providers, full CRUD)
│   │   ├── files.service.ts            # Token resolution + adapter dispatch
│   │   ├── jobs.service.ts             # Job CRUD, computeNextRunAt, BullMQ scheduling
│   │   ├── provider-adapters.ts        # Per-provider OAuth, user info, quota, revoke, refresh
│   │   └── providers.service.ts        # Provider connect, sync, disconnect
│   ├── types/
│   │   └── express.d.ts                # Augments req.user on Express Request
│   ├── validators/
│   │   ├── auth.validator.ts
│   │   ├── jobs.validator.ts           # Zod schema for POST /api/jobs
│   │   └── providers.validator.ts
│   ├── workers/
│   │   └── jobs.worker.ts              # BullMQ Worker — executes copy/move/delete/sync
│   ├── utils/
│   ├── app.ts                          # Express app setup, trust proxy, route mounting
│   └── server.ts                       # HTTP server entry point + startJobsWorker()
├── supabase/
│   └── migrations/
│       ├── 20260410000001_profiles.sql
│       ├── 20260410000002_providers.sql
│       ├── 20260410000003_tasks.sql
│       ├── 20260410000004_subscriptions.sql
│       ├── 20260411000001_providers_update_types.sql
│       └── 20260411000002_providers_encrypted_credentials.sql
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

All protected routes require an `Authorization: Bearer <supabase_access_token>` header.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/providers` | ✅ | List all connected providers for the user |
| `GET` | `/api/providers/:id` | ✅ | Get detail of a specific connected provider |
| `GET` | `/api/providers/oauth-url?provider=<type>` | ✅ | Get OAuth authorization URL for a provider |
| `POST` | `/api/providers/connect` | ✅ | Exchange OAuth code / temp credentials to connect a provider |
| `DELETE` | `/api/providers/:id` | ✅ | Disconnect a provider (revoke tokens + delete record) |
| `POST` | `/api/providers/:id/sync` | ✅ | Trigger manual storage quota sync |
| `GET` | `/api/providers/auth-form` | — | Hosted credential form for MEGA / AWS S3 (in-app browser) |
| `POST` | `/api/providers/auth-form` | — | Submit credential form and redirect to deep link |

#### Provider Types

`google_drive` · `onedrive` · `dropbox` · `box` · `mega` · `aws_s3`

### Files — `/api/files`

All routes require an `Authorization: Bearer <supabase_access_token>` header.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/files/:providerId` | ✅ | List files/folders (supports `folder_id`, `page_token`, `page_size`) |
| `GET` | `/api/files/:providerId/search` | ✅ | Full-text search (`q`, `page_token`, `page_size`) |
| `POST` | `/api/files/:providerId/folder` | ✅ | Create folder — body: `{ parentId, name }` |
| `POST` | `/api/files/:providerId/upload` | ✅ | Upload file (multipart, field `file`) |
| `GET` | `/api/files/:providerId/:fileId/download` | ✅ | Download file — returns binary with `Content-Disposition` |
| `DELETE` | `/api/files/:providerId/:fileId` | ✅ | Delete file or folder |
| `PATCH` | `/api/files/:providerId/:fileId/rename` | ✅ | Rename — body: `{ newName }` |

#### `FileItem` response shape

```json
{
  "id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "name": "Budget 2026.xlsx",
  "kind": "file",
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "size": 24576,
  "modifiedAt": "2026-03-15T10:22:00.000Z",
  "thumbnailUrl": null,
  "downloadUrl": "https://...",
  "path": null,
  "parentId": "root"
}
```

### Jobs — `/api/jobs`

All routes require an `Authorization: Bearer <supabase_access_token>` header.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/jobs` | ✅ | List all jobs |
| `POST` | `/api/jobs` | ✅ | Create a scheduled job |
| `PATCH` | `/api/jobs/:id/toggle` | ✅ | Toggle active ↔ inactive |
| `POST` | `/api/jobs/:id/cancel` | ✅ | Cancel a pending/running job |
| `DELETE` | `/api/jobs/:id` | ✅ | Permanently delete a job |
| `DELETE` | `/api/jobs?filter=completed` | ✅ | Delete all completed/failed/cancelled jobs |

#### POST /api/jobs body

```jsonc
{
  "type": "copy",          // "copy" | "move" | "delete"
  "name": "Nightly Backup",
  "source": {
    "providerId":   "<uuid>",
    "providerType": "google_drive",
    "providerName": "My Drive",
    "folderId":     "1AbC...",   // null = root
    "folderPath":   "/Photos",
    "folderName":   "Photos"
  },
  "destination": { /* same shape */ },
  "schedule": {
    "frequency":     "daily",   // "once"|"daily"|"weekly"|"monthly"|"custom"
    "time":          "03:00",
    "date":          "2026-05-01",  // once only
    "dayOfWeek":     1,             // weekly (0=Sun … 6=Sat)
    "dayOfMonth":    15,            // monthly / custom
    "monthInterval": 2              // custom only
  }
}
```

#### Job response shape (frontend conventions)

```jsonc
{
  "id":          "<uuid>",
  "type":        "copy",      // "delete" on frontend (DB stores "cleanup")
  "name":        "Nightly Backup",
  "status":      "active",    // "active"/"inactive" map to DB "pending" + config.is_active
  "source":      { /* JobLocation */ },
  "destination": { /* JobLocation */ },
  "schedule":    { /* JobSchedule */ },
  "nextRunAt":   "2026-04-13T03:00:00.000Z",
  "lastRunAt":   null,
  "progress":    0,           // 0.0–1.0 float (DB stores 0–100 integer)
  "filesProcessed": 0,
  "totalFiles":  0,
  "currentFile": null,
  "estimatedSecondsRemaining": null,
  "createdAt":   "2026-04-12T10:00:00.000Z",
  "updatedAt":   "2026-04-12T10:00:00.000Z",
  "error":       null
}
```

## Job System (BullMQ + Redis)

### Architecture

```
POST /api/jobs
  └─ jobs.service.createJob()
       ├─ INSERT tasks row (status=pending, config.is_active=true, config.next_run_at=…)
       └─ jobQueue.add('run-task', { taskId, userId }, { delay: msUntilNextRun })
                                                              ↓
jobs.worker.ts  (BullMQ Worker, concurrency=4)
  └─ runTask({ taskId, userId })
       ├─ Re-read task from DB — skip if config.is_active=false (toggle-off race guard)
       ├─ UPDATE status=running
       ├─ collectFiles() — walks all pages in source folder
       ├─ Per-file loop with rolling ETA in DB:
       │    copy / sync  → downloadProviderFile → uploadProviderFile
       │    move         → download → upload → deleteProviderFile
       │    delete       → deleteProviderFile
       └─ On success:
            frequency=once     → UPDATE status=completed, progress=100
            frequency=recurring → computeNextRunAt → UPDATE status=pending, progress=0
                                → jobQueue.add(delay) for next run
```

### Schedule frequencies

| Frequency | config fields used |
|---|---|
| `once` | `date`, `time` — fires once, moves to `completed` |
| `daily` | `time` — re-queues itself every day |
| `weekly` | `time`, `dayOfWeek` (0=Sun–6=Sat) |
| `monthly` | `time`, `dayOfMonth` |
| `custom` | `time`, `dayOfMonth`, `monthInterval` |

### Toggle / Cancel behaviour

| Action | BullMQ | DB |
|---|---|---|
| Create | `jobQueue.add(delay)` | `pending`, `is_active=true` |
| Toggle inactive | `job.remove()` | `pending`, `is_active=false`, `bull_job_id=null` |
| Toggle active | `jobQueue.add(delay)` | `pending`, `is_active=true`, new `next_run_at` |
| Cancel | `job.remove()` | `cancelled`, `bull_job_id=null` |
| Delete | `job.remove()` | row deleted |

### Redis — Local & Railway

**Local development:**

```bash
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

**Railway provisioning:**

1. Open your Railway project → **+ New** → **Database** → **Add Redis**
2. Railway injects `REDIS_URL` automatically into all services in the same project
3. If your backend is in a different project, copy the `REDIS_URL` from the Redis service's **Connect** tab and paste it as an environment variable

Railway Redis uses the `rediss://` (TLS) scheme for public URLs — ioredis handles TLS transparently.

---

## Authentication Architecture

The mobile app authenticates directly via the Supabase SDK (OTP, Google Sign-In). The resulting `access_token` is sent as a Bearer token on all protected API calls. The backend validates it using `supabaseAdmin.auth.getUser(token)` — no custom JWT secret required.

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
2. Backend generates CSRF state, returns { authorization_url, state, redirect_uri }
3. App opens authorization_url in expo-web-browser (Chrome Custom Tabs on Android)
4. User consents → provider redirects to GET /api/providers/oauth/callback?code=…&state=…
5. Backend responds with an HTML page that JS-clicks an <a href="cloudshelve://oauth/callback?…">
   (plain custom-scheme JS navigation works in Chrome Custom Tabs; HTTP 302 and intent:// do not)
6. openAuthSessionAsync resolves with the cloudshelve:// URL
7. App sends POST /api/providers/connect { provider_type, authorization_code, state, redirect_uri }
8. Backend exchanges code for tokens, fetches user info + storage quota, stores encrypted provider
```

**Credential providers (MEGA, AWS S3):**

```
1. App calls GET /api/providers/oauth-url?provider=mega
2. Backend returns URL to hosted credential form (GET /api/providers/auth-form)
3. App opens the form in Chrome Custom Tabs; user submits credentials
4. POST /api/providers/auth-form stores credentials as a one-time temp code, redirects to
   GET /api/providers/oauth/callback?code=cred_…  which JS-clicks cloudshelve://
5. openAuthSessionAsync resolves; app sends POST /api/providers/connect with the temp code
6. Backend retrieves temp credentials, validates with provider, stores AES-256-GCM encrypted
```

## Credential Encryption

All OAuth tokens and provider credentials are encrypted at rest using **AES-256-GCM** before being written to the `connected_providers` table. Decryption is transparent to callers — `providers.service.ts` handles both encrypted and legacy plain-JSON rows.

```
encryptCredentials(plainObject)
  → JSON → AES-256-GCM (random IV per write)
  → stored as "iv:authTag:ciphertext" in the credentials column

decryptCredentials(storedValue)
  → detects { encrypted: "..." } field
  → decrypts and returns plain object
  → falls back to plain object for legacy rows
```

Generate a key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Silent Token Refresh

When any protected file or provider operation is performed, the service layer checks whether the stored OAuth access token has expired (using the stored `expires_at` timestamp with a 5-minute buffer). If it has, the token is silently refreshed using the stored `refresh_token`, and the new credentials are re-encrypted and written back to the database before the operation proceeds.

```
getValidAccessToken(providerRow)
  → if now + 5min < expires_at  →  return stored access_token
  → else  →  call provider's token refresh endpoint
          →  re-encrypt + update DB
          →  return new access_token
```

## Duplicate Account Protection

Connecting the same account twice (same `user_id`, provider type, and email) is rejected with HTTP 409 before any token exchange is persisted.

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

`app.set('trust proxy', true)` is configured so that `req.protocol` correctly returns `https` behind Railway's SSL termination — required for constructing valid OAuth redirect URIs.

To deploy manually:
1. Push to `main` on GitHub — Railway auto-deploys
2. Add a **Redis** database plugin to the same Railway project (see [Job System](#job-system-bullmq--redis))
3. Set all environment variables in the Railway dashboard (`REDIS_URL` is injected automatically by Railway when Redis is in the same project)

### Required Railway environment variables

In addition to the `.env` variables above, set in the Railway dashboard:
- All OAuth client IDs and secrets
- `CREDENTIALS_ENCRYPTION_KEY` — must be identical across all instances
- `SUPABASE_SERVICE_KEY` — service role key (keep secret)

## Database Migrations

Migrations live in `supabase/migrations/`. To apply to your project:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

## Frontend

The companion React Native app lives in the [cloudshelve](../cloudshelve) directory.
