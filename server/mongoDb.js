import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

let client = null;
let dbInstance = null;
let connectionPromise = null;
let isConnected = false;
let lastWarningTime = 0;

function getMongoUri() {
    return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/IOTrex';
}

function getDbName() {
    return process.env.MONGODB_DB_NAME || 'IOTrex';
}

export async function getMongoClient() {
    if (client && isConnected) {
        return client;
    }

    if (connectionPromise) {
        return connectionPromise;
    }

    const uri = getMongoUri();
    const dbName = getDbName();

    if (!client) {
        client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            maxPoolSize: 10,
            minPoolSize: 1,
        });
    }

    connectionPromise = (async () => {
        try {
            await client.connect();
            dbInstance = client.db(dbName);
            isConnected = true;
            console.log(`🍃 Connected to MongoDB: ${dbName}`);
            return client;
        } catch (err) {
            isConnected = false;
            connectionPromise = null;
            const now = Date.now();
            if (now - lastWarningTime > 60000) {
                console.warn(`[MongoDB Notice] Could not connect to database: ${err.message}`);
                lastWarningTime = now;
            }
            throw err;
        }
    })();

    return connectionPromise;
}

export async function getMongoDb() {
    if (dbInstance && isConnected) {
        return dbInstance;
    }
    await getMongoClient();
    return dbInstance;
}

export async function getCollection(collectionName) {
    try {
        const db = await getMongoDb();
        if (!db) return null;
        return db.collection(collectionName);
    } catch (_e) {
        return null;
    }
}

export async function checkMongoHealth() {
    try {
        const mongoClient = await getMongoClient();
        const dbName = getDbName();
        const adminDb = mongoClient.db(dbName).admin();
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
        try {
            await client.close();
        } catch (_e) {}
        client = null;
        dbInstance = null;
        connectionPromise = null;
        isConnected = false;
    }
}

