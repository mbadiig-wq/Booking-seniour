const db = require('./index');
const { seedDatabase } = require('./seed');

async function initializeDatabase() {
  // Schema creation - compatible with both
  // Note: In a real production app, we'd use migrations (e.g., Knex or Drizzle)
  const schema = `
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      table_number INTEGER UNIQUE NOT NULL,
      capacity INTEGER NOT NULL,
      location TEXT DEFAULT 'inside',
      status TEXT DEFAULT 'available',
      pos_x REAL DEFAULT 0,
      pos_y REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      table_id TEXT,
      reservation_date TEXT NOT NULL,
      reservation_time TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      special_requests TEXT,
      status TEXT DEFAULT 'confirmed',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS restaurant_info (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      operating_hours TEXT,
      total_capacity INTEGER DEFAULT 0,
      menu_url TEXT,
      turnover_minutes INTEGER DEFAULT 90,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      party_size INTEGER NOT NULL,
      estimated_wait INTEGER DEFAULT 30,
      status TEXT DEFAULT 'waiting',
      notes TEXT,
      added_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  try {
    if (process.env.NODE_ENV === 'production') {
      await db.exec(schema);
    } else {
      // SQLite specific pragmas are handled in index.js wrapper if needed
      await db.exec(schema.replace(/TIMESTAMPTZ DEFAULT NOW\(\)/g, "TEXT DEFAULT (datetime('now'))"));
    }

    // Seed if empty
    const result = await db.prepare('SELECT COUNT(*) as count FROM tables').get();
    if (parseInt(result.count) === 0) {
      console.log('🌱 Database is empty, seeding...');
      await seedDatabase(db);
    }

    return db;
  } catch (err) {
    console.error('❌ Database initialization failed:', err);
    throw err;
  }
}

function getDb() {
  return db;
}

function closeDb() {
  // Closing handled by pool/process in production
}

module.exports = { initializeDatabase, getDb, closeDb };
