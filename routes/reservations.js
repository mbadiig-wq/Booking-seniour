const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

// GET /api/reservations – List all (with filters)
router.get('/', async (req, res) => {
    const db = getDb();
    const { date, status, customer_id, upcoming } = req.query;

    let query = `
      SELECT r.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
             t.table_number, t.capacity as table_capacity, t.location as table_location
      FROM reservations r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN tables t ON r.table_id = t.id
    `;
    const conditions = [];
    const params = [];

    if (date) { conditions.push('r.reservation_date = ?'); params.push(date); }
    if (status) { conditions.push('r.status = ?'); params.push(status); }
    if (customer_id) { conditions.push('r.customer_id = ?'); params.push(customer_id); }
    if (upcoming === 'true') {
        if (process.env.NODE_ENV === 'production') {
            conditions.push("r.reservation_date >= CURRENT_DATE");
        } else {
            conditions.push("r.reservation_date >= date('now')");
        }
        conditions.push("r.status IN ('confirmed', 'seated')");
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY r.reservation_date ASC, r.reservation_time ASC';

    const reservations = await db.prepare(query).all(...params);
    res.json(reservations);
});

// GET /api/reservations/:id
router.get('/:id', async (req, res) => {
    const db = getDb();
    const reservation = await db.prepare(`
      SELECT r.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
             t.table_number, t.capacity as table_capacity, t.location as table_location
      FROM reservations r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN tables t ON r.table_id = t.id
      WHERE r.id = ?
    `).get(req.params.id);

    if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
    res.json(reservation);
});

// POST /api/reservations – Create (with conflict prevention)
router.post('/', async (req, res) => {
    const db = getDb();
    const { customer_id, customer_name, customer_phone, customer_email,
        table_id, reservation_date, reservation_time, party_size, special_requests } = req.body;

    if (!reservation_date || !reservation_time || !party_size) {
        return res.status(400).json({ error: 'reservation_date, reservation_time, and party_size are required' });
    }

    // Create or find customer
    let custId = customer_id;
    if (!custId) {
        if (!customer_name) return res.status(400).json({ error: 'customer_name is required' });

        if (customer_email) {
            const existing = await db.prepare('SELECT id FROM customers WHERE email = ?').get(customer_email);
            if (existing) custId = existing.id;
        }

        if (!custId) {
            custId = uuidv4();
            await db.prepare('INSERT INTO customers (id, name, phone, email) VALUES (?, ?, ?, ?)')
                .run(custId, customer_name, customer_phone || null, customer_email || null);
        }
    }

    const restaurant = await db.prepare('SELECT turnover_minutes FROM restaurant_info WHERE id = 1').get();
    const turnover = restaurant ? restaurant.turnover_minutes : 90;
    const [hours, minutes] = reservation_time.split(':').map(Number);
    const requestedMinutes = hours * 60 + minutes;

    let assignedTableId = table_id;
    if (assignedTableId) {
        const table = await db.prepare('SELECT * FROM tables WHERE id = ?').get(assignedTableId);
        if (!table) return res.status(400).json({ error: 'Table not found' });
        if (table.capacity < party_size) {
            return res.status(400).json({ error: `Table ${table.table_number} seats ${table.capacity}` });
        }

        // Conflict check
        const conflictQuery = process.env.NODE_ENV === 'production'
            ? `SELECT r.*, c.name as customer_name FROM reservations r 
               LEFT JOIN customers c ON r.customer_id = c.id 
               WHERE r.table_id = ? AND r.reservation_date = ? AND r.status IN ('confirmed', 'seated')
               AND ABS((EXTRACT(HOUR FROM r.reservation_time::time) * 60 + EXTRACT(MINUTE FROM r.reservation_time::time)) - ?) < ?`
            : `SELECT r.*, c.name as customer_name FROM reservations r 
               LEFT JOIN customers c ON r.customer_id = c.id 
               WHERE r.table_id = ? AND r.reservation_date = ? AND r.status IN ('confirmed', 'seated')
               AND ABS((CAST(substr(r.reservation_time, 1, 2) AS INTEGER) * 60 + CAST(substr(r.reservation_time, 4, 2) AS INTEGER)) - ?) < ?`;

        const conflict = await db.prepare(conflictQuery).get(assignedTableId, reservation_date, requestedMinutes, turnover);

        if (conflict) {
            return res.status(409).json({ error: 'Table conflict', message: `Reserved by ${conflict.customer_name}` });
        }
    } else {
        // Auto-assign
        const conflictQuery = process.env.NODE_ENV === 'production'
            ? `SELECT DISTINCT table_id FROM reservations WHERE reservation_date = ? AND status IN ('confirmed', 'seated')
               AND table_id IS NOT NULL AND ABS((EXTRACT(HOUR FROM reservation_time::time) * 60 + EXTRACT(MINUTE FROM reservation_time::time)) - ?) < ?`
            : `SELECT DISTINCT table_id FROM reservations WHERE reservation_date = ? AND status IN ('confirmed', 'seated')
               AND table_id IS NOT NULL AND ABS((CAST(substr(reservation_time, 1, 2) AS INTEGER) * 60 + CAST(substr(reservation_time, 4, 2) AS INTEGER)) - ?) < ?`;

        const conflictingTableIds = (await db.prepare(conflictQuery).all(reservation_date, requestedMinutes, turnover)).map(r => r.table_id);

        let bestTable;
        if (conflictingTableIds.length > 0) {
            const placeholders = conflictingTableIds.map(() => '?').join(',');
            bestTable = await db.prepare(`SELECT * FROM tables WHERE capacity >= ? AND id NOT IN (${placeholders}) ORDER BY capacity ASC LIMIT 1`)
                .get(party_size, ...conflictingTableIds);
        } else {
            bestTable = await db.prepare(`SELECT * FROM tables WHERE capacity >= ? ORDER BY capacity ASC LIMIT 1`)
                .get(party_size);
        }

        if (!bestTable) return res.status(409).json({ error: 'No available tables' });
        assignedTableId = bestTable.id;
    }

    const id = uuidv4();
    await db.prepare(`
      INSERT INTO reservations (id, customer_id, table_id, reservation_date, reservation_time, party_size, special_requests, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
    `).run(id, custId, assignedTableId, reservation_date, reservation_time, party_size, special_requests || null);

    const reservation = await db.prepare(`
      SELECT r.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
             t.table_number, t.capacity as table_capacity, t.location as table_location
      FROM reservations r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN tables t ON r.table_id = t.id
      WHERE r.id = ?
    `).get(id);

    req.app.get('broadcast')({ type: 'reservation_created', data: reservation });
    res.status(201).json(reservation);
});

// Update status
router.put('/:id/status', async (req, res) => {
    const db = getDb();
    const { status } = req.body;
    const existing = await db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Reservation not found' });

    await db.prepare('UPDATE reservations SET status = ? WHERE id = ?').run(status, req.params.id);

    if (existing.table_id) {
        if (status === 'seated') {
            await db.prepare("UPDATE tables SET status = 'occupied' WHERE id = ?").run(existing.table_id);
        } else if (['completed', 'cancelled', 'no-show'].includes(status)) {
            await db.prepare("UPDATE tables SET status = 'available' WHERE id = ?").run(existing.table_id);
        }
    }

    const reservation = await db.prepare(`
      SELECT r.*, c.name as customer_name, t.table_number FROM reservations r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN tables t ON r.table_id = t.id
      WHERE r.id = ?
    `).get(req.params.id);

    req.app.get('broadcast')({ type: 'reservation_status_changed', data: reservation });
    res.json(reservation);
});

// Cancel
router.delete('/:id', async (req, res) => {
    const db = getDb();
    const existing = await db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Reservation not found' });

    await db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?").run(req.params.id);

    if (existing.table_id) {
        await db.prepare("UPDATE tables SET status = 'available' WHERE id = ?").run(existing.table_id);
    }

    req.app.get('broadcast')({ type: 'reservation_cancelled', data: { id: req.params.id, table_id: existing.table_id } });
    res.json({ success: true });
});

module.exports = router;
