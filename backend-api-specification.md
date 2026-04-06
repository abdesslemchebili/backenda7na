# Backend API Specification

**E-Learning Virtual School Platform — LinguaLearn**

This document defines the complete REST API required to support the frontend. It is derived from frontend usage and platform requirements. Base path for all routes: `/api`.

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Users](#2-users)
3. [Courses](#3-courses)
4. [Live Sessions](#4-live-sessions)
5. [Documents](#5-documents)
6. [Attendance](#6-attendance)
7. [Assignments](#7-assignments)
8. [Notifications](#8-notifications)
9. [Dashboard & Analytics](#9-dashboard--analytics)
10. [System Settings](#10-system-settings)
11. [Appendix](#11-appendix)

---

## General Conventions

- **Base URL:** `http://localhost:5000` (dev) or production API URL.
- **Content-Type:** `application/json` for request/response bodies (except file uploads: `multipart/form-data`).
- **Authentication:** Protected routes require header: `Authorization: Bearer <JWT>`.
- **Error response shape:** `{ "error": "string", "message": "string" }` with optional fields (`requiresVerification`, `paymentRequired`, `status`, `details`).
- **Pagination:** List endpoints return `{ "data": [], "pagination": { "page", "limit", "total", "pages" } }`. Query params: `page` (default 1), `limit` (default 10), `sortBy`, `sortOrder` (`asc`|`desc`).

---

## 1. Authentication

Base path: **`/api/auth`**

### 1.1 Register

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/auth/register` |
| **Description** | Create a new user account (student or professor). |
| **Required Role** | None (public) |
| **Authentication** | No |

**Request Body:**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "password": "securePass123",
  "confirmPassword": "securePass123",
  "role": "student"
}
```

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| firstName | string | Yes | |
| lastName | string | Yes | |
| email | string | Yes | Unique |
| password | string | Yes | Min 6 characters |
| confirmPassword | string | Yes | Must match password |
| role | string | No | `student` \| `professor`, default `student` |

**Success Response (201):**

```json
{
  "message": "Account created successfully. Please check your email to verify your account.",
  "user": {
    "_id": "usr_abc123",
    "email": "jane@example.com",
    "role": "student"
  }
}
```

**Error Response (400):**

```json
{
  "error": "ValidationError",
  "message": "Email already registered",
  "details": { "field": "email" }
}
```

---

### 1.2 Login

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/auth/login` |
| **Description** | Authenticate and receive JWT and user object. |
| **Required Role** | None (public) |
| **Authentication** | No |

**Request Body:**

```json
{
  "email": "jane@example.com",
  "password": "securePass123"
}
```

**Success Response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "usr_abc123",
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com",
    "role": "student",
    "status": "reglo",
    "phone": null,
    "avatar": null,
    "bio": { "en": "", "fr": "", "ar": "" },
    "preferences": {
      "language": "en",
      "notifications": { "email": true, "push": false }
    },
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

**Error Response (403 — email not verified):**

```json
{
  "error": "Forbidden",
  "message": "Please verify your email before signing in.",
  "requiresVerification": true
}
```

**Error Response (403 — payment required):**

```json
{
  "error": "Forbidden",
  "message": "Payment required to access the platform.",
  "paymentRequired": true,
  "status": "verified"
}
```

**Error Response (423 — account locked):**

```json
{
  "error": "Locked",
  "message": "Account temporarily locked due to too many failed attempts."
}
```

---

### 1.3 Refresh Token

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/auth/refresh` |
| **Description** | Issue a new access token using a valid refresh token (cookie or body). |
| **Required Role** | Any authenticated user (via refresh token) |
| **Authentication** | Refresh token (cookie or body) |

**Request Body (optional):**

```json
{
  "refreshToken": "optional_if_using_cookie"
}
```

**Success Response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

**Error Response (401):**

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired refresh token"
}
```

---

### 1.4 Logout

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/auth/logout` |
| **Description** | Invalidate refresh token (if used). Client should clear stored access token. |
| **Required Role** | Any authenticated user |
| **Authentication** | Yes |

**Request Body:** None (or optional `refreshToken` if not using httpOnly cookie).

**Success Response (200):**

```json
{
  "message": "Logged out successfully"
}
```

---

### 1.5 Forgot Password

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/auth/request-password-reset` |
| **Description** | Send password reset email to the given address. |
| **Required Role** | None (public) |
| **Authentication** | No |

**Request Body:**

```json
{
  "email": "jane@example.com",
  "language": "en"
}
```

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| email | string | Yes | |
| language | string | No | `en` \| `fr` \| `ar`, for email template |

**Success Response (200):**

```json
{
  "message": "If an account exists with this email, you will receive a password reset link."
}
```

---

### 1.6 Reset Password

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/auth/reset-password` |
| **Description** | Set new password using the token from the reset email. |
| **Required Role** | None (public) |
| **Authentication** | No |

**Request Body:**

```json
{
  "token": "reset_token_from_email",
  "newPassword": "newSecurePass456"
}
```

**Success Response (200):**

```json
{
  "message": "Password has been reset. You can now sign in."
}
```

**Error Response (400):**

```json
{
  "error": "BadRequest",
  "message": "Invalid or expired reset token"
}
```

---

### 1.7 Email Verification

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/auth/verify` or `/api/auth/verify/:token` |
| **Description** | Verify user email via link (token in URL or query). |
| **Required Role** | None (public) |
| **Authentication** | No |

**Query Parameters:** `token` (optional if path includes `:token`).

**Success Response (200):**

```json
{
  "message": "Email verified successfully. You can now sign in."
}
```

**Error Response (400):**

```json
{
  "error": "BadRequest",
  "message": "Invalid or expired verification token"
}
```

---

### 1.8 Resend Verification Email

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/auth/resend-verification` |
| **Description** | Resend verification email to the given address. |
| **Required Role** | None (public) |
| **Authentication** | No |

**Request Body:**

```json
{
  "email": "jane@example.com",
  "language": "en"
}
```

**Success Response (200):**

```json
{
  "message": "If the account is unverified, a new verification email has been sent."
}
```

---

### 1.9 Get Current Profile (Auth)

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/auth/profile` |
| **Description** | Get current user profile (same shape as login user object). |
| **Required Role** | Any authenticated user |
| **Authentication** | Yes |

**Success Response (200):** Same user object as in login response (without `token`).

**Error Response (401):**

```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

---

### 1.10 Invite User (Admin)

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/auth/invite` |
| **Description** | Invite a user by email (admin creates account and sends invite). |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "firstName": "John",
  "lastName": "Smith",
  "email": "john@school.com",
  "role": "professor",
  "adminLevel": "full",
  "language": "en"
}
```

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| adminLevel | string | Conditional | Required if `role` is `admin` |
| language | string | No | `en` \| `fr` \| `ar` |

**Success Response (201):**

```json
{
  "message": "Invitation sent successfully",
  "user": { "_id": "usr_xyz", "email": "john@school.com", "role": "professor" }
}
```

---

## 2. Users

Base path: **`/api/users`**

All routes in this section require **Authentication: Yes** unless noted.

### 2.1 Get All Users (Admin)

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/users` |
| **Description** | List users with filters and pagination. |
| **Required Role** | Admin |
| **Authentication** | Yes |
| **Pagination** | Yes |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Default 1 |
| limit | number | No | Default 10 |
| role | string | No | `student` \| `professor` \| `admin` |
| status | string | No | `invited` \| `pending` \| `verified` \| `reglo` \| `suspended` |
| search | string | No | Search by name/email |
| sortBy | string | No | e.g. `createdAt`, `lastName` |
| sortOrder | string | No | `asc` \| `desc` |

**Success Response (200):**

```json
{
  "data": [
    {
      "_id": "usr_abc123",
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane@example.com",
      "role": "student",
      "status": "reglo",
      "phone": null,
      "avatar": null,
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

---

### 2.2 Get User by ID

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/users/:id` |
| **Description** | Get a single user by ID. Admin or owner only. |
| **Required Role** | Admin, or owner (self) |
| **Authentication** | Yes |

**Success Response (200):** Full user object.

**Error Response (404):**

```json
{
  "error": "NotFound",
  "message": "User not found"
}
```

---

### 2.3 Update Profile (Self)

| Field | Value |
|-------|--------|
| **Method** | PUT |
| **Path** | `/api/users/profile` |
| **Description** | Update current user's profile. Only allowed fields (e.g. firstName, lastName, phone, bio, preferences). |
| **Required Role** | Any authenticated user |
| **Authentication** | Yes |

**Request Body (partial):**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "+1234567890",
  "bio": { "en": "Hello", "fr": "Bonjour", "ar": "" },
  "preferences": {
    "language": "en",
    "notifications": { "email": true, "push": false }
  }
}
```

**Success Response (200):** Updated user object.

---

### 2.4 Update User (Admin)

| Field | Value |
|-------|--------|
| **Method** | PUT |
| **Path** | `/api/users/:id` |
| **Description** | Update any user. Admin only. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Request Body:** Same as profile update; admin may also update restricted fields as per policy.

**Success Response (200):** Updated user object.

---

### 2.5 Suspend User (Update Status)

| Field | Value |
|-------|--------|
| **Method** | PATCH |
| **Path** | `/api/users/:id/status` |
| **Description** | Update user status (e.g. suspend, activate). Admin only. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "status": "suspended",
  "reason": "Optional reason for audit"
}
```

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| status | string | Yes | `invited` \| `pending` \| `verified` \| `reglo` \| `suspended` |
| reason | string | No | Audit log |

**Success Response (200):** Updated user object.

---

### 2.6 Change Role (Admin)

| Field | Value |
|-------|--------|
| **Method** | PATCH |
| **Path** | `/api/users/:id/role` |
| **Description** | Change a user's role. Admin only. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "role": "professor"
}
```

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| role | string | Yes | `student` \| `professor` \| `admin` |

**Success Response (200):** Updated user object.

---

### 2.7 Delete User (Admin)

| Field | Value |
|-------|--------|
| **Method** | DELETE |
| **Path** | `/api/users/:id` |
| **Description** | Soft-delete or hard-delete a user. Admin only. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Success Response (200):**

```json
{
  "message": "User deleted successfully"
}
```

---

### 2.8 User Statistics (Admin)

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/users/stats/overview` |
| **Description** | Get user counts by role and status for admin dashboard. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Success Response (200):**

```json
{
  "total": 12450,
  "students": 12000,
  "professors": 248,
  "admins": 5,
  "byStatus": {
    "invited": 10,
    "pending": 100,
    "verified": 2000,
    "reglo": 10000,
    "suspended": 340
  }
}
```

---

## 3. Courses

Base path: **`/api/courses`**

### 3.1 Get All Courses

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/courses` |
| **Description** | List courses. Filtering by role: public = published only; student = published + enrolled; professor = published + own; admin = all. |
| **Required Role** | Optional auth (behavior varies by role) |
| **Authentication** | Optional |
| **Pagination** | Yes |

**Query Parameters:** `language`, `level`, `category`, `status`, `professor`, `search`, `page`, `limit`, `sortBy`, `sortOrder`.

**Success Response (200):**

```json
{
  "data": [
    {
      "_id": "crs_abc",
      "title": { "en": "English for Beginners", "fr": "", "ar": "" },
      "description": { "en": "...", "fr": "", "ar": "" },
      "shortDescription": { "en": "...", "fr": "", "ar": "" },
      "language": "english",
      "level": "beginner",
      "category": "general",
      "duration": 20,
      "maxStudents": 25,
      "enrolledCount": 12,
      "price": 0,
      "currency": "MAD",
      "status": "published",
      "isPublic": true,
      "featured": false,
      "thumbnail": "https://...",
      "professor": { "_id": "...", "firstName": "Sarah", "lastName": "Johnson" },
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 52, "pages": 6 }
}
```

---

### 3.2 Get Course Details

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/courses/:id` |
| **Description** | Get single course by ID with optional populated professor. |
| **Required Role** | Public for published; student/professor/admin for draft/enrolled/own. |
| **Authentication** | Optional |

**Success Response (200):** Full course object.

**Error Response (404):**

```json
{
  "error": "NotFound",
  "message": "Course not found"
}
```

---

### 3.3 Create Course

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/courses` |
| **Description** | Create a new course. Professor or Admin. |
| **Required Role** | Professor, Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "title": { "en": "English for Beginners", "fr": "", "ar": "" },
  "description": { "en": "Full description", "fr": "", "ar": "" },
  "shortDescription": { "en": "Short", "fr": "", "ar": "" },
  "language": "english",
  "level": "beginner",
  "category": "general",
  "duration": 20,
  "maxStudents": 25,
  "price": 0,
  "currency": "MAD",
  "status": "draft",
  "isPublic": true,
  "thumbnail": "https://..."
}
```

**Success Response (201):** Created course object.

---

### 3.4 Update Course

| Field | Value |
|-------|--------|
| **Method** | PUT |
| **Path** | `/api/courses/:id` |
| **Description** | Update course. Professor (owner) or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |

**Request Body:** Partial course object (same fields as create).

**Success Response (200):** Updated course object.

---

### 3.5 Delete Course

| Field | Value |
|-------|--------|
| **Method** | DELETE |
| **Path** | `/api/courses/:id` |
| **Description** | Delete (or archive) course. Professor (owner) or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |

**Success Response (200):**

```json
{
  "message": "Course deleted successfully"
}
```

---

### 3.6 Enroll Student

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/courses/:id/enroll` |
| **Description** | Enroll current user (student) in course. Student must have status `reglo`. |
| **Required Role** | Student |
| **Authentication** | Yes |

**Request Body:** None (or empty object).

**Success Response (200):**

```json
{
  "message": "Enrolled successfully"
}
```

**Error Response (403):**

```json
{
  "error": "Forbidden",
  "message": "Only students with payment confirmed (reglo) can enroll"
}
```

---

### 3.7 Remove Student (Unenroll)

| Field | Value |
|-------|--------|
| **Method** | DELETE |
| **Path** | `/api/courses/:id/enroll` |
| **Description** | Unenroll current user from course, or Admin/Professor remove a student. |
| **Required Role** | Student (self), Professor (owner), Admin |
| **Authentication** | Yes |

**Query Parameters (optional):** `studentId` — when provided, Professor/Admin can remove that student.

**Success Response (200):**

```json
{
  "message": "Unenrolled successfully"
}
```

---

### 3.8 Featured Courses

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/courses/featured` |
| **Description** | Get featured courses for landing/catalog. |
| **Required Role** | None |
| **Authentication** | No |
| **Pagination** | Optional (e.g. limit) |

**Query Parameters:** `limit` (default 6).

**Success Response (200):** `{ "data": [ Course, ... ] }` or array of courses.

---

### 3.9 Search Courses

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/courses/search` |
| **Description** | Search courses by query and filters. |
| **Required Role** | Optional auth |
| **Authentication** | Optional |
| **Pagination** | Yes |

**Query Parameters:** `search`, `language`, `level`, `category`, `page`, `limit`, `sortBy`, `sortOrder`.

**Success Response (200):** Same as Get All Courses.

---

### 3.10 Update Student Progress

| Field | Value |
|-------|--------|
| **Method** | PATCH |
| **Path** | `/api/courses/:id/progress` |
| **Description** | Update a student's progress percentage for the course. Professor or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "studentId": "usr_abc123",
  "progress": 65
}
```

**Success Response (200):** Updated enrollment or success message.

---

## 4. Live Sessions

Live sessions are modeled as **Classes** with type `live` and status lifecycle. Base path: **`/api/classes`** (and session-specific actions below).

### 4.1 Create Session (Class)

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/classes` |
| **Description** | Create a class/session (live or recorded). Professor or Admin. |
| **Required Role** | Professor, Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "title": { "en": "Unit 3 - Grammar", "fr": "", "ar": "" },
  "description": { "en": "...", "fr": "", "ar": "" },
  "course": "crs_abc123",
  "type": "live",
  "status": "scheduled",
  "schedule": {
    "startTime": "2025-02-13T14:00:00.000Z",
    "endTime": "2025-02-13T15:00:00.000Z",
    "timezone": "Africa/Casablanca",
    "recurrence": "weekly"
  },
  "maxStudents": 25,
  "liveConfig": {
    "platform": "zoom",
    "meetingUrl": "https://zoom.us/j/...",
    "meetingId": "123456789",
    "meetingPassword": "optional",
    "waitingRoom": true,
    "recording": true
  }
}
```

**Success Response (201):** Created class/session object.

---

### 4.2 Start Session

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/classes/:id/start` |
| **Description** | Mark a live class as started (status → ongoing). Professor or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |

**Request Body (optional):**

```json
{
  "meetingUrl": "https://zoom.us/j/...",
  "recordingStarted": false
}
```

**Success Response (200):** Updated class object with `status: "ongoing"`.

**Error Response (400):**

```json
{
  "error": "BadRequest",
  "message": "Session can only be started at or after scheduled time"
}
```

---

### 4.3 End Session

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/classes/:id/end` |
| **Description** | Mark session as completed (status → completed). Professor or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |

**Request Body (optional):**

```json
{
  "recordingUrl": "https://..."
}
```

**Success Response (200):** Updated class object with `status: "completed"`.

---

### 4.4 Get Session Details

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/classes/:id` |
| **Description** | Get class/session by ID. Students see only sessions for courses they are enrolled in. |
| **Required Role** | Any (filtered by enrollment/ownership) |
| **Authentication** | Yes |

**Success Response (200):** Full class object (course, schedule, liveConfig, etc.).

---

### 4.5 List Sessions by Course

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/classes` |
| **Description** | List classes/sessions. Filter by course, type, status, professor. |
| **Required Role** | Any (filtered by role) |
| **Authentication** | Yes |
| **Pagination** | Yes |

**Query Parameters:** `course`, `type` (`live`|`recorded`), `status`, `professor`, `search`, `page`, `limit`, `sortBy`, `sortOrder`.

**Success Response (200):**

```json
{
  "data": [
    {
      "_id": "cls_abc",
      "title": { "en": "Unit 3 - Grammar", "fr": "", "ar": "" },
      "course": { "_id": "crs_abc", "title": { "en": "English for Beginners" } },
      "type": "live",
      "status": "ongoing",
      "schedule": { "startTime": "...", "endTime": "...", "timezone": "..." },
      "liveConfig": { "platform": "zoom", "meetingUrl": "..." },
      "maxStudents": 25,
      "professor": { "_id": "...", "firstName": "Sarah", "lastName": "Johnson" },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 20, "pages": 2 }
}
```

---

### 4.6 Get Live Classes (Now)

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/classes/live` |
| **Description** | List classes currently live (status ongoing). |
| **Required Role** | Any authenticated |
| **Authentication** | Yes |

**Query Parameters:** `limit`.

**Success Response (200):** `{ "data": [ Class, ... ] }`.

---

### 4.7 Get Upcoming Classes

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/classes/upcoming` |
| **Description** | List upcoming scheduled classes within a time window. |
| **Required Role** | Any authenticated |
| **Authentication** | Yes |

**Query Parameters:** `limit`, `days` (e.g. next 7 days).

**Success Response (200):** `{ "data": [ Class, ... ] }`.

---

### 4.8 Update Class

| Field | Value |
|-------|--------|
| **Method** | PUT |
| **Path** | `/api/classes/:id` |
| **Description** | Update class/session. Professor (owner) or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |

**Request Body:** Partial class object.

**Success Response (200):** Updated class object.

---

### 4.9 Delete Class

| Field | Value |
|-------|--------|
| **Method** | DELETE |
| **Path** | `/api/classes/:id` |
| **Description** | Delete or cancel a class. Professor (owner) or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |

**Success Response (200):** `{ "message": "Class deleted successfully" }`.

---

### 4.10 Enroll in Class

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/classes/:id/enroll` |
| **Description** | Enroll current user in class. Student must be enrolled in the course. |
| **Required Role** | Student |
| **Authentication** | Yes |

**Success Response (200):** `{ "message": "Enrolled successfully" }`.

---

## 5. Documents

Base path: **`/api/documents`** (or **`/api/courses/:courseId/documents`** — choose one convention).

### 5.1 Upload Document

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/courses/:courseId/documents` or `/api/documents/upload` |
| **Description** | Upload a document (PDF, DOC, etc.) for a course. Professor or Admin. |
| **Required Role** | Professor (course owner), Admin |
| **Authentication** | Yes |

**Request Body:** `multipart/form-data` with fields:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| file | File | Yes | PDF, DOC, DOCX, PPT, etc. |
| title | string | No | Override filename |
| type | string | No | `pdf` \| `doc` \| `ppt` \| `other` |

**Success Response (201):**

```json
{
  "_id": "doc_abc123",
  "title": { "en": "Unit 2 - Grammar Notes", "fr": "", "ar": "" },
  "url": "https://storage.../unit2-grammar.pdf",
  "type": "pdf",
  "size": 1024000,
  "course": "crs_abc",
  "uploadedBy": "usr_prof",
  "createdAt": "2025-02-01T00:00:00.000Z"
}
```

**Error Response (400):**

```json
{
  "error": "BadRequest",
  "message": "Invalid file type or size"
}
```

---

### 5.2 List Documents by Course

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/courses/:courseId/documents` or `/api/documents?courseId=:id` |
| **Description** | List documents for a course. Students: enrolled only; Professor/Admin: course owner/all. |
| **Required Role** | Student (enrolled), Professor (owner), Admin |
| **Authentication** | Yes |
| **Pagination** | Yes (optional) |

**Query Parameters:** `page`, `limit`, `type`, `search`.

**Success Response (200):**

```json
{
  "data": [
    {
      "_id": "doc_abc123",
      "title": { "en": "Unit 2 - Grammar Notes", "fr": "", "ar": "" },
      "url": "https://...",
      "type": "pdf",
      "size": 1024000,
      "uploadedBy": { "_id": "...", "firstName": "Sarah", "lastName": "Johnson" },
      "createdAt": "2025-02-01T00:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5, "pages": 1 }
}
```

---

### 5.3 Download Document

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/documents/:id/download` or `/api/documents/:id` with redirect/signed URL |
| **Description** | Get download URL or stream file. Access: enrolled student, course professor, admin. |
| **Required Role** | Student (enrolled), Professor (owner), Admin |
| **Authentication** | Yes |

**Success Response (200):** Either redirect to signed URL, or JSON with `url` and optional `expiresAt`.

```json
{
  "url": "https://storage.../signed-url?...",
  "expiresAt": "2025-02-01T01:00:00.000Z",
  "filename": "Unit-2-Grammar-Notes.pdf"
}
```

**Error Response (404):**

```json
{
  "error": "NotFound",
  "message": "Document not found"
}
```

---

### 5.4 Delete Document

| Field | Value |
|-------|--------|
| **Method** | DELETE |
| **Path** | `/api/documents/:id` or `/api/courses/:courseId/documents/:id` |
| **Description** | Delete document. Professor (course owner) or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |

**Success Response (200):**

```json
{
  "message": "Document deleted successfully"
}
```

---

### 5.5 Generic File Upload (Images)

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/upload` or `/api/upload/image` |
| **Description** | Upload image (e.g. course thumbnail, avatar). Returns URL. |
| **Required Role** | Any authenticated user (or restricted by use case) |
| **Authentication** | Yes |

**Request Body:** `multipart/form-data`, field `file` (image).

**Success Response (200):**

```json
{
  "url": "https://storage.../image.jpg"
}
```

---

## 6. Attendance

Base path: **`/api/attendance`** or **`/api/classes/:classId/attendance`**.

### 6.1 Mark Attendance (Automatic or Manual)

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/classes/:classId/attendance` |
| **Description** | Record attendance for a student in a class. Called automatically when student joins/leaves live session, or manually by professor. |
| **Required Role** | Professor, Admin (manual); or system/student (automatic join/leave) |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "studentId": "usr_abc123",
  "status": "present",
  "joinedAt": "2025-02-10T14:01:00.000Z",
  "leftAt": "2025-02-10T14:58:00.000Z"
}
```

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| studentId | string | Yes | |
| status | string | No | `present` \| `absent` \| `late`; can be inferred from joinedAt/leftAt |
| joinedAt | string | No | ISO datetime |
| leftAt | string | No | ISO datetime |

**Success Response (200):**

```json
{
  "message": "Attendance recorded",
  "attendance": {
    "_id": "att_abc",
    "class": "cls_abc",
    "student": "usr_abc123",
    "status": "present",
    "joinedAt": "...",
    "leftAt": "..."
  }
}
```

---

### 6.2 Get Attendance by Course

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/attendance/course/:courseId` or `/api/courses/:courseId/attendance` |
| **Description** | List attendance records for all classes of a course. Professor (owner) or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |
| **Pagination** | Yes |

**Query Parameters:** `classId`, `from`, `to`, `page`, `limit`.

**Success Response (200):**

```json
{
  "data": [
    {
      "_id": "att_abc",
      "class": { "_id": "cls_abc", "title": { "en": "Unit 3" }, "schedule": { "startTime": "..." } },
      "student": { "_id": "usr_1", "firstName": "Marie", "lastName": "Dubois" },
      "status": "present",
      "joinedAt": "2025-02-10T14:01:00.000Z",
      "leftAt": "2025-02-10T14:58:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 50, "pages": 3 }
}
```

---

### 6.3 Get Attendance by Student

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/attendance/student/:studentId` or `/api/users/me/attendance` |
| **Description** | List attendance for a student (all courses or filter by course). Student sees own; Professor/Admin see any. |
| **Required Role** | Student (self), Professor (own courses), Admin |
| **Authentication** | Yes |
| **Pagination** | Yes |

**Query Parameters:** `courseId`, `from`, `to`, `page`, `limit`.

**Success Response (200):** Same shape as 6.2 (data array of attendance records).

---

### 6.4 Export Attendance

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/attendance/export` |
| **Description** | Export attendance as CSV (or XLSX). Professor (own course/class) or Admin. |
| **Required Role** | Professor (owner), Admin |
| **Authentication** | Yes |

**Query Parameters:** `courseId`, `classId`, `from`, `to`, `format` (`csv`|`xlsx`).

**Success Response (200):** File download (e.g. `Content-Disposition: attachment; filename="attendance.csv"`) or JSON with download URL.

**Response Headers (example):**

```
Content-Type: text/csv
Content-Disposition: attachment; filename="attendance_2025-02-10.csv"
```

---

## 7. Assignments

Base path: **`/api/assignments`** (or **`/api/courses/:courseId/assignments`**).

### 7.1 Create Assignment

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/courses/:courseId/assignments` or `/api/assignments` |
| **Description** | Create an assignment for a course. Professor or Admin. |
| **Required Role** | Professor (course owner), Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "title": { "en": "Essay - Unit 2", "fr": "", "ar": "" },
  "description": { "en": "Write 300 words about...", "fr": "", "ar": "" },
  "dueAt": "2025-02-20T23:59:59.000Z",
  "maxScore": 100,
  "type": "essay",
  "attachments": []
}
```

**Success Response (201):** Created assignment object.

---

### 7.2 Submit Assignment

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/assignments/:id/submit` or `/api/assignments/:id/submissions` |
| **Description** | Submit assignment (file upload or text). Student only. |
| **Required Role** | Student (enrolled in course) |
| **Authentication** | Yes |

**Request Body:** `multipart/form-data` (file + optional comment) or JSON with `content` / `fileUrl`.

```json
{
  "content": "Optional text submission",
  "comment": "Optional note to professor"
}
```

**Success Response (201):**

```json
{
  "_id": "sub_abc",
  "assignment": "asn_abc",
  "student": "usr_abc",
  "content": "...",
  "fileUrl": "https://...",
  "submittedAt": "2025-02-18T12:00:00.000Z",
  "status": "submitted"
}
```

---

### 7.3 Grade Assignment

| Field | Value |
|-------|--------|
| **Method** | PATCH or PUT |
| **Path** | `/api/assignments/submissions/:submissionId/grade` or `/api/submissions/:id/grade` |
| **Description** | Set grade and feedback for a submission. Professor or Admin. |
| **Required Role** | Professor (course owner), Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "score": 85,
  "maxScore": 100,
  "feedback": "Good structure. Improve conclusion."
}
```

**Success Response (200):** Updated submission object with grade and feedback.

---

### 7.4 Get Submissions

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/assignments/:id/submissions` or `/api/courses/:courseId/assignments/:assignmentId/submissions` |
| **Description** | List submissions for an assignment. Professor/Admin see all; Student sees own. |
| **Required Role** | Professor (owner), Admin (all); Student (own) |
| **Authentication** | Yes |
| **Pagination** | Yes |

**Query Parameters:** `page`, `limit`, `status` (e.g. submitted, graded).

**Success Response (200):**

```json
{
  "data": [
    {
      "_id": "sub_abc",
      "assignment": { "_id": "asn_abc", "title": { "en": "Essay - Unit 2" } },
      "student": { "_id": "usr_1", "firstName": "Marie", "lastName": "Dubois" },
      "content": "...",
      "fileUrl": "https://...",
      "submittedAt": "2025-02-18T12:00:00.000Z",
      "status": "graded",
      "score": 85,
      "maxScore": 100,
      "feedback": "..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 25, "pages": 2 }
}
```

---

### 7.5 List Assignments by Course

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/courses/:courseId/assignments` or `/api/assignments?courseId=:id` |
| **Description** | List assignments for a course. Students see assignments; Professors/Admin manage. |
| **Required Role** | Student (enrolled), Professor (owner), Admin |
| **Authentication** | Yes |
| **Pagination** | Yes |

**Success Response (200):** `{ "data": [ Assignment, ... ], "pagination": { ... } }`.

---

## 8. Notifications

Base path: **`/api/notifications`**

### 8.1 Create Notification (System / Admin)

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/notifications` |
| **Description** | Create and send a notification to one or many users (e.g. announcement). Admin or system. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "title": { "en": "New document uploaded", "fr": "", "ar": "" },
  "body": { "en": "Unit 2 - Grammar Notes is available.", "fr": "", "ar": "" },
  "type": "course_document",
  "recipients": ["usr_1", "usr_2"],
  "broadcast": false,
  "data": { "courseId": "crs_abc", "documentId": "doc_abc" }
}
```

| Parameter | Type | Required | Notes |
|-----------|------|----------|-------|
| broadcast | boolean | No | If true, send to all (or all in role); recipients ignored |
| recipients | string[] | No | User IDs; required if broadcast false |

**Success Response (201):**

```json
{
  "message": "Notification sent",
  "count": 2
}
```

---

### 8.2 Get User Notifications

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/notifications` or `/api/notifications/me` |
| **Description** | List notifications for the current user. |
| **Required Role** | Any authenticated user |
| **Authentication** | Yes |
| **Pagination** | Yes |

**Query Parameters:** `page`, `limit`, `unreadOnly` (boolean).

**Success Response (200):**

```json
{
  "data": [
    {
      "_id": "notif_abc",
      "title": { "en": "New document uploaded", "fr": "", "ar": "" },
      "body": { "en": "Unit 2 - Grammar Notes is available.", "fr": "", "ar": "" },
      "type": "course_document",
      "read": false,
      "createdAt": "2025-02-13T10:00:00.000Z",
      "data": { "courseId": "crs_abc", "documentId": "doc_abc" }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 15, "pages": 1 }
}
```

---

### 8.3 Mark as Read

| Field | Value |
|-------|--------|
| **Method** | PATCH |
| **Path** | `/api/notifications/:id/read` or `/api/notifications/mark-read` |
| **Description** | Mark one or all notifications as read. |
| **Required Role** | Any authenticated user (owner only) |
| **Authentication** | Yes |

**Single mark read — PATCH `/api/notifications/:id/read`**

**Request Body:** None or `{ "read": true }`.

**Success Response (200):** Updated notification object.

**Bulk mark read — POST `/api/notifications/mark-read`**

**Request Body:**

```json
{
  "ids": ["notif_1", "notif_2"],
  "all": false
}
```

**Success Response (200):**

```json
{
  "message": "Marked 2 notifications as read"
}
```

---

## 9. Dashboard & Analytics

Base path: **`/api/dashboard`** or role-specific paths.

### 9.1 Get Student Dashboard Summary

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/dashboard/student` or `/api/students/me/dashboard` |
| **Description** | Summary for student dashboard: enrolled courses count, learning time, avg progress, upcoming classes, recent documents, attendance summary. |
| **Required Role** | Student |
| **Authentication** | Yes |

**Success Response (200):**

```json
{
  "enrolledCoursesCount": 3,
  "learningTimeHours": 24,
  "averageProgress": 65,
  "upcomingClassesCount": 2,
  "upcomingClasses": [
    {
      "_id": "cls_abc",
      "title": { "en": "Unit 3 - Grammar" },
      "course": { "_id": "crs_abc", "title": { "en": "English for Beginners" } },
      "schedule": { "startTime": "2025-02-13T14:00:00.000Z", "endTime": "..." }
    }
  ],
  "recentDocuments": [
    { "_id": "doc_1", "title": { "en": "Unit 2 - Grammar Notes.pdf" }, "courseId": "crs_abc", "createdAt": "..." }
  ],
  "attendanceSummary": {
    "monthPercentage": 92,
    "sessionsAttended": 18,
    "sessionsTotal": 20
  },
  "enrolledCoursesWithProgress": [
    { "course": { "_id": "crs_abc", "title": { "en": "English for Beginners" } }, "progress": 30 },
    { "course": { "_id": "crs_def", "title": { "en": "Business French" } }, "progress": 55 }
  ]
}
```

---

### 9.2 Get Professor Dashboard Summary

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/dashboard/professor` or `/api/professors/me/dashboard` |
| **Description** | Summary for professor: active courses, total students, upcoming classes, today's sessions, course stats, attendance overview. |
| **Required Role** | Professor |
| **Authentication** | Yes |

**Success Response (200):**

```json
{
  "activeCoursesCount": 5,
  "totalStudentsCount": 142,
  "upcomingClassesCount": 3,
  "todaysSessions": [
    { "_id": "cls_1", "title": { "en": "English for Beginners - Unit 3" }, "schedule": { "startTime": "2025-02-13T14:00:00.000Z" }, "courseId": "crs_abc" },
    { "_id": "cls_2", "title": { "en": "Business French - Session 5" }, "schedule": { "startTime": "2025-02-13T16:00:00.000Z" }, "courseId": "crs_def" }
  ],
  "courseStats": [
    { "courseId": "crs_abc", "title": "English for Beginners", "enrolledCount": 28 },
    { "courseId": "crs_def", "title": "Business French", "enrolledCount": 15 }
  ],
  "attendanceOverview": {
    "monthPercentage": 94,
    "period": "2025-02"
  },
  "averageRating": 4.9
}
```

---

### 9.3 Get Admin Dashboard Analytics

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/dashboard/admin` or `/api/admin/dashboard` |
| **Description** | Platform-wide analytics: total students, professors, courses, active sessions, enrollment growth, attendance rate, etc. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Success Response (200):**

```json
{
  "totalStudents": 12450,
  "totalProfessors": 248,
  "totalCourses": 52,
  "activeSessionsCount": 7,
  "enrollmentGrowthPercent": 12,
  "attendanceRatePercent": 94,
  "userStats": {
    "total": 12700,
    "students": 12450,
    "professors": 248,
    "admins": 5
  },
  "courseStats": {
    "total": 52,
    "published": 48,
    "draft": 4,
    "totalEnrollments": 35000
  }
}
```

---

## 10. System Settings

Base path: **`/api/settings`** or **`/api/admin/settings`**

### 10.1 Get System Settings

| Field | Value |
|-------|--------|
| **Method** | GET |
| **Path** | `/api/settings` or `/api/admin/settings` |
| **Description** | Get platform settings (email config, timezone, maintenance mode, feature flags). Admin only. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Success Response (200):**

```json
{
  "email": {
    "smtpHost": "smtp.example.com",
    "smtpPort": 587,
    "fromAddress": "noreply@lingualearn.com",
    "secure": true
  },
  "platform": {
    "timezone": "Africa/Casablanca",
    "maintenanceMode": false,
    "featureFlags": {}
  }
}
```

---

### 10.2 Update System Settings

| Field | Value |
|-------|--------|
| **Method** | PUT or PATCH |
| **Path** | `/api/settings` or `/api/admin/settings` |
| **Description** | Update platform settings. Admin only. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Request Body (partial):**

```json
{
  "email": {
    "smtpHost": "smtp.new.com",
    "smtpPort": 587,
    "fromAddress": "noreply@lingualearn.com"
  },
  "platform": {
    "timezone": "Africa/Casablanca",
    "maintenanceMode": false
  }
}
```

**Success Response (200):** Updated settings object.

---

### 10.3 Announcement Broadcast

| Field | Value |
|-------|--------|
| **Method** | POST |
| **Path** | `/api/settings/announcement` or `/api/notifications/broadcast` |
| **Description** | Send an announcement to all users or selected roles. Admin only. |
| **Required Role** | Admin |
| **Authentication** | Yes |

**Request Body:**

```json
{
  "title": { "en": "Platform maintenance", "fr": "", "ar": "" },
  "body": { "en": "Scheduled maintenance on Sunday 2–4 AM.", "fr": "", "ar": "" },
  "targetRoles": ["student", "professor"],
  "targetUserIds": []
}
```

**Success Response (200):**

```json
{
  "message": "Announcement sent",
  "count": 12000
}
```

---

## 11. Appendix

### 11.1 Database Model Suggestions

**User**
- _id, email (unique), passwordHash, firstName, lastName, role (enum), status (enum), phone, avatar, bio (LocalizedText), preferences (language, notifications), createdAt, updatedAt
- Indexes: email, role, status

**Course**
- _id, title (LocalizedText), description, shortDescription, language, level, category, duration, maxStudents, enrolledCount, price, currency, status, isPublic, featured, thumbnail, professor (ref User), createdAt, updatedAt
- Indexes: professor, status, language, level, category

**Class (Session)**
- _id, title, description, course (ref Course), type (live|recorded), status (scheduled|ongoing|completed|cancelled), schedule (startTime, endTime, timezone, recurrence), content (videoUrl, documents), liveConfig (platform, meetingUrl, meetingId, meetingPassword, waitingRoom, recording), maxStudents, enrolledStudents (ref User[]), professor (ref User), createdAt, updatedAt
- Indexes: course, professor, status, schedule.startTime

**Document**
- _id, title (LocalizedText), url, type, size, course (ref Course), uploadedBy (ref User), createdAt, updatedAt
- Indexes: course

**Attendance**
- _id, class (ref Class), student (ref User), status (present|absent|late), joinedAt, leftAt, createdAt, updatedAt
- Indexes: class, student, (class + student) unique per session

**Assignment**
- _id, title (LocalizedText), description, course (ref Course), dueAt, maxScore, type, createdBy (ref User), createdAt, updatedAt

**AssignmentSubmission**
- _id, assignment (ref Assignment), student (ref User), content, fileUrl, submittedAt, status (draft|submitted|graded), score, maxScore, feedback, gradedAt, gradedBy (ref User), createdAt, updatedAt

**Notification**
- _id, title (LocalizedText), body (LocalizedText), type, recipient (ref User), read, data (JSON), createdAt
- Indexes: recipient, read, createdAt

**Enrollment** (Course–Student)
- _id, course (ref Course), student (ref User), progress, status (active|completed|dropped), enrolledAt, updatedAt
- Indexes: course, student, (course + student) unique

---

### 11.2 Role-Based Permission Matrix

| Resource / Action | Student | Professor | Admin |
|------------------|---------|-----------|-------|
| Auth: register, login, forgot/reset password, verify email | ✓ (self) | ✓ (self) | ✓ (self) |
| Auth: invite user | — | — | ✓ |
| Users: list all | — | — | ✓ |
| Users: get by ID | Own only | — | ✓ |
| Users: update profile | Own | Own | ✓ |
| Users: update user, status, role, delete | — | — | ✓ |
| Users: stats overview | — | — | ✓ |
| Courses: list | Published + enrolled | Published + own | All |
| Courses: get by ID | Published / enrolled | Own / published | All |
| Courses: create, update, delete | — | ✓ (own) | ✓ |
| Courses: enroll / unenroll | ✓ (self, reglo) | — | ✓ |
| Courses: progress | — | ✓ (own course) | ✓ |
| Classes: list | Enrolled courses | Own + public | All |
| Classes: get by ID | If enrolled | ✓ | ✓ |
| Classes: create, update, delete, start, end | — | ✓ (own) | ✓ |
| Classes: enroll | ✓ (if in course) | — | ✓ |
| Classes: mark attendance | — | ✓ (own) | ✓ |
| Documents: upload | — | ✓ (own course) | ✓ |
| Documents: list by course | Enrolled | Own course | ✓ |
| Documents: download, delete | Enrolled / — | Own course | ✓ |
| Attendance: get by course/student, export | Own only | Own course | ✓ |
| Assignments: create | — | ✓ (own course) | ✓ |
| Assignments: submit | ✓ (enrolled) | — | — |
| Assignments: grade, get submissions | — | ✓ (own course) | ✓ |
| Notifications: create / broadcast | — | — | ✓ |
| Notifications: get, mark read | Own | Own | Own |
| Dashboard: student summary | ✓ | — | — |
| Dashboard: professor summary | — | ✓ | — |
| Dashboard: admin analytics | — | — | ✓ |
| System settings: get, update, announcement | — | — | ✓ |

---

### 11.3 Recommended Status Codes Policy

| Code | Usage |
|------|--------|
| 200 | OK — GET, PUT, PATCH, DELETE success |
| 201 | Created — POST success (resource created) |
| 400 | Bad Request — validation, invalid input, business rule violation |
| 401 | Unauthorized — missing, invalid, or expired token |
| 403 | Forbidden — valid token but insufficient role/ownership; or requiresVerification / paymentRequired |
| 404 | Not Found — resource does not exist or no access |
| 409 | Conflict — e.g. duplicate enrollment, email already exists |
| 423 | Locked — account locked (e.g. too many failed logins) |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error — unexpected server error |

Always return JSON for errors: `{ "error": "ShortCode", "message": "Human-readable message" }` with optional fields.

---

### 11.4 Notes on Future Scalability

- **WebSocket / real-time for live sessions:** For live video, chat, hand-raising, and participant list, implement a WebSocket server (e.g. Socket.io or dedicated service). The REST API can remain the source of truth for session metadata (start/end, meeting URL); real-time events (join/leave, chat, raise hand) should flow over WebSocket and optionally be persisted via REST (e.g. attendance join/leave, chat history).
- **Token refresh:** Use short-lived access tokens and refresh tokens (httpOnly cookie or body). Implement `POST /api/auth/refresh` and optional logout that invalidates refresh token.
- **File storage:** Use object storage (S3, GCS, or equivalent) with signed URLs for document download; avoid serving large files through the app server.
- **Pagination:** Consistently use `page` and `limit` with a max limit (e.g. 100) to avoid heavy responses.
- **Rate limiting:** Apply per-IP and per-user rate limits on auth and public endpoints.
- **Localization:** Store user-facing text (titles, descriptions, notifications) with `en`, `fr`, `ar` (or similar) and return based on `Accept-Language` or user preferences.
