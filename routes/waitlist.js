const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

// Protect all waitlist routes
router.use(auth('staff'));
const { getDb } = require('../db/database');

// GET /api/waitlist
router.get('/', async (req, res) => {
    const db = getDb();
    const { status } = req.query;
    let query = 'SELECT * FROM waitlist';
    const params = [];
    if (status) {
        query += ' WHERE status = ?';
        params.push(status);
    }
    query += ' ORDER BY added_at ASC';
    const entries = await db.prepare(query).all(...params);
    res.json(entries);
});

// POST /api/waitlist
router.post('/', async (req, res) => {
    const db = getDb();
    const { name, phone, party_size, estimated_wait, notes } = req.body;
    if (!name || !party_size) return res.status(400).json({ error: 'name and party_size are required' });

    const id = uuidv4();
    await db.prepare('INSERT INTO waitlist (id, name, phone, party_size, estimated_wait, notes) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, name, phone || null, party_size, estimated_wait || 30, notes || null);

    const entry = await db.prepare('SELECT * FROM waitlist WHERE id = ?').get(id);
    req.app.get('broadcast')({ type: 'waitlist_added', data: entry });
    res.status(201).json(entry);
});

// PUT /api/waitlist/:id
router.put('/:id', async (req, res) => {
    const db = getDb();
    const { status, estimated_wait, notes } = req.body;
    const existing = await db.prepare('SELECT * FROM waitlist WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Waitlist entry not found' });

    await db.prepare('UPDATE waitlist SET status = ?, estimated_wait = ?, notes = ? WHERE id = ?')
        .run(status || existing.status, estimated_wait !== undefined ? estimated_wait : existing.estimated_wait, notes !== undefined ? notes : existing.notes, req.params.id);

    const entry = await db.prepare('SELECT * FROM waitlist WHERE id = ?').get(req.params.id);
    req.app.get('broadcast')({ type: 'waitlist_updated', data: entry });
    res.json(entry);
});

// DELETE /api/waitlist/:id
router.delete('/:id', async (req, res) => {
    const db = getDb();
    const result = await db.prepare('DELETE FROM waitlist WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });

    req.app.get('broadcast')({ type: 'waitlist_removed', data: { id: req.params.id } });
    res.json({ success: true });
});

module.exports = router;
