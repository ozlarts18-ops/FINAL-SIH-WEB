import dotenv from 'dotenv';
dotenv.config();

import { evaluateAndNotifyMeta } from '../server/metaWhatsappService.js';
import { closeMongo } from '../server/mongoDb.js';

async function testPestUploadAlert() {
    console.log('🐛 Testing Pest Image Upload Alert WhatsApp Dispatch...');
    
    const mockPestAlert = {
        _id: 'alt_test_' + Date.now(),
        alert_type: 'PEST_DETECTED',
        title: 'PEST DETECTED ALERT: GREEN LEAFHOPPER / PLANTHOPPER',
        message: 'Manual verification upload detected 1 x Green Leafhopper / Planthopper (Flatidae) with 96.5% confidence. Action: Apply organic neem oil spray (5ml/L).',
        severity: 'MEDIUM',
        module_name: 'Pest Detection',
        status: 'ACTIVE',
        is_read: false,
        created_at: new Date().toISOString()
    };

    const res = await evaluateAndNotifyMeta('alerts', mockPestAlert);
    console.log('Dispatch Response:', JSON.stringify(res, null, 2));

    await closeMongo();
}

testPestUploadAlert();
