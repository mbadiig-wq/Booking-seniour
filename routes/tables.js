const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

// GET /api/tables – List all tables
router.get('/', async (req, res) => {
    const db = getDb();
    const { location, status } = req.query;

    let query = 'SELECT * FROM tables';
    const conditions = [];
    const params = [];

    if (location) { conditions.push('location = ?'); params.push(location); }
    if (status) { conditions.push('status = ?'); params.push(status); }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY table_number';

    const tables = await db.prepare(query).all(...params);
    res.json(tables);
});

// GET /api/tables/available – Check availability for date/time/party size
router.get('/available', async (req, res) => {
    const db = getDb();
    const { date, time, partySize } = req.query;

    if (!date || !time || !partySize) {
        return res.status(400).json({ error: 'date, time, and partySize are required' });
    }

    const size = parseInt(partySize);
    const restaurant = await db.prepare('SELECT turnover_minutes FROM restaurant_info WHERE id = 1').get();
    const turnover = restaurant ? restaurant.turnover_minutes : 90;

    const [hours, minutes] = time.split(':').map(Number);
    const requestedMinutes = hours * 60 + minutes;

    const conflictQuery = process.env.NODE_ENV === 'production'
        ? `SELECT DISTINCT table_id FROM reservations
           WHERE reservation_date = ? AND status IN ('confirmed', 'seated') AND table_id IS NOT NULL
           AND ABS((EXTRACT(HOUR FROM reservation_time::time) * 60 + EXTRACT(MINUTE FROM reservation_time::time)) - ?) < ?`
        : `SELECT DISTINCT table_id FROM reservations
           WHERE reservation_date = ? AND status IN ('confirmed', 'seated') AND table_id IS NOT NULL
           AND ABS((CAST(substr(reservation_time, 1, 2) AS INTEGER) * 60 + CAST(substr(reservation_time, 4, 2) AS INTEGER)) - ?) < ?`;

    const conflictingTableIds = (await db.prepare(conflictQuery).all(date, requestedMinutes, turnover)).map(r => r.table_id);

    let availableTables;
    if (conflictingTableIds.length > 0) {
        const placeholders = conflictingTableIds.map(() => '?').join(',');
        availableTables = await db.prepare(`SELECT * FROM tables WHERE capacity >= ? AND id NOT IN (${placeholders}) ORDER BY capacity ASC, table_number ASC`)
            .all(size, ...conflictingTableIds);
    } else {
        availableTables = await db.prepare(`SELECT * FROM tables WHERE capacity >= ? ORDER BY capacity ASC, table_number ASC`)
            .all(size);
    }

    res.json({
        available: availableTables,
        requestedDate: date,
        requestedTime: time,
        requestedPartySize: size
    });
});

// POST /api/tables – Add table
router.post('/', async (req, res) => {
    const db = getDb();
    const { table_number, capacity, location, pos_x, pos_y } = req.body;

    if (!table_number || !capacity) {
        return res.status(400).json({ error: 'table_number and capacity are required' });
    }

    const existing = await db.prepare('SELECT id FROM tables WHERE table_number = ?').get(table_number);
    if (existing) return res.status(409).json({ error: 'Table number already exists' });

    const id = uuidv4();
    await db.prepare('INSERT INTO tables (id, table_number, capacity, location, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, table_number, capacity, location || 'inside', pos_x || 0, pos_y || 0);

    const table = await db.prepare('SELECT * FROM tables WHERE id = ?').get(id);
    req.app.get('broadcast')({ type: 'table_added', data: table });
    res.status(201).json(table);
});

// PUT /api/tables/:id – Update table
router.put('/:id', async (req, res) => {
    const db = getDb();
    const { table_number, capacity, location, status, pos_x, pos_y } = req.body;

    const existing = await db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Table not found' });

    await db.prepare(`UPDATE tables SET table_number = ?, capacity = ?, location = ?, status = ?, pos_x = ?, pos_y = ? WHERE id = ?`)
        .run(
            table_number !== undefined ? table_number : existing.table_number,
            capacity !== undefined ? capacity : existing.capacity,
            location || existing.location,
            status || existing.status,
            pos_x !== undefined ? pos_x : existing.pos_x,
            pos_y !== undefined ? pos_y : existing.pos_y,
            req.params.id
        );

    const table = await db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    req.app.get('broadcast')({ type: 'table_updated', data: table });
    res.json(table);
});

// DELETE /api/tables/:id
router.delete('/:id', async (req, res) => {
    const db = getDb();
    const result = await db.prepare('DELETE FROM tables WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Table not found' });

    req.app.get('broadcast')({ type: 'table_deleted', data: { id: req.params.id } });
    res.json({ success: true });
});

module.exports = router;
