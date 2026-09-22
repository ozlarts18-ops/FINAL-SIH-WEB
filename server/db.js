import pg from 'pg';

const LOCAL_PG_URI = process.env.PGSQL_MCP_CONNECTION_STRING || 'postgresql://postgres:ossie%40123%24@localhost:4000/IOTrex';

export const pool = new pg.Pool({
    connectionString: LOCAL_PG_URI,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
});

export const query = async (text, params) => {
    return await pool.query(text, params);
};

export const checkPgHealth = async () => {
    try {
        const res = await pool.query('SELECT 1 AS ok');
        return { status: 'healthy', ok: res.rows[0].ok === 1 };
    } catch (err) {
        return { status: 'unhealthy', error: err.message };
    }
};
