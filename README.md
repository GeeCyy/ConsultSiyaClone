# ConsultSiya

Academic consultation booking system for Mapúa University SOIT.  
Students book consultation slots with professors. Professors manage schedules and log outcomes. Admins monitor all activity.

---

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | Next.js 15 (App Router, TypeScript) |
| Backend  | Express.js 5 (Node.js)              |
| Database | PostgreSQL 16                       |
| Auth     | JWT (jsonwebtoken + bcrypt 12 rounds)|
| Reports  | PDFKit + ExcelJS                    |
| Security | Helmet, express-rate-limit, express-validator |

---

## Project Structure

```
ConsultSiya/
├── backend/
│   ├── db/
│   │   ├── schema.sql          # Initial DDL
│   │   └── migrate.sql         # Additive migrations (safe to re-run)
│   ├── middleware/
│   │   └── auth.middleware.js  # JWT verify + role authorize
│   ├── routes/
│   │   ├── auth.js             # Register / login / profile
│   │   ├── admin.js            # User management, approvals
│   │   ├── schedules.js        # Professor availability slots
│   │   ├── consultations.js    # Booking lifecycle
│   │   ├── reports.js          # PDF / Excel export
│   │   ├── forms.js            # Advising slip generation + upload
│   │   └── chat.js             # Chatbot (professor lookup)
│   ├── .env.example
│   └── server.js
└── frontend/
    ├── app/
    │   ├── (auth)/login/        # Login page
    │   ├── (auth)/register/     # Register page
    │   └── dashboard/
    │       ├── student/         # Student dashboard
    │       ├── professor/       # Professor dashboard
    │       ├── admin/           # Admin dashboard
    │       ├── home/            # Academic tracker (week, calendar, countdowns)
    │       └── help/            # Help Center
    ├── components/
    │   └── DashboardShell.tsx   # Shared layout: week badge + chatbot
    └── lib/
        ├── api.ts               # Typed API client
        └── academicCalendar.ts  # Term utilities (week, progress, holidays)
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker (for PostgreSQL) or a local PostgreSQL 16 instance

### 1. Database

```bash
cd backend
docker compose up -d        # starts PostgreSQL on port 5432
```

Apply schema and migrations:

```bash
psql $DATABASE_URL -f db/schema.sql
psql $DATABASE_URL -f db/migrate.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env        # fill in your values
npm install
npm run dev                 # http://localhost:4000
```

**Required env vars:**

| Variable          | Description                                         |
|-------------------|-----------------------------------------------------|
| `PORT`            | Express port (default 4000)                         |
| `DATABASE_URL`    | PostgreSQL connection string                        |
| `JWT_SECRET`      | Secret for signing JWTs (min 32 chars in prod)      |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (default: `http://localhost:3000`) |

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

