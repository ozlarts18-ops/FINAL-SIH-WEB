import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

let client = null;
let dbInstance = null;
let isConnecting = false;
let lastWarningTime = 0;

function getMongoUri() {
    return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/IOTrex';
}

function getDbName() {
    return process.env.MONGODB_DB_NAME || 'IOTrex';
}

export async function getMongoClient() {
    if (client && client.topology && client.topology.isConnected()) {
        return client;
    }

    const uri = getMongoUri();
    const dbName = getDbName();

    if (!client) {
        client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 3000,
            connectTimeoutMS: 4000,
            socketTimeoutMS: 5000,
            maxPoolSize: 10,
            minPoolSize: 1,
        });
    }

    if (!isConnecting) {
        isConnecting = true;
        try {
            await client.connect();
            dbInstance = client.db(dbName);
            console.log(`🍃 Connected to MongoDB: ${dbName}`);
        } catch (err) {
            const now = Date.now();
            if (now - lastWarningTime > 60000) {
                console.warn(`[MongoDB Notice] Could not connect to database:`, err.message);
                lastWarningTime = now;
            }
            throw err;
        } finally {
            isConnecting = false;
        }
    }

    return client;
}

export async function getMongoDb() {
    if (!dbInstance) {
        await getMongoClient();
    }
    return dbInstance;
}

export async function getCollection(collectionName) {
    const db = await getMongoDb();
    return db.collection(collectionName);
}

export async function checkMongoHealth() {
    try {
        const client = await getMongoClient();
        const dbName = getDbName();
        const adminDb = client.db(dbName).admin();
        const ping = await adminDb.ping();
        return {
            status: 'connected',
            database: dbName,
            ping: ping.ok === 1 ? 'ok' : 'unknown'
        };
    } catch (err) {
        return {
            status: 'disconnected',
            database: getDbName(),
            error: err.message
        };
    }
}

export async function closeMongo() {
    if (client) {
        await client.close();
        client = null;
        dbInstance = null;
    }
}
