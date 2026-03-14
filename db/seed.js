const { v4: uuidv4 } = require('uuid');

async function seedDatabase(db) {
    console.log('🌱 Seeding database with initial data...');

    const existing = await db.prepare('SELECT id FROM restaurant_info WHERE id = 1').get();
    if (existing) {
        console.log('ℹ️  Database already seeded.');
        return;
    }

    // ── Restaurant Info ──
    await db.prepare(`
      INSERT INTO restaurant_info (id, name, address, phone, email, operating_hours, total_capacity, menu_url, turnover_minutes, description)
      VALUES (1, ?::text, ?::text, ?::text, ?::text, ?::text, ?::integer, ?::text, ?::integer, ?::text)
    `).run(
        'Al Seniour',
        'River Side, Tunis, Tunisia',
        '+216 21 662 222',
        'alseniour@restaurant.tn',
        JSON.stringify({
            monday: { open: '08:00', close: '00:00' },
            tuesday: { open: '08:00', close: '00:00' },
            wednesday: { open: '08:00', close: '00:00' },
            thursday: { open: '08:00', close: '00:00' },
            friday: { open: '08:00', close: '01:00' },
            saturday: { open: '08:00', close: '01:00' },
            sunday: { open: '08:00', close: '00:00' }
        }),
        72,
        'https://www.facebook.com/AlSeniourLibanais/',
        90,
        'Authentic Lebanese cuisine in the heart of Tunis. Al Seniour offers a warm, cozy atmosphere with outdoor seating.'
    );

    // ── Tables ──
    const tables = [
        { number: 1, capacity: 2, location: 'inside', x: 80, y: 80 },
        { number: 2, capacity: 2, location: 'inside', x: 200, y: 80 },
        { number: 3, capacity: 4, location: 'inside', x: 320, y: 80 },
        { number: 4, capacity: 4, location: 'inside', x: 80, y: 200 },
        { number: 5, capacity: 6, location: 'inside', x: 200, y: 200 },
        { number: 6, capacity: 6, location: 'inside', x: 320, y: 200 },
        { number: 7, capacity: 2, location: 'terrace', x: 80, y: 350 },
        { number: 8, capacity: 4, location: 'terrace', x: 200, y: 350 },
        { number: 9, capacity: 4, location: 'terrace', x: 320, y: 350 },
        { number: 10, capacity: 8, location: 'vip', x: 480, y: 80 },
        { number: 11, capacity: 10, location: 'vip', x: 480, y: 200 },
        { number: 12, capacity: 2, location: 'bar', x: 480, y: 350 },
    ];

    for (const t of tables) {
        await db.prepare('INSERT INTO tables (id, table_number, capacity, location, status, pos_x, pos_y) VALUES (?, ?, ?, ?, \'available\', ?, ?)')
            .run(uuidv4(), t.number, t.capacity, t.location, t.x, t.y);
    }

    // ── Sample Customers ──
    const customers = [
        { name: 'Sophie Laurent', email: 'sophie@email.com' },
        { name: 'Marc Dubois', email: 'marc.dubois@email.com' }
    ];

    const customerIds = [];
    for (const c of customers) {
        const id = uuidv4();
        customerIds.push(id);
        await db.prepare('INSERT INTO customers (id, name, email) VALUES (?, ?, ?)').run(id, c.name, c.email);
    }

    console.log(`✅ Seeded: ${tables.length} tables and ${customers.length} customers.`);
}

module.exports = { seedDatabase };
