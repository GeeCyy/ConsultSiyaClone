const express = require('express');
const router = express.Router();
const pool = require('../db/db');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// Professor sets their available schedules
router.post('/', authenticate, authorize('professor'), async (req, res) => {
  const { day, time_start, time_end, location, date, time_ranges } = req.body;

  // Normalize date
  const dateValue = (typeof date === 'string' && date.trim().length >= 8)
    ? date.trim().slice(0, 10)
    : null;
  console.log('[schedules POST] received date:', JSON.stringify(date), '→ stored as:', dateValue);

  // Derive effective time_start/time_end from first/last range for backward compat
  const trArray = Array.isArray(time_ranges) && time_ranges.length > 0 ? time_ranges : null;
  const effectiveStart = trArray ? trArray[0].time_start : time_start;
  const effectiveEnd   = trArray ? trArray[trArray.length - 1].time_end : time_end;
  const trJson = trArray ? JSON.stringify(trArray) : null;

  try {
    const profResult = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`,
      [req.user.id]
    );
    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }
    const professor_id = profResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO schedules (professor_id, day, time_start, time_end, location, date, time_ranges)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id, day, time_start, time_end, location, date::text AS date, time_ranges`,
      [professor_id, day, effectiveStart, effectiveEnd, location || null, dateValue, trJson]
    );
    console.log('[schedules POST] row saved — id:', result.rows[0].id, 'date:', result.rows[0].date);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all schedules visible to students (only today or future dated slots)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.day, s.time_start, s.time_end, s.is_available, s.location, s.date::text AS date,
              s.time_ranges,
              p.id AS professor_id, p.full_name AS professor_name, p.department
       FROM schedules s
       JOIN professors p ON s.professor_id = p.id
       WHERE s.date IS NULL OR s.date >= CURRENT_DATE
       ORDER BY s.date NULLS LAST, s.day, s.time_start`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: view all schedules across all professors
router.get('/all', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.day, s.time_start, s.time_end, s.is_available, s.location, s.date::text AS date,
              s.time_ranges,
              p.id AS professor_id, p.full_name AS professor_name, p.department
       FROM schedules s
       JOIN professors p ON s.professor_id = p.id
       ORDER BY p.full_name, s.date NULLS LAST, s.day, s.time_start`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor views their own schedules with upcoming booking count
router.get('/mine', authenticate, authorize('professor'), async (req, res) => {
  try {
    const profResult = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`,
      [req.user.id]
    );
    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }
    const professor_id = profResult.rows[0].id;

    const result = await pool.query(
      `SELECT s.id, s.professor_id, s.day, s.time_start, s.time_end, s.is_available, s.location,
              s.date::text AS date, s.time_ranges,
         (SELECT COUNT(*)::int FROM consultations c
          WHERE c.schedule_id = s.id AND c.status NOT IN ('cancelled') AND c.date >= CURRENT_DATE) AS upcoming_count
       FROM schedules s
       WHERE s.professor_id = $1
       ORDER BY s.day, s.time_start`,
      [professor_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Return already-booked times for a schedule slot on a given date
router.get('/:id/booked-times', authenticate, async (req, res) => {
  const { id } = req.params;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required.' });
  try {
    const result = await pool.query(
      `SELECT time FROM consultations
       WHERE schedule_id = $1 AND date = $2 AND status IN ('pending', 'confirmed') AND time IS NOT NULL`,
      [id, date]
    );
    res.json(result.rows.map(r => (r.time || '').slice(0, 5)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor edits their own schedule slot
router.patch('/:id', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  const { day, time_start, time_end, location, date, time_ranges } = req.body;

  const trArray = Array.isArray(time_ranges) && time_ranges.length > 0 ? time_ranges : null;
  const effectiveStart = trArray ? trArray[0].time_start : time_start;
  const effectiveEnd   = trArray ? trArray[trArray.length - 1].time_end : time_end;
  const trJson = trArray ? JSON.stringify(trArray) : null;

  if (!day || !effectiveStart || !effectiveEnd) {
    return res.status(400).json({ error: 'day and at least one time range are required.' });
  }

  try {
    const profResult = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`, [req.user.id]
    );
    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }
    const professor_id = profResult.rows[0].id;

    const schedResult = await pool.query(
      `SELECT professor_id FROM schedules WHERE id = $1`, [id]
    );
    if (schedResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found.' });
    }
    if (schedResult.rows[0].professor_id !== professor_id) {
      return res.status(403).json({ error: 'You can only edit your own schedules.' });
    }

    // Check active bookings whose dates no longer match the new day
    const bookings = await pool.query(
      `SELECT c.date FROM consultations c
       WHERE c.schedule_id = $1 AND c.status NOT IN ('cancelled') AND c.date >= CURRENT_DATE`,
      [id]
    );

    const DAY_MAP = {
      Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
      Thursday: 4, Friday: 5, Saturday: 6,
    };
    const newDayNum = DAY_MAP[day];
    for (const row of bookings.rows) {
      const d = new Date(row.date);
      if (d.getDay() !== newDayNum) {
        return res.status(400).json({
          error: `Cannot change day to ${day} — existing booking on ${new Date(row.date).toLocaleDateString()} would conflict.`,
        });
      }
    }

    const result = await pool.query(
      `UPDATE schedules
       SET day = $1, time_start = $2, time_end = $3, location = $4, date = $5, time_ranges = $6::jsonb
       WHERE id = $7
       RETURNING id, day, time_start, time_end, location, date::text AS date, time_ranges`,
      [day, effectiveStart, effectiveEnd, location || null, date || null, trJson, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Professor deletes their own schedule slot
router.delete('/:id', authenticate, authorize('professor'), async (req, res) => {
  const { id } = req.params;
  try {
    const profResult = await pool.query(
      `SELECT id FROM professors WHERE user_id = $1`, [req.user.id]
    );
    if (profResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor profile not found.' });
    }
    const professor_id = profResult.rows[0].id;

    const schedResult = await pool.query(
      `SELECT professor_id FROM schedules WHERE id = $1`, [id]
    );
    if (schedResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found.' });
    }
    if (schedResult.rows[0].professor_id !== professor_id) {
      return res.status(403).json({ error: 'You can only delete your own schedules.' });
    }

    await pool.query(`DELETE FROM schedules WHERE id = $1`, [id]);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
