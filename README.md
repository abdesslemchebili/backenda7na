# Nour Academy / Lingua Learn Hub — API

REST API for the Lingua Learn Hub React app. All routes are under `/api`. Default port: **5000** (matches the Vite dev proxy).

## Prerequisites

- **Node.js** 18+
- **MongoDB** 6+ (local or Atlas)

## Setup

1. Copy environment file:

   ```bash
   cp .env.example .env
   ```

2. Set `JWT_SECRET` and, for MongoDB Atlas or a non-default URL, set `MONGODB_URI` or `DATABASE_URL` (both are supported; `MONGODB_URI` takes precedence).

3. Install dependencies:

   ```bash
   npm install
   ```

## Database

There is no separate migration step: Mongoose models define the schema. Start MongoDB locally, for example:

```bash
# macOS (Homebrew)
brew services start mongodb-community
```

Or use Docker:

```bash
docker run -d -p 27017:27017 --name mongo mongo:7
```

## Seed data

Creates demo users (admin, professors, students), courses, class sessions, a **class group (cohort)**, and a sample application.

```bash
npm run seed
```

**Test logins** (after seed):

| Role      | Email                              | Password   |
|-----------|-------------------------------------|------------|
| Admin     | `admin@languageschool.com`         | `admin123` |
| Professor | `sarah.johnson@languageschool.com` | `prof123`  |
| Student   | `marie.dubois@example.com`         | `student123` |

## Run the server

```bash
npm run dev
# or
npm start
```

- Health: `GET http://localhost:5000/api/health`
- Public lead capture: `POST http://localhost:5000/api/leads` (no auth)

## Frontend (Vite)

In the `lingua-learn-hub` project, dev requests use the same origin and proxy `/api` to this backend. Set `FRONTEND_URL` in `.env` to your Vite URL (e.g. `http://localhost:5173`) if you enable CORS for cross-origin use.

## API surface

Canonical paths match `API_ENDPOINTS` in the frontend `src/config/api.ts`. See `docs/backend-api-specification.md` in the frontend repo for behavior and status codes.
