import dotenv from 'dotenv';
import { getMongoClient, getMongoDb, checkMongoHealth, closeMongo } from '../server/mongoDb.js';

dotenv.config();

async function testMongoConnection() {
    console.log('\n==================================================');
    console.log('🍃 ENVIROX MONGODB CONNECTION DIAGNOSTIC');
    console.log('==================================================\n');

    const uriPresent = Boolean(process.env.MONGODB_URI);
    const _dbNamePresent = Boolean(process.env.MONGODB_DB_NAME);

    console.log(`MongoDB URI configured: ${uriPresent ? 'YES' : 'NO'}`);
    console.log(`MongoDB database configured: ${process.env.MONGODB_DB_NAME || 'IOTrex'}`);

    if (!uriPresent) {
        console.error('❌ MONGODB_URI is missing from environment.');
        process.exit(1);
    }

    try {
        console.log('\nAttempting MongoDB connection...');
        const _client = await getMongoClient();
        console.log('TCP/connection: PASS');

        const db = await getMongoDb();
        console.log(`Database access: PASS (${db.databaseName})`);

        const health = await checkMongoHealth();
        console.log(`MongoDB ping: ${health.status === 'connected' ? 'PASS' : 'FAIL (' + health.error + ')'}`);

        if (health.status === 'connected') {
            const collections = await db.listCollections().toArray();
            console.log(`Collections access: PASS (${collections.length} collections found)`);
            console.log('Collections:', collections.map(c => c.name).join(', '));
        }

        await closeMongo();
        console.log('\n==================================================');
        console.log('✅ MONGODB CONNECTION DIAGNOSTIC COMPLETED SUCCESSFULLY');
        console.log('==================================================\n');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ MONGODB CONNECTION DIAGNOSTIC FAILED');
        console.error('Error message:', err.message);

        if (err.message.includes('Server selection timed out') || err.message.includes('querySrv ETIMEOUT') || err.message.includes('ECONNREFUSED')) {
            console.error('\n🔍 CAUSE DIAGNOSIS: Network / DNS / Atlas IP Access Issue');
            console.error('1. If using MongoDB Atlas: Ensure your current IP address is whitelisted in MongoDB Atlas Network Access.');
            console.error('2. If using local MongoDB: Ensure the mongod service is running locally on mongodb://127.0.0.1:27017.');
        }

        process.exit(1);
    }
}

testMongoConnection();
