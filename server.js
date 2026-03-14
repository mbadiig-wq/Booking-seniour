const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
require('express-async-errors');
const { initializeDatabase, closeDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check for Docker/Cloud
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ── Initialize Supabase Client (for real-time broadcasting) ──
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    console.log('🌌 Supabase Realtime client initialized');
}

// ── Initialize Database & Start Server ──
async function start() {
    try {
        await initializeDatabase();
        console.log('✅ Database connected');

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`\n🍽️  Al Seniour Reservation System [PRODUCTION READY]`);
            console.log(`   Server running at http://localhost:${PORT}`);
            console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   SSE endpoint: /api/events\n`);
        });
    } catch (err) {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
    }
}

start();

// ── Configuration Endpoint for Frontend ──
app.get('/api/config.js', (req, res) => {
    const config = {
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
    };
    res.type('application/javascript');
    res.send(`window.ENV = ${JSON.stringify(config)};`);
});

// ── SSE: Real-time event broadcasting ──
const sseClients = new Set();

app.get('/api/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    res.write('data: {"type":"connected"}\n\n');

    sseClients.add(res);
    console.log(`📡 SSE client connected (${sseClients.size} total)`);

    req.on('close', () => {
        sseClients.delete(res);
        console.log(`📡 SSE client disconnected (${sseClients.size} total)`);
    });
});

function broadcast(event) {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
        client.write(data);
    }

    if (supabase) {
        supabase.channel('public:restaurant_events').send({
            type: 'broadcast',
            event: event.type,
            payload: event.data
        }).catch(err => console.error('Supabase broadcast error:', err));
    }
}

// Make broadcast available to routes
app.set('broadcast', broadcast);

// API Routes
const auth = require('./middleware/auth');
app.use('/api/auth', require('./routes/auth'));

app.use('/api/customers', require('./routes/customers'));
app.use('/api/restaurant', require('./routes/restaurant'));

// Routes with internal auth control
app.use('/api/tables', require('./routes/tables'));
app.use('/api/reservations', require('./routes/reservations'));
app.use('/api/waitlist', require('./routes/waitlist'));
app.use('/api/analytics', auth('staff'), require('./routes/analytics'));

// ── Serve frontend for all non-API routes ──
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Error Handler ──
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.message);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Graceful shutdown ──
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    closeDb();
    process.exit(0);
});

process.on('SIGTERM', () => {
    closeDb();
    process.exit(0);
});