Set in `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Roles & Features

### Student
- Browse professor availability and book consultation slots
- Choose date, time, mode (Face-to-Face / Online), and nature of concern
- View, cancel, and track consultation history grouped by quarter
- Download blank advising slip template; upload signed form after session
- **Home page** — current academic week, term progress, countdown to finals
- **Help Center** — usage guide, submission guidelines, expandable FAQs
- **Chatbot** — ask who handles a concern type, how to book, list professors

### Professor
- **My Consultations** — confirm (with optional meeting link for Online), complete (action taken, referral, remarks), or reschedule bookings
- **Manage Schedules** — create slots with multiple time ranges per date, set location
- **Export Report** — PDF or Excel report filtered by period (week / semester / year)
- **History** — past sessions grouped by quarter
- **Home** and **Help Center** accessible from sidebar

### Admin
- View all consultations with stats (total / pending / confirmed / completed / cancelled)
- User management: approve, reject, create, delete accounts
- Promote/demote professors to/from admin (max 2 admins enforced)
- **Home** and **Help Center** accessible from sidebar

---

## Security

### Implemented

| Area | Implementation |
|------|----------------|
| **Password hashing** | bcrypt with 12 salt rounds |
| **SQL injection** | Parameterized queries (`$1, $2`) throughout — no string concatenation |
| **JWT auth** | `Authorization: Bearer` on all protected routes; 7-day expiry |
| **Role authorization** | Server-side `authorize(...roles)` middleware on every protected endpoint |
| **Account lockout** | 5 failed login attempts → 15-minute lockout (`failed_attempts`, `locked_until` in DB) |
| **Input validation** | `express-validator` on all auth endpoints (email format, password length, required fields) |
| **Security headers** | `helmet` — X-Content-Type-Options, X-Frame-Options, CSP, HSTS, etc. |
| **Rate limiting** | Global: 200 req/15 min · Auth endpoints: 10 req/15 min (skips successes) · Chatbot: 20 req/min |
| **CORS** | Origin whitelist via `ALLOWED_ORIGINS` env var |
| **File upload** | multer — PDF/JPG/PNG only, 10 MB max, timestamp-renamed, stored outside web root |
| **XSS** | React inherently escapes all output; no `dangerouslySetInnerHTML` on user data |

---

## API Endpoints

### Auth — `/api/auth`
| Method | Path        | Auth | Description                          |
|--------|-------------|------|--------------------------------------|
| POST   | `/register` | —    | Register (student/professor, pending approval) |
| POST   | `/login`    | —    | Login; returns JWT; enforces lockout |
| GET    | `/profile`  | JWT  | Get current user profile             |
| PATCH  | `/profile`  | JWT  | Update profile fields                |

### Chatbot — `/api/chat`
| Method | Path | Auth | Description                                    |
|--------|------|------|------------------------------------------------|
| POST   | `/`  | JWT  | Ask about professor responsibilities or booking |

### Schedules — `/api/schedules`
| Method | Path              | Role      | Description                        |
|--------|-------------------|-----------|------------------------------------|
| POST   | `/`               | Professor | Create a slot (multi-time-range)   |
| GET    | `/`               | Any       | List all available slots           |
| GET    | `/mine`           | Professor | Professor's own slots              |
| GET    | `/all`            | Admin     | All slots across professors        |
| PATCH  | `/:id`            | Professor | Edit slot                          |
| DELETE | `/:id`            | Professor | Delete slot                        |
| GET    | `/:id/booked-times` | Any    | Already-booked times for a date    |

### Consultations — `/api/consultations`
| Method | Path                  | Role       | Description                   |
|--------|-----------------------|------------|-------------------------------|
| POST   | `/`                   | Student    | Book a consultation           |
| GET    | `/`                   | Any (scoped)| List consultations            |
| GET    | `/booked-dates`       | Any        | Fully-booked future dates     |
| PATCH  | `/:id/confirm`        | Professor  | Confirm + optional meeting link |
| PATCH  | `/:id/meeting-link`   | Professor  | Update meeting link           |
| PATCH  | `/:id/cancel`         | Prof/Student| Cancel                       |
| PATCH  | `/:id/complete`       | Professor  | Mark complete + log outcome   |
| PATCH  | `/:id/reschedule`     | Professor  | Mark rescheduled              |

### Admin — `/api/admin`
| Method | Path                   | Description                          |
|--------|------------------------|--------------------------------------|
| GET    | `/users`               | List students + professors           |
| POST   | `/users`               | Create user (auto-approved)          |
| DELETE | `/users/:id`           | Delete user                          |
| PATCH  | `/users/:id/approve`   | Approve pending account              |
| PATCH  | `/users/:id/reject`    | Reject + delete pending account      |
| PATCH  | `/transfer-admin`      | Promote to admin                     |
| PATCH  | `/demote-admin/:id`    | Demote admin to professor            |

### Reports — `/api/reports`
| Method | Path         | Role          | Description                      |
|--------|--------------|---------------|----------------------------------|
| GET    | `/professors`| Admin         | Professors with consultation counts |
| GET    | `/excel`     | Prof / Admin  | Excel report (`?period=week|semester|year`) |
| GET    | `/pdf`       | Prof / Admin  | PDF report                       |

### Forms — `/api/forms`
| Method | Path                  | Description                          |
|--------|-----------------------|--------------------------------------|
| GET    | `/blank-slip`         | Download blank advising slip PDF     |
| GET    | `/advising-slip/:id`  | Pre-filled slip for a consultation   |
| POST   | `/upload/:id`         | Upload signed form (student)         |
| GET    | `/download/:id`       | Download uploaded form               |

---

## Database Schema

```
users                 — id, email, password_hash, role, is_approved,
                        failed_attempts, locked_until, created_at
students              — id, user_id→users, full_name, student_number,
                        program, year_level, phone, email
professors            — id, user_id→users, full_name, department, phone, email
schedules             — id, professor_id→professors, day, date,
                        time_start, time_end, time_ranges (JSONB),
                        is_available, location
consultations         — id, student_id, professor_id, schedule_id,
                        date, time, status, nature_of_advising,
                        nature_of_advising_specify, mode,
                        meeting_link, uploaded_form_path, created_at
consultation_details  — id, consultation_id, action_taken, referral,
                        referral_specify, remarks, completed_at
professor_responsibilities — id, professor_id→professors, concern_type
```

`status` flow: `pending` → `confirmed` → `completed` | `cancelled` | `rescheduled`

---

## New Pages

### Home (`/dashboard/home`)
- **Current week badge** — Week N of 18, In-Person / Online
- **Countdown cards** — Days to Finals, Days to End of Term, Weeks Remaining, % Progress
- **Term progress bar** — with Midterm and Finals markers
- **Interactive calendar** — highlights today, exam weeks, online weeks, PH holidays
- **Announcements** — static notices (extendable to a DB-backed feed)
- **Next week preview**

### Help Center (`/dashboard/help`)
- About the System (student / professor / admin role descriptions)
- How to Use (step-by-step guides per role)
- Submission Guidelines (advising slip, file types, etiquette)
- FAQs (10 expandable questions)
- Contact & Support

### Chatbot (floating, all dashboards)
- Accessible via the red chat button (bottom-right)
- Understands: professor lookup by concern type, all-professor listing, booking instructions
- Backed by `/api/chat` (JWT-authenticated, 20 req/min rate-limited)
