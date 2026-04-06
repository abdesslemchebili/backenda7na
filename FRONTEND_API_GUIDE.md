# Frontend API Integration Guide

This document describes everything the frontend needs to connect to the backend, send requests, and consume the API.

---

## Table of contents

1. [Base URL & environment](#1-base-url--environment)
2. [Authentication](#2-authentication)
3. [Request / response format](#3-request--response-format)
4. [Error handling](#4-error-handling)
5. [Auth endpoints](#5-auth-endpoints)
6. [Users endpoints](#6-users-endpoints)
7. [Courses endpoints](#7-courses-endpoints)
8. [Classes endpoints](#8-classes-endpoints)
9. [Applications endpoints](#9-applications-endpoints)
10. [Roles and permissions](#10-roles-and-permissions)
11. [Query params and pagination](#11-query-params-and-pagination)

---

## 1. Base URL & environment

- **Development:** `http://localhost:5000` (or the value of `PORT` in backend `.env`)
- **Production:** Use the same origin as your backend (e.g. `https://api.yourdomain.com`)

All API routes are prefixed with `/api`:

- Auth: `/api/auth/*`
- Users: `/api/users/*`
- Courses: `/api/courses/*`
- Classes: `/api/classes/*`
- Applications: `/api/applications/*`

**CORS:** The backend allows requests from `FRONTEND_URL` (e.g. `http://localhost:3000`) with credentials. Use `credentials: 'include'` when sending cookies; for JWT you only need the `Authorization` header.

**Health check:** `GET /api/health` → `{ status: 'ok', timestamp, version }`. Use it to verify the backend is up.

---

## 2. Authentication

### 2.1 How it works

- The backend uses **JWT**. After login or register, the API returns a **token**.
- The frontend must send this token on every **protected** request in the **Authorization** header:

```http
Authorization: Bearer <token>
```

Example with `fetch`:

```javascript
const token = localStorage.getItem('token'); // or your auth store
fetch(`${API_BASE}/api/users/profile`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});
```

### 2.2 When the token is invalid or expired

- **401** responses mean: missing token, invalid token, or expired token. Redirect the user to login and clear the stored token.
- **403** responses mean: valid token but not allowed (role, status, or resource ownership). Show an “access denied” message.

### 2.3 Login rules (important for UX)

- **Email not verified:** Login returns **403** with `requiresVerification: true`. Show a message and a “Resend verification email” action (use `POST /api/auth/resend-verification`).
- **Student not paid:** Login returns **403** with `paymentRequired: true` and `status`. Show a “Payment required” message.
- **Account locked:** **423** with a message about too many failed attempts.

---

## 3. Request / response format

- **Content-Type:** Send JSON with `Content-Type: application/json`.
- **Body:** Use `JSON.stringify()` for POST/PUT/PATCH.
- **Responses:** Successful responses are JSON. Error responses are also JSON (see [Error handling](#4-error-handling)).

---

## 4. Error handling

Error responses follow this shape:

```json
{
  "error": "Short error type",
  "message": "Human-readable message"
}
```

Sometimes extra fields are present (e.g. `requiresVerification`, `paymentRequired`, `status`).

**HTTP status codes:**

| Code | Meaning |
|------|--------|
| 400 | Bad request (validation, missing fields, invalid data) |
| 401 | Unauthorized (no token, invalid or expired token) |
| 403 | Forbidden (wrong role, status, or ownership) |
| 404 | Not found |
| 423 | Locked (account locked) |
| 429 | Too many requests (rate limit) |
| 500 | Server error |

Always check `response.ok` or `response.status` and read the JSON body to show `message` (and optionally `error`) to the user.

---

## 5. Auth endpoints

Base path: **`/api/auth`**

### Public (no token)

| Method | Endpoint | Description | Body |
|--------|----------|-------------|------|
| POST | `/login` | Log in | `{ "email": string, "password": string }` |
| POST | `/register` | Create account | See below |
| POST | `/request-password-reset` | Request reset email | `{ "email": string, "language"?: "en" \| "fr" \| "ar" }` |
| POST | `/reset-password` | Set new password with token | `{ "token": string, "newPassword": string }` |
| POST | `/resend-verification` | Resend verification email | `{ "email": string, "language"?: "en" \| "fr" \| "ar" }` |
| GET  | `/verify` or `/verify/:token` | Verify email (link from email) | — |

**POST /register** body:

```json
{
  "firstName": "string (required)",
  "lastName": "string (required)",
  "email": "string (required)",
  "password": "string (required, min 6)",
  "confirmPassword": "string (required, must match password)",
  "role": "student | professor (optional, default: student)"
}
```

**Login success response (200):**

```json
{
  "token": "JWT string",
  "user": {
    "_id": "string",
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "role": "student | professor | admin",
    "status": "string",
    "phone": "string | undefined",
    "avatar": "string | undefined",
    "bio": { "en": "string", "fr": "string", "ar": "string" },
    "preferences": {
      "language": "en | fr | ar",
      "notifications": { "email": boolean, "push": boolean }
    },
    "createdAt": "ISO date",
    "updatedAt": "ISO date"
  }
}
```

**Register success (201):**

```json
{
  "message": "Account created successfully. Please check your email to verify your account.",
  "user": { "_id": "string", "email": "string", "role": "string" }
}
```

In development only, the response may also include `_devVerificationLink` (URL to verify without opening the email).

**Email verification link:** The link in the verification email points to the **backend**. When the user clicks it, the backend verifies the token and either returns JSON or, in a browser, an HTML success page. The frontend can also call `GET /api/auth/verify?token=...` with the token (e.g. from the URL after redirect from email) to verify programmatically.

---

### Protected (Bearer token required)

| Method | Endpoint | Description | Who |
|--------|----------|-------------|-----|
| GET  | `/profile` | Current user profile | Any authenticated user |
| POST | `/invite`  | Invite a user by email | Admin only |

**GET /profile** returns the same user object shape as login (without `token`).

**POST /invite** body (admin only):  
`firstName`, `lastName`, `email`, `role`, `adminLevel` (required if role is admin), `language` (optional).

---

## 6. Users endpoints

Base path: **`/api/users`**

All routes below require **Bearer token** unless noted.

| Method | Endpoint | Description | Who |
|--------|----------|-------------|-----|
| GET  | `/profile` | My profile | Any |
| PUT  | `/profile` | Update my profile | Any |
| GET  | `/` | List users (paginated) | Admin |
| GET  | `/stats/overview` | User statistics | Admin |
| GET  | `/:id` | User by ID | Admin or owner |
| PUT  | `/:id` | Update user | Admin or owner |
| DELETE | `/:id` | Delete user | Admin |
| PATCH | `/:id/status` | Update user status | Admin |

**Profile update (PUT /profile)**  
Send only the fields you want to change (e.g. `firstName`, `lastName`, `phone`, `bio`, `preferences`). Do not send `password`, `email`, `role`, or other restricted fields.

**List users (GET /)**  
Query params: `role`, `status`, `search`, `page`, `limit`, `sortBy`, `sortOrder`.  
Response: `{ data: User[], pagination: { page, limit, total, pages } }`.

**Update status (PATCH /:id/status)**  
Body: `{ "status": "invited" | "pending" | "verified" | "reglo" | "suspended" }`.

---

## 7. Courses endpoints

Base path: **`/api/courses`**

### Public (no auth) or optional auth

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List courses (filtered by role if logged in) | Optional |
| GET | `/featured` | Featured courses | No |
| GET | `/search` | Search courses | No |
| GET | `/:id` | Course by ID | Optional |

**List (GET /)**  
Query params: `language`, `level`, `category`, `status`, `professor`, `search`, `page`, `limit`, `sortBy`, `sortOrder`.  
Response: `{ data: Course[], pagination: { page, limit, total, pages } }`.  
- Not logged in: only public published courses.  
- Student: public + courses they are enrolled in.  
- Professor: published + their own.  
- Admin: all.

### Protected

| Method | Endpoint | Description | Who |
|--------|----------|-------------|-----|
| POST | `/` | Create course | Professor, Admin |
| PUT  | `/:id` | Update course | Professor (owner), Admin |
| DELETE | `/:id` | Delete course | Professor (owner), Admin |
| POST | `/:id/enroll` | Enroll in course | Student (status reglo) |
| DELETE | `/:id/enroll` | Unenroll | Student (status reglo) |
| PATCH | `/:id/progress` | Update progress | Professor, Admin |

**Course object (summary):**  
Multilingual `title` and `description` (`en`, `fr`, `ar`), `language`, `level`, `category`, `duration`, `maxStudents`, `status`, `isPublic`, `professor` (populated), `enrolledStudents`, etc.

**Create course (POST /)**  
Body must include at least: `title` (en, fr, ar), `description` (en, fr, ar), `language`, `level`, `category`, `duration`. See backend Course model for full schema.

---

## 8. Classes endpoints

Base path: **`/api/classes`**

All routes require **Bearer token**.

| Method | Endpoint | Description | Who |
|--------|----------|-------------|-----|
| GET  | `/` | List classes | Any (filtered by role) |
| GET  | `/live` | Live classes | Any |
| GET  | `/upcoming` | Upcoming classes | Any |
| GET  | `/:id` | Class by ID | Any (if allowed) |
| POST | `/` | Create class | Professor, Admin |
| PUT  | `/:id` | Update class | Professor, Admin |
| DELETE | `/:id` | Delete class | Professor, Admin |
| POST | `/:id/enroll` | Enroll in class | Student (reglo) |
| POST | `/:id/attendance` | Mark attendance | Professor, Admin |

Query params for **GET /**:** `course`, `type`, `status`, `professor`, `search`, `page`, `limit`, `sortBy`, `sortOrder`.  
Response: `{ data: Class[], pagination }`.  
Students only see classes for courses they are enrolled in; professors see their classes and public course classes; admins see all.

---

## 9. Applications endpoints

Base path: **`/api/applications`**

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Submit a new application (e.g. to become a professor) |

**POST /** body:** Nested object matching the Application model: `applicant` (firstName, lastName, email, phone, dateOfBirth, nationality), `education`, `teachingExperience`, `languages`, `motivation`, etc. See backend `models/Application.js` for full required fields.

### Admin only (Bearer token + role admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/` | List applications (paginated) |
| GET  | `/stats/overview` | Application statistics |
| GET  | `/:id` | Application by ID |
| PUT  | `/:id` | Update application |
| PATCH | `/:id/status` | Update status |
| POST | `/:id/communication` | Add communication log |
| POST | `/:id/test` | Schedule test |
| POST | `/:id/evaluate` | Evaluate application |

List (GET /) query params: `status`, `language`, `search`, `page`, `limit`, `sortBy`, `sortOrder`.  
Response: `{ data: Application[], pagination }`.

---

## 10. Roles and permissions

| Role | Description |
|------|-------------|
| **student** | Can view public/own courses, enroll (if status `reglo`), view own profile and classes for enrolled courses. |
| **professor** | Can manage own courses and classes, view students, mark attendance. |
| **admin** | Full access: users, applications, all courses/classes, invite, status updates. |

**User status** (relevant for students):  
`invited` → `pending` → `verified` → **`reglo`** (payment confirmed). Only students with status **`reglo`** can enroll in courses/classes.

**Flow for frontend:**

1. After **login**, store `token` and `user` (including `user.role` and `user.status`).
2. Use `user.role` to show/hide menus and actions (e.g. “Enroll” only for students with `status === 'reglo'`).
3. On **401**, clear token and redirect to login.
4. On **403**, show “Access denied” or a specific message (e.g. “Verify email”, “Payment required”).

---

## 11. Query params and pagination

**Common query parameters for list endpoints:**

- **page** (default 1), **limit** (default 10)**  
- **sortBy**, **sortOrder** (`asc` | `desc`)  
- **search** (full-text search where supported)  
- Resource-specific filters (e.g. `role`, `status`, `language`, `level`)

**Pagination response shape:**

```json
{
  "data": [ /* array of resources */ ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "pages": 5
  }
}
```

Use `pagination.pages` and `pagination.total` for “Page X of Y” and next/previous buttons.

---

## Quick reference: base URL and auth header

```javascript
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function authHeaders() {
  const token = localStorage.getItem('token'); // or your auth state
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

// Example: fetch current user
const res = await fetch(`${API_BASE}/api/auth/profile`, { headers: authHeaders() });
if (!res.ok) {
  const err = await res.json();
  if (res.status === 401) {
    // clear token, redirect to login
  }
  throw new Error(err.message || err.error);
}
const user = await res.json();
```

---

## Summary checklist for the frontend

- [ ] Use **base URL** `/api` on the backend (e.g. `http://localhost:5000` in dev).
- [ ] Send **JWT** in `Authorization: Bearer <token>` for all protected routes.
- [ ] Send **JSON** with `Content-Type: application/json` for POST/PUT/PATCH.
- [ ] Handle **401** (re-login), **403** (show message / verify email / payment), **4xx/5xx** (show `message` from body).
- [ ] Use **query params** for list endpoints (page, limit, filters, search).
- [ ] Use **pagination** object from list responses for UI.
- [ ] Respect **roles** (student / professor / admin) and **status** (e.g. reglo for enrollment).
- [ ] After **login/register**, store `token` and `user`; use `user.role` and `user.status` for UI and guards.

For exact request bodies and field enums, refer to the backend models: `models/User.js`, `models/Course.js`, `models/Class.js`, `models/Application.js`.
