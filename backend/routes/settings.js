const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// ── Avatar upload setup ───────────────────────────────────────────────────────
const avatarDir = path.join(__dirname, '../uploads/avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `avatar-${req.user.id}-${Date.now()}${ext}`);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WEBP, GIF) are allowed.'));
    }
  },
});

// ── GET /api/settings/profile ─────────────────────────────────────────────────
// Only guaranteed-to-exist columns are used in the main JOIN query.
// Optional columns (phone, email on role tables; profile_picture_url on users)
// are fetched in isolated try/catch blocks so a missing column never blocks
// the primary profile data from being returned.
router.get('/profile', authenticate, async (req, res) => {
  const { id, role } = req.user;
  try {
    let profileData;

    if (role === 'student') {
      const result = await pool.query(
        `SELECT u.email, u.created_at,
                s.full_name, s.student_number, s.program, s.year_level
         FROM users u
         LEFT JOIN students s ON s.user_id = u.id
         WHERE u.id = $1`,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
      profileData = result.rows[0];
    } else if (role === 'professor') {
      const result = await pool.query(
        `SELECT u.email, u.created_at,
                p.full_name, p.department
         FROM users u
         LEFT JOIN professors p ON p.user_id = u.id
         WHERE u.id = $1`,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
      profileData = result.rows[0];
    } else if (role === 'admin') {
      const result = await pool.query(
        `SELECT email, created_at FROM users WHERE id = $1`,
        [id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
      profileData = { full_name: 'Administrator', ...result.rows[0] };
    } else {
      return res.status(400).json({ error: 'Unknown role.' });
    }

    // phone — added to students/professors by migrate.sql; skip gracefully if absent
    let phone = '';
    if (role === 'student' || role === 'professor') {
      const table = role === 'student' ? 'students' : 'professors';
      try {
        const r = await pool.query(
          `SELECT phone FROM ${table} WHERE user_id = $1`, [id]
        );
        phone = r.rows[0]?.phone || '';
      } catch { /* 42703 — column not yet added */ }
    }

    // avatar — guaranteed to exist after the startup migration in server.js,
    // but still wrapped in try/catch for safety on the very first request
    // before the async ALTER TABLE has completed.
    let profile_picture_url = null;
    try {
      const r = await pool.query(
        `SELECT avatar FROM users WHERE id = $1`, [id]
      );
      profile_picture_url = r.rows[0]?.avatar ?? null;
    } catch { /* column not yet ready — return null */ }

    return res.json({ role, ...profileData, phone, profile_picture_url });
  } catch (err) {
    console.error('[Settings GET /profile]', err.message);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// ── PATCH /api/settings/profile ───────────────────────────────────────────────
router.patch(
  '/profile',
  authenticate,
  [
    body('full_name').optional().trim().notEmpty().withMessage('Full name cannot be empty.'),
    body('email')
      .optional({ checkFalsy: true })
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email format.'),
    body('phone').optional({ checkFalsy: true }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { id, role } = req.user;
    const { full_name, student_number, program, year_level, department, email, phone } = req.body;

    try {
      if (role === 'student') {
        if (!student_number) return res.status(400).json({ error: 'Student number is required.' });

        // Try full update (phone + email columns from migrate.sql).
        // If those columns don't exist yet, fall back to base columns only.
        try {
          await pool.query(
            `UPDATE students
             SET full_name = $1, student_number = $2, program = $3,
                 year_level = $4, email = $5, phone = $6
             WHERE user_id = $7`,
            [full_name, student_number, program || null,
             year_level ? parseInt(year_level) : null,
             email || null, phone || null, id]
          );
        } catch (colErr) {
          if (colErr.code !== '42703') throw colErr; // unexpected error — re-throw
          await pool.query(
            `UPDATE students
             SET full_name = $1, student_number = $2, program = $3, year_level = $4
             WHERE user_id = $5`,
            [full_name, student_number, program || null,
             year_level ? parseInt(year_level) : null, id]
          );
        }

        // Login email always lives on users — sync it regardless of migrate state
        if (email) {
          await pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [email, id]);
        }
        return res.json({ message: 'Profile updated.' });
      }

      if (role === 'professor') {
        try {
          await pool.query(
            `UPDATE professors
             SET full_name = $1, department = $2, email = $3, phone = $4
             WHERE user_id = $5`,
            [full_name || null, department || null, email || null, phone || null, id]
          );
        } catch (colErr) {
          if (colErr.code !== '42703') throw colErr;
          await pool.query(
            `UPDATE professors SET full_name = $1, department = $2 WHERE user_id = $3`,
            [full_name || null, department || null, id]
          );
        }

        if (email) {
          await pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [email, id]);
        }
        return res.json({ message: 'Profile updated.' });
      }

      if (role === 'admin') {
        if (email) {
          await pool.query(`UPDATE users SET email = $1 WHERE id = $2`, [email, id]);
        }
        return res.json({ message: 'Profile updated.' });
      }
    } catch (err) {
      console.error('[Settings PATCH /profile]', err.message);
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Email or student number is already in use.' });
      }
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  }
);

// ── POST /api/settings/avatar ─────────────────────────────────────────────────
router.post(
  '/avatar',
  authenticate,
  (req, res, next) => {
    uploadAvatar.single('avatar')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const { id } = req.user;
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    try {
      // Remove the old avatar file if one exists on disk
      const old = await pool.query(`SELECT avatar FROM users WHERE id = $1`, [id]);
      const oldUrl = old.rows[0]?.avatar;
      if (oldUrl) {
        const oldPath = path.join(__dirname, '..', oldUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }

      await pool.query(`UPDATE users SET avatar = $1 WHERE id = $2`, [avatarUrl, id]);
      res.json({ message: 'Avatar updated.', avatar_url: avatarUrl });
    } catch (err) {
      console.error('[Settings POST /avatar]', err.message);
      res.status(500).json({ error: 'Failed to update avatar.' });
    }
  }
);

// ── GET /api/settings/notifications ──────────────────────────────────────────
const NOTIF_DEFAULTS = {
  email_booking_confirmed: true,
  email_booking_cancelled: true,
  email_upcoming_reminder: true,
  inapp_booking_confirmed: true,
  inapp_booking_cancelled: true,
  inapp_upcoming_reminder: true,
};

router.get('/notifications', authenticate, async (req, res) => {
  const { id } = req.user;
  try {
    const result = await pool.query(
      `SELECT email_booking_confirmed, email_booking_cancelled, email_upcoming_reminder,
              inapp_booking_confirmed, inapp_booking_cancelled, inapp_upcoming_reminder
       FROM user_settings WHERE user_id = $1`,
      [id]
    );
    res.json(result.rows.length === 0 ? NOTIF_DEFAULTS : result.rows[0]);
  } catch (err) {
    // 42P01 = table doesn't exist yet (migration not run) — return defaults
    if (err.code === '42P01') return res.json(NOTIF_DEFAULTS);
    console.error('[Settings GET /notifications]', err.message);
    res.status(500).json({ error: 'Failed to fetch notification preferences.' });
  }
});

// ── PUT /api/settings/notifications ──────────────────────────────────────────
router.put('/notifications', authenticate, async (req, res) => {
  const { id } = req.user;
  const {
    email_booking_confirmed,
    email_booking_cancelled,
    email_upcoming_reminder,
    inapp_booking_confirmed,
    inapp_booking_cancelled,
    inapp_upcoming_reminder,
  } = req.body;

  try {
    await pool.query(
      `INSERT INTO user_settings
         (user_id, email_booking_confirmed, email_booking_cancelled, email_upcoming_reminder,
          inapp_booking_confirmed, inapp_booking_cancelled, inapp_upcoming_reminder, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         email_booking_confirmed = EXCLUDED.email_booking_confirmed,
         email_booking_cancelled = EXCLUDED.email_booking_cancelled,
         email_upcoming_reminder = EXCLUDED.email_upcoming_reminder,
         inapp_booking_confirmed = EXCLUDED.inapp_booking_confirmed,
         inapp_booking_cancelled = EXCLUDED.inapp_booking_cancelled,
         inapp_upcoming_reminder = EXCLUDED.inapp_upcoming_reminder,
         updated_at = NOW()`,
      [
        id,
        email_booking_confirmed ?? true,
        email_booking_cancelled ?? true,
        email_upcoming_reminder ?? true,
        inapp_booking_confirmed ?? true,
        inapp_booking_cancelled ?? true,
        inapp_upcoming_reminder ?? true,
      ]
    );
    res.json({ message: 'Notification preferences updated.' });
  } catch (err) {
    console.error('[Settings PUT /notifications]', err.message);
    res.status(500).json({ error: 'Failed to update notification preferences.' });
  }
});

// ── PATCH /api/settings/password ─────────────────────────────────────────────
router.patch(
  '/password',
  authenticate,
  [
    body('current_password').notEmpty().withMessage('Current password is required.'),
    body('new_password')
      .isLength({ min: 8 })
      .withMessage('New password must be at least 8 characters.'),
    body('confirm_password').custom((val, { req }) => {
      if (val !== req.body.new_password) throw new Error('Passwords do not match.');
      return true;
    }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { id } = req.user;
    const { current_password, new_password } = req.body;

    try {
      const result = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

      const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

      const newHash = await bcrypt.hash(new_password, 12);
      await pool.query(
        `UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2`,
        [newHash, id]
      );
      res.json({ message: 'Password changed successfully.' });
    } catch (err) {
      console.error('[Settings PATCH /password]', err.message);
      res.status(500).json({ error: 'Failed to change password.' });
    }
  }
);

// ── GET /api/settings/system (admin only) ────────────────────────────────────
const SYSTEM_DEFAULTS = {
  maintenance_mode: 'false',
  max_bookings_per_student: '5',
  academic_year: '2025-2026',
  current_semester: '2nd Semester',
};

router.get('/system', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT key, value FROM system_settings ORDER BY key`
    );
    const settings = {};
    result.rows.forEach((row) => { settings[row.key] = row.value; });
    res.json(Object.keys(settings).length ? settings : SYSTEM_DEFAULTS);
  } catch (err) {
    // 42P01 = table doesn't exist yet (migration not run) — return defaults
    if (err.code === '42P01') return res.json(SYSTEM_DEFAULTS);
    console.error('[Settings GET /system]', err.message);
    res.status(500).json({ error: 'Failed to fetch system settings.' });
  }
});

// ── PUT /api/settings/system (admin only) ────────────────────────────────────
const ALLOWED_SYSTEM_KEYS = [
  'maintenance_mode',
  'max_bookings_per_student',
  'academic_year',
  'current_semester',
];

router.put('/system', authenticate, authorize('admin'), async (req, res) => {
  const { id } = req.user;
  const updates = req.body;

  try {
    for (const key of Object.keys(updates)) {
      if (!ALLOWED_SYSTEM_KEYS.includes(key)) continue;
      await pool.query(
        `INSERT INTO system_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [key, String(updates[key]), id]
      );
    }
    res.json({ message: 'System settings updated.' });
  } catch (err) {
    console.error('[Settings PUT /system]', err.message);
    res.status(500).json({ error: 'Failed to update system settings.' });
  }
});

// ── GET /api/settings/term ────────────────────────────────────────────────────
const TERM_DEFAULTS = {
  term_label: '3rd Trimester, A.Y. 2025–2026',
  term_start: '2026-04-02',
  term_total_weeks: '14',
  term_midterm_week: '7',
  term_finals_week: '13',
};
const TERM_KEYS = Object.keys(TERM_DEFAULTS);

router.get('/term', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
      [TERM_KEYS]
    );
    const settings = { ...TERM_DEFAULTS };
    result.rows.forEach(row => { settings[row.key] = row.value; });
    res.json(settings);
  } catch (err) {
    if (err.code === '42P01') return res.json(TERM_DEFAULTS);
    console.error('[Settings GET /term]', err.message);
    res.status(500).json({ error: 'Failed to fetch term settings.' });
  }
});

// ── PUT /api/settings/term (admin only) ───────────────────────────────────────
router.put('/term', authenticate, authorize('admin'), async (req, res) => {
  const updates = req.body;
  const { id } = req.user;
  if (!TERM_KEYS.some(k => updates[k] !== undefined)) {
    return res.status(400).json({ error: 'No valid term fields provided.' });
  }
  try {
    for (const key of TERM_KEYS) {
      if (updates[key] === undefined) continue;
      await pool.query(
        `INSERT INTO system_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [key, String(updates[key]), id]
      );
    }
    res.json({ message: 'Term settings updated.' });
  } catch (err) {
    console.error('[Settings PUT /term]', err.message);
    if (err.code === '42P01') {
      return res.status(503).json({ error: 'Settings table not ready. Restart the server and try again.' });
    }
    res.status(500).json({ error: 'Failed to update term settings.' });
  }
});

module.exports = router;
