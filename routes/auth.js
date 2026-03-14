const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'seniour-secret-key-2026';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1312';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'alseniour';

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }

    let role = null;
    if (password === ADMIN_PASSWORD) {
        role = 'admin';
    } else if (password === STAFF_PASSWORD) {
        role = 'staff';
    }

    if (!role) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, role });
});

module.exports = router;
