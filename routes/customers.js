const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

// GET /api/customers – List all
router.get('/', async (req, res) => {
    const db = getDb();
    const { search } = req.query;

    let customers;
    if (search) {
        customers = await db.prepare(`
          SELECT c.*, (SELECT COUNT(*) FROM reservations WHERE customer_id = c.id) as reservation_count
          FROM customers c
          WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?
          ORDER BY c.name
        `).all(`%${search}%`, `%${search}%`, `%${search}%`);
    } else {
        customers = await db.prepare(`
          SELECT c.*, (SELECT COUNT(*) FROM reservations WHERE customer_id = c.id) as reservation_count
          FROM customers c
          ORDER BY c.created_at DESC
        `).all();
    }

    res.json(customers);
});

// GET /api/customers/:id
router.get('/:id', async (req, res) => {
    const db = getDb();
    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    customer.reservations = await db.prepare(`
      SELECT r.*, t.table_number FROM reservations r
      LEFT JOIN tables t ON r.table_id = t.id
      WHERE r.customer_id = ?
      ORDER BY r.reservation_date DESC, r.reservation_time DESC
    `).all(req.params.id);

    res.json(customer);
});

// POST /api/customers
router.post('/', async (req, res) => {
    const db = getDb();
    const { name, phone, email, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    if (email) {
        const existing = await db.prepare('SELECT id FROM customers WHERE email = ?').get(email);
        if (existing) return res.json(await db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.id));
    }

    const id = uuidv4();
    await db.prepare('INSERT INTO customers (id, name, phone, email, notes) VALUES (?, ?, ?, ?, ?)').run(id, name, phone || null, email || null, notes || null);
    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.status(201).json(customer);
});

// PUT /api/customers/:id
router.put('/:id', async (req, res) => {
    const db = getDb();
    const { name, phone, email, notes } = req.body;
    const existing = await db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    await db.prepare('UPDATE customers SET name = ?, phone = ?, email = ?, notes = ? WHERE id = ?')
        .run(name || existing.name, phone !== undefined ? phone : existing.phone, email !== undefined ? email : existing.email, notes !== undefined ? notes : existing.notes, req.params.id);

    const customer = await db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json(customer);
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res) => {
    const db = getDb();
    const result = await db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json({ success: true });
});

module.exports = router;
