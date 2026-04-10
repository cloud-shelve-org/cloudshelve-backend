# CloudShelve Backend

> API server powering CloudShelve — unified cloud storage management, cross-provider file operations, and automated sync scheduling.

## Overview

CloudShelve Backend is a Node.js REST API that handles authentication, cloud provider integrations, file operations, task scheduling, and subscription management. It acts as the bridge between the mobile app and multiple cloud storage providers.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **Auth & Database:** Supabase
- **Job Scheduling:** BullMQ + Redis
- **Validation:** Zod
- **Deployment:** Railway

## Supported Cloud Providers

- Google Drive
- Microsoft OneDrive
- Dropbox
- MEGA
- AWS S3

## Prerequisites

- [Node.js](https://nodejs.org/) (v20 LTS or later)
- npm (v10+)
- [Redis](https://redis.io/) (for job scheduling)
- Supabase project with URL, anon key, and service key

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/your-username/cloudshelve-backend.git
cd cloudshelve-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
PORT=3000
NODE_ENV=development

SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret

# Google Drive
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# OneDrive
ONEDRIVE_CLIENT_ID=
ONEDRIVE_CLIENT_SECRET=
ONEDRIVE_REDIRECT_URI=

# Dropbox
DROPBOX_CLIENT_ID=
DROPBOX_CLIENT_SECRET=
DROPBOX_REDIRECT_URI=

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=

# MEGA
MEGA_EMAIL=
MEGA_PASSWORD=
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
│   ├── config/                 # Environment config, Supabase client, Redis client
│   ├── controllers/            # Request handlers
│   │   ├── auth.controller.ts
│   │   ├── provider.controller.ts
│   │   ├── file.controller.ts
│   │   ├── task.controller.ts
│   │   └── subscription.controller.ts
│   ├── middleware/              # Express middleware
│   │   ├── auth.middleware.ts          # JWT verification via Supabase
│   │   ├── rateLimiter.middleware.ts   # Rate limiting
│   │   ├── subscription.middleware.ts  # Plan limit enforcement
│   │   └── error.middleware.ts         # Global error handler
│   ├── routes/                 # Route definitions
│   │   ├── auth.routes.ts
│   │   ├── provider.routes.ts
│   │   ├── file.routes.ts
│   │   ├── task.routes.ts
│   │   └── subscription.routes.ts
│   ├── services/               # Business logic & provider SDKs
│   │   ├── providers/
│   │   │   ├── gdrive.service.ts
│   │   │   ├── onedrive.service.ts
│   │   │   ├── dropbox.service.ts
│   │   │   ├── mega.service.ts
│   │   │   └── s3.service.ts
│   │   ├── file.service.ts
│   │   ├── task.service.ts
│   │   └── subscription.service.ts
│   ├── jobs/                   # BullMQ job processors
│   │   ├── sync.job.ts
│   │   ├── move.job.ts
│   │   └── cleanup.job.ts
│   ├── types/                  # TypeScript type definitions
│   ├── utils/                  # Helper functions
│   ├── validators/             # Zod schemas for request validation
│   ├── app.ts                  # Express app setup
│   └── server.ts               # Server entry point
├── tsconfig.json
├── .env                        # Environment variables (git-ignored)
├── .env.example                # Environment variable template
├── .gitignore
└── package.json
```

## API Endpoints

### Auth
| Method | Endpoint              | Description              |
| ------ | --------------------- | ------------------------ |
| POST   | `/api/auth/signup`    | Register a new user      |
| POST   | `/api/auth/login`     | Login and receive token  |
| POST   | `/api/auth/logout`    | Invalidate session       |
| GET    | `/api/auth/me`        | Get current user profile |

### Providers
| Method | Endpoint                          | Description                    |
| ------ | --------------------------------- | ------------------------------ |
| GET    | `/api/providers`                  | List connected providers       |
| POST   | `/api/providers/connect`          | Initiate OAuth for a provider  |
| GET    | `/api/providers/:id/callback`     | OAuth callback handler         |
| DELETE | `/api/providers/:id`              | Disconnect a provider          |

### Files
| Method | Endpoint                     | Description                        |
| ------ | ---------------------------- | ---------------------------------- |
| GET    | `/api/files/:providerId`     | List files from a provider         |
| POST   | `/api/files/upload`          | Upload a file to a provider        |
| GET    | `/api/files/download/:id`    | Download a file                    |
| DELETE | `/api/files/:id`             | Delete a file                      |
| POST   | `/api/files/copy`            | Copy file across providers         |
| POST   | `/api/files/move`            | Move file across providers         |

### Tasks
| Method | Endpoint              | Description                       |
| ------ | --------------------- | --------------------------------- |
| GET    | `/api/tasks`          | List user's scheduled tasks       |
| POST   | `/api/tasks`          | Create a new sync/move task       |
| GET    | `/api/tasks/:id`      | Get task details and run history  |
| PUT    | `/api/tasks/:id`      | Update a task                     |
| DELETE | `/api/tasks/:id`      | Delete a task                     |
| POST   | `/api/tasks/:id/run`  | Manually trigger a task           |

### Subscriptions
| Method | Endpoint                      | Description               |
| ------ | ----------------------------- | ------------------------- |
| GET    | `/api/subscriptions/current`  | Get current plan & usage  |
| POST   | `/api/subscriptions/upgrade`  | Upgrade subscription plan |
| GET    | `/api/subscriptions/plans`    | List available plans      |

## Subscription Plans

| Feature              | Free       | Starter    | Pro         |
| -------------------- | ---------- | ---------- | ----------- |
| Scheduled Tasks      | 1          | 10         | Unlimited   |
| Monthly Data Transfer | 1 GB      | 50 GB      | 500 GB      |
| Connected Providers  | 2          | 5          | Unlimited   |
| Priority Support     | —          | —          | ✓           |

## Available Scripts

| Command         | Description                              |
| --------------- | ---------------------------------------- |
| `npm run dev`   | Start dev server with hot reload         |
| `npm run build` | Compile TypeScript to `dist/`            |
| `npm start`     | Run compiled production build            |
| `npm run lint`  | Run ESLint across source files           |

## Deployment (Railway)

1. Push your code to a GitHub repository.
2. Create a new project on [Railway](https://railway.app/).
3. Connect your GitHub repo.
4. Add a Redis instance from Railway's marketplace.
5. Set all environment variables from `.env.example` in Railway's dashboard.
6. Railway will auto-detect the Node.js project and deploy.

Build settings:
- **Build Command:** `npm run build`
- **Start Command:** `npm start`

## Frontend

The companion mobile app lives in the [cloudshelve](../cloudshelve) directory. See its README for setup instructions.