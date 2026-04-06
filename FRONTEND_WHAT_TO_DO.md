# Frontend: What To Do

This document tells the **frontend** what is implemented on the backend and what the frontend must do to integrate correctly. For full API details (request/response shapes, query params), use **FRONTEND_API_GUIDE.md**.

---

## 1. Backend status (all required endpoints are ready)

| Item | Backend status | Frontend action |
|------|----------------|-----------------|
| **Health check** | `GET /api/health` returns `{ status: 'ok', timestamp, version }` | Call this to verify the backend is up (e.g. on app load or status page). |
| **CORS** | Configured for `FRONTEND_URL` with `credentials: true` | Set your dev/prod API base URL; send requests with `credentials: 'include'` when using cookies. |
| **Rate limiting** | 429 when limit exceeded; `RateLimit-*` and `X-RateLimit-*` headers set | On **429**, show “Too many requests, try again later” and optionally use headers to show retry-after. |
| **Email verification** | Both `GET /api/auth/verify?token=...` and `GET /api/auth/verify/:token` supported | Use either URL shape in verification links or when redirecting from email. |
| **Applications (Become Teacher)** | Full API: POST/GET `/api/applications`, GET/PUT/PATCH `/:id`, status, communication, test, evaluate, `GET /api/applications/stats/overview` | Use these routes from your application service; all are implemented. |
| **Attendance export** | `GET /api/attendance/export?format=csv` or `?format=xlsx` (plus `courseId` or `classId`, optional `from`, `to`) | Use `format=xlsx` for Excel download; `format=csv` (or omit) for CSV. |

---

## 2. What the frontend must do

### 2.1 Base URL and auth

- **Base URL:** Use `process.env.REACT_APP_API_URL` (or equivalent) — e.g. `http://localhost:5000` in dev. All API routes are under `/api`.
- **Auth:** Send JWT in the header: `Authorization: Bearer <token>` on every **protected** request.
- **Credentials:** If you use cookies, send `credentials: 'include'` so CORS allows them.

### 2.2 Health check

- **Endpoint:** `GET /api/health`
- **Use it to:** Check if the backend is up before showing the app or a “Backend unavailable” message.
- **Response:** `{ status: 'ok', timestamp: string, version: string }`

### 2.3 Error handling

- **401:** Missing/invalid/expired token → clear token and redirect to login.
- **403:** Valid token but not allowed (e.g. wrong role, or `requiresVerification` / `paymentRequired`) → show the message from the body (e.g. “Verify email”, “Payment required”).
- **429:** Rate limit exceeded → show “Too many requests, please try again later.” Response body: `{ error: 'Too many requests', message: '...' }`. Optional: read `RateLimit-Remaining` / `RateLimit-Reset` (or `X-RateLimit-*`) to show when the user can retry.
- **4xx/5xx:** Show `message` (or `error`) from the JSON body to the user.

### 2.4 Applications (Become Teacher)

- **Public:** `POST /api/applications` — submit new application (body shape in FRONTEND_API_GUIDE / backend `models/Application.js`).
- **Admin only:**  
  - List: `GET /api/applications` (query: `status`, `language`, `search`, `page`, `limit`, `sortBy`, `sortOrder`).  
  - Stats: `GET /api/applications/stats/overview`.  
  - One: `GET /api/applications/:id`.  
  - Update: `PUT /api/applications/:id`.  
  - Status: `PATCH /api/applications/:id/status`.  
  - Communication: `POST /api/applications/:id/communication`.  
  - Test: `POST /api/applications/:id/test`.  
  - Evaluate: `POST /api/applications/:id/evaluate`.  

All of these are implemented; the frontend can call them as in your application service.

### 2.5 Attendance export

- **Endpoint:** `GET /api/attendance/export` (protected).
- **Query params:**  
  - `courseId` or `classId` (at least one required).  
  - `from`, `to` (optional date range).  
  - `format`: `csv` (default) or `xlsx`.
- **Frontend:** For Excel download use `format=xlsx`; for CSV use `format=csv` or omit `format`. Handle the response as a file (blob) and trigger download with the correct filename/extension.

### 2.6 Email verification links

- Backend accepts:
  - `GET /api/auth/verify?token=...`
  - `GET /api/auth/verify/:token`
- If your emails use the path form (`/api/auth/verify/xxx`), no change needed. If they use query form, use `?token=...`. Frontend can open either URL (e.g. after redirect from email) to verify.

---

## 3. Checklist summary for the frontend

- [ ] Use the correct **base URL** (e.g. `http://localhost:5000` in dev) and prefix all routes with `/api`.
- [ ] Call **GET /api/health** to check backend availability.
- [ ] Send **JWT** in `Authorization: Bearer <token>` for all protected routes.
- [ ] Use **credentials: 'include'** if you rely on cookies.
- [ ] Handle **401** → re-login; **403** → show message (verify email / payment / access denied); **429** → show “Too many requests”; other errors → show `message` from body.
- [ ] Use **Applications** endpoints as in your application service (Become Teacher flow).
- [ ] Use **GET /api/attendance/export?format=xlsx** (or `csv`) with `courseId` or `classId` for file download.
- [ ] Use **GET /api/auth/verify** with `?token=...` or `/verify/:token` for email verification.

For request/response shapes, query parameters, and pagination, see **FRONTEND_API_GUIDE.md**.
