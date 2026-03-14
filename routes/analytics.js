const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/analytics/overview
router.get('/overview', async (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const todayReservations = await db.prepare("SELECT COUNT(*) as count FROM reservations WHERE reservation_date = ? AND status != 'cancelled'").get(today);
  const todayCovers = await db.prepare("SELECT COALESCE(SUM(party_size), 0) as total FROM reservations WHERE reservation_date = ? AND status IN ('confirmed', 'seated', 'completed')").get(today);
  const todayCompleted = await db.prepare("SELECT COUNT(*) as count FROM reservations WHERE reservation_date = ? AND status = 'completed'").get(today);
  const todaySeated = await db.prepare("SELECT COUNT(*) as count FROM reservations WHERE reservation_date = ? AND status = 'seated'").get(today);
  const totalTables = await db.prepare('SELECT COUNT(*) as count FROM tables').get();
  const occupiedTables = await db.prepare("SELECT COUNT(*) as count FROM tables WHERE status = 'occupied'").get();
  const waitlistCount = await db.prepare("SELECT COUNT(*) as count FROM waitlist WHERE status = 'waiting'").get();

  res.json({
    today: {
      reservations: todayReservations.count,
      covers: todayCovers.total,
      completed: todayCompleted.count,
      seated: todaySeated.count
    },
    tables: {
      total: totalTables.count,
      occupied: occupiedTables.count
    },
    waitlist: waitlistCount.count
  });
});

// GET /api/analytics/trends
router.get('/trends', async (req, res) => {
  const db = getDb();
  const { days = 30 } = req.query;

  const query = process.env.NODE_ENV === 'production'
    ? `SELECT reservation_date as date, COUNT(*) as reservations, SUM(party_size) as covers
           FROM reservations WHERE reservation_date >= CURRENT_DATE - INTERVAL '? days'
           GROUP BY reservation_date ORDER BY reservation_date ASC`
    : `SELECT reservation_date as date, COUNT(*) as reservations, SUM(party_size) as covers
           FROM reservations WHERE reservation_date >= date('now', '-' || ? || ' days')
           GROUP BY reservation_date ORDER BY reservation_date ASC`;

  const trends = await db.prepare(query).all(parseInt(days));
  res.json(trends);
});

// GET /api/analytics/peak-hours
router.get('/peak-hours', async (req, res) => {
  const db = getDb();
  const query = process.env.NODE_ENV === 'production'
    ? `SELECT EXTRACT(HOUR FROM reservation_time::time) as hour, COUNT(*) as count
           FROM reservations WHERE status != 'cancelled' AND reservation_date >= CURRENT_DATE - INTERVAL '30 days'
           GROUP BY hour ORDER BY hour ASC`
    : `SELECT substr(reservation_time, 1, 2) as hour, COUNT(*) as count
           FROM reservations WHERE status != 'cancelled' AND reservation_date >= date('now', '-30 days')
           GROUP BY hour ORDER BY hour ASC`;

  const peakHours = await db.prepare(query).all();
  res.json(peakHours);
});

module.exports = router;

// GET /api/analytics/table-utilization
router.get('/table-utilization', (req, res) => {
  try {
    const db = getDb();

    const utilization = db.prepare(`
      SELECT t.table_number, t.capacity, t.location,
             COUNT(r.id) as total_reservations,
             SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN r.status = 'no-show' THEN 1 ELSE 0 END) as no_shows,
             ROUND(AVG(r.party_size), 1) as avg_party_size
      FROM tables t
      LEFT JOIN reservations r ON t.id = r.table_id AND r.reservation_date >= date('now', '-30 days')
      GROUP BY t.id
      ORDER BY t.table_number
    `).all();

    res.json(utilization);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
