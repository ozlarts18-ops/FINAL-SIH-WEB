/**
 * DEPRECATED POSTGRESQL DRIVER STUB
 * EnviroX has been migrated to MongoDB (Primary DB) + Redis (Fast Cache).
 * This module is kept for safety and backward compatibility checks.
 */

export const pool = {
    query: async () => {
        throw new Error('PostgreSQL has been fully decommissioned. Use MongoDB + Redis (syncEngine.js / mongoDb.js).');
    },
    on: () => {},
    end: async () => {}
};

export const query = async () => {
    throw new Error('PostgreSQL has been fully decommissioned. Use MongoDB + Redis (syncEngine.js / mongoDb.js).');
};

export const checkPgHealth = async () => {
    return { status: 'decommissioned', message: 'Migrated to MongoDB (Primary) + Redis (Fast Cache)' };
};
