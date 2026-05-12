const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const pool = require('./db/db');
const { authenticate } = require('./middleware/auth.middleware');

const app = express();

// ── CORS — allow all origins ──────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ── Body parser + cookies ─────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ── Global rate limiter (all API endpoints) ───────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});
//app.use('/api/', globalLimiter);

// ── Static uploads ─────────────────────────────────────────────────────────────
// Avatars are public-facing (profile pictures in UI) so served as static assets.
// Form uploads stay gated — authenticated access only via /api/forms/download/:id.
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads/avatars')));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/consultations', require('./routes/consultations'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/settings', require('./routes/settings'));

// ── Health checks ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ConsultSiya API is running!' });
});

app.get('/db-health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ status: 'ok', time: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Database unavailable' });
  }
});

// ── Protected test route ───────────────────────────────────────────────────────
app.get('/api/protected', authenticate, (req, res) => {
  res.json({ message: `Hello ${req.user.role}!`, user: req.user });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);

  // Idempotent startup migration — ensures the avatar column exists without
  // requiring a manual migration step. ALTER TABLE ADD COLUMN IF NOT EXISTS
  // is a no-op when the column already exists.
  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT`)
    .then(() => console.log('[startup] users.avatar column ready'))
    .catch(err => console.error('[startup] users.avatar migration failed:', err.message));

  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255)`)
    .then(() => console.log('[startup] users.password_reset_token column ready'))
    .catch(err => console.error('[startup] users.password_reset_token migration failed:', err.message));

  pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ`)
    .then(() => console.log('[startup] users.password_reset_expires column ready'))
    .catch(err => console.error('[startup] users.password_reset_expires migration failed:', err.message));

  pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`)
    .then(() => console.log('[startup] students.phone column ready'))
    .catch(err => console.error('[startup] students.phone migration failed:', err.message));

  pool.query(`ALTER TABLE professors ADD COLUMN IF NOT EXISTS phone VARCHAR(50)`)
    .then(() => console.log('[startup] professors.phone column ready'))
    .catch(err => console.error('[startup] professors.phone migration failed:', err.message));

  pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(255)`)
    .then(() => console.log('[startup] students.email column ready'))
    .catch(err => console.error('[startup] students.email migration failed:', err.message));

  pool.query(`ALTER TABLE professors ADD COLUMN IF NOT EXISTS email VARCHAR(255)`)
    .then(() => console.log('[startup] professors.email column ready'))
    .catch(err => console.error('[startup] professors.email migration failed:', err.message));

  pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false`)
    .then(() => console.log('[startup] announcements.pinned column ready'))
    .catch(err => console.error('[startup] announcements.pinned migration failed:', err.message));

  pool.query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`)
    .then(() => console.log('[startup] announcements.updated_at column ready'))
    .catch(err => console.error('[startup] announcements.updated_at migration failed:', err.message));

  pool.query(`
    CREATE TABLE IF NOT EXISTS user_calendar_notes (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       DATE NOT NULL,
      note       TEXT NOT NULL,
      color      VARCHAR(20) NOT NULL DEFAULT 'indigo',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, date)
    )
  `)
    .then(() => console.log('[startup] user_calendar_notes table ready'))
    .catch(err => console.error('[startup] user_calendar_notes migration failed:', err.message));

  pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key        VARCHAR(100) PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
    .then(() => console.log('[startup] system_settings table ready'))
    .catch(err => console.error('[startup] system_settings migration failed:', err.message));
});
