const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/restaurant
router.get('/', async (req, res) => {
    const db = getDb();
    const info = await db.prepare('SELECT * FROM restaurant_info WHERE id = 1').get();
    if (!info) return res.status(404).json({ error: 'Restaurant info not configured' });

    if (info.operating_hours && typeof info.operating_hours === 'string') {
        try { info.operating_hours = JSON.parse(info.operating_hours); } catch (e) { }
    }
    res.json(info);
});

// PUT /api/restaurant
router.put('/', async (req, res) => {
    const db = getDb();
    const { name, address, phone, email, operating_hours, total_capacity, menu_url, turnover_minutes, description } = req.body;
    const existing = await db.prepare('SELECT * FROM restaurant_info WHERE id = 1').get();

    const hours = operating_hours ? (typeof operating_hours === 'string' ? operating_hours : JSON.stringify(operating_hours)) : existing?.operating_hours;

    if (existing) {
        await db.prepare(`
      UPDATE restaurant_info SET name = ?, address = ?, phone = ?, email = ?, operating_hours = ?,
      total_capacity = ?, menu_url = ?, turnover_minutes = ?, description = ? WHERE id = 1
    `).run(name || existing.name, address !== undefined ? address : existing.address, phone !== undefined ? phone : existing.phone, email !== undefined ? email : existing.email, hours, total_capacity !== undefined ? total_capacity : existing.total_capacity, menu_url !== undefined ? menu_url : existing.menu_url, turnover_minutes !== undefined ? turnover_minutes : existing.turnover_minutes, description !== undefined ? description : existing.description);
    } else {
        await db.prepare(`
      INSERT INTO restaurant_info (id, name, address, phone, email, operating_hours, total_capacity, menu_url, turnover_minutes, description)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, address, phone, email, hours, total_capacity || 0, menu_url, turnover_minutes || 90, description);
    }

    const info = await db.prepare('SELECT * FROM restaurant_info WHERE id = 1').get();
    if (info.operating_hours && typeof info.operating_hours === 'string') {
        try { info.operating_hours = JSON.parse(info.operating_hours); } catch (e) { }
    }

    req.app.get('broadcast')({ type: 'restaurant_updated', data: info });
    res.json(info);
});

module.exports = router;
