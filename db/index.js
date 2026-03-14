const isProd = process.env.NODE_ENV === 'production';
const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

let db;
let pool;

if (isProd) {
    console.log('🐘 Connecting to PostgreSQL...');
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required for most cloud DBs like Supabase/Heroku
    });

    db = {
        prepare: (sql) => ({
            get: async (...params) => {
                const querySql = sql.replace(/\?/g, (_, i) => `$${i + 1}`);
                try {
                    const res = await pool.query(querySql, params);
                    return res.rows[0];
                } catch (err) {
                    console.error('❌ PG Query Error (get):', { sql: querySql, params, error: err.message, code: err.code });
                    throw err;
                }
            },
            all: async (...params) => {
                const querySql = sql.replace(/\?/g, (_, i) => `$${i + 1}`);
                try {
                    const res = await pool.query(querySql, params);
                    return res.rows;
                } catch (err) {
                    console.error('❌ PG Query Error (all):', { sql: querySql, params, error: err.message, code: err.code });
                    throw err;
                }
            },
            run: async (...params) => {
                const querySql = sql.replace(/\?/g, (_, i) => `$${i + 1}`);
                try {
                    const res = await pool.query(querySql, params);
                    return { lastInsertRowid: res.rows[0]?.id || null, changes: res.rowCount };
                } catch (err) {
                    console.error('❌ PG Query Error (run):', { sql: querySql, params, error: err.message, code: err.code });
                    throw err;
                }
            }
        }),
        exec: async (sql) => {
            return await pool.query(sql);
        },
        transaction: (fn) => async (...args) => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await fn(client)(...args);
                await client.query('COMMIT');
                return result;
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }
        }
    };
} else {
    console.log('🐚 Connecting to SQLite...');
    const sqlite = new Database(path.join(__dirname, '..', 'restaurant.db'));

    // Wrapper to match PostgreSQL's async interface and some basic compatibility
    db = {
        prepare: (sql) => ({
            get: async (...params) => sqlite.prepare(sql).get(...params),
            all: async (...params) => sqlite.prepare(sql).all(...params),
            run: async (...params) => sqlite.prepare(sql).run(...params)
        }),
        exec: async (sql) => sqlite.exec(sql),
        transaction: (fn) => (...args) => sqlite.transaction(fn(...args))()
    };
}

module.exports = db;
