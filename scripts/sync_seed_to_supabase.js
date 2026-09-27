import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const LOCAL_PG_URI = process.env.PGSQL_MCP_CONNECTION_STRING || 'postgresql://postgres:ossie%40123%24@localhost:4000/IOTrex';
const SUPABASE_URL = 'https://cuszmxwcvujmlsskiqby.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1c3pteHdjdnVqbWxzc2tpcWJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxODg0MjYsImV4cCI6MjEwMzc2NDQyNn0.MfYf96SHno-WgOpScgA6DKRAbWSq-RpaS7lIf0x8S5I';

const pool = new pg.Pool({ connectionString: LOCAL_PG_URI });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function syncSeedToSupabase() {
    console.log('🔄 Checking Supabase mirror parity...');
    const client = await pool.connect();

    try {
        const localDevs = await client.query('SELECT * FROM devices');
        for (const dev of localDevs.rows) {
            const { data: existing } = await supabase.from('devices').select('device_id').eq('device_uid', dev.device_uid).maybeSingle();
            if (!existing) {
                const { error } = await supabase.from('devices').insert([dev]);
                if (error) console.warn('Sync device error:', error.message);
                else console.log(` synced device ${dev.device_uid} to Supabase`);
            }
        }

        const { count: airSupabaseCount } = await supabase.from('air_quality_logs').select('*', { count: 'exact', head: true });
        if (!airSupabaseCount || airSupabaseCount === 0) {
            const localAir = await client.query('SELECT * FROM air_quality_logs');
            const records = localAir.rows.map(({ log_id: _log_id, ...rest }) => rest);
            const { error } = await supabase.from('air_quality_logs').insert(records);
            if (error) console.warn('Sync air logs error:', error.message);
            else console.log(` synced ${records.length} air logs to Supabase`);
        }

        const { count: waterSupabaseCount } = await supabase.from('water_quality_logs').select('*', { count: 'exact', head: true });
        if (!waterSupabaseCount || waterSupabaseCount === 0) {
            const localWater = await client.query('SELECT * FROM water_quality_logs');
            const records = localWater.rows.map(({ log_id: _log_id, ...rest }) => rest);
            const { error } = await supabase.from('water_quality_logs').insert(records);
            if (error) console.warn('Sync water logs error:', error.message);
            else console.log(` synced ${records.length} water logs to Supabase`);
        }

        const { count: soilSupabaseCount } = await supabase.from('soil_moisture_logs').select('*', { count: 'exact', head: true });
        if (!soilSupabaseCount || soilSupabaseCount === 0) {
            const localSoil = await client.query('SELECT * FROM soil_moisture_logs');
            const records = localSoil.rows.map(({ log_id: _log_id, ...rest }) => rest);
            const { error } = await supabase.from('soil_moisture_logs').insert(records);
            if (error) console.warn('Sync soil logs error:', error.message);
            else console.log(` synced ${records.length} soil logs to Supabase`);
        }

        const { count: lightSupabaseCount } = await supabase.from('light_intensity_logs').select('*', { count: 'exact', head: true });
        if (!lightSupabaseCount || lightSupabaseCount === 0) {
            const localLight = await client.query('SELECT * FROM light_intensity_logs');
            const records = localLight.rows.map(({ log_id: _log_id, ...rest }) => rest);
            const { error } = await supabase.from('light_intensity_logs').insert(records);
            if (error) console.warn('Sync light logs error:', error.message);
            else console.log(` synced ${records.length} light logs to Supabase`);
        }

        const { count: plantSupabaseCount } = await supabase.from('plant_growth_logs').select('*', { count: 'exact', head: true });
        if (!plantSupabaseCount || plantSupabaseCount === 0) {
            const localPlant = await client.query('SELECT * FROM plant_growth_logs');
            const records = localPlant.rows.map(({ log_id: _log_id, ...rest }) => rest);
            const { error } = await supabase.from('plant_growth_logs').insert(records);
            if (error) console.warn('Sync plant logs error:', error.message);
            else console.log(` synced ${records.length} plant logs to Supabase`);
        }

        const { count: pestSupabaseCount } = await supabase.from('pest_detection_logs').select('*', { count: 'exact', head: true });
        if (!pestSupabaseCount || pestSupabaseCount === 0) {
            const localPest = await client.query('SELECT * FROM pest_detection_logs');
            const records = localPest.rows.map(({ pest_log_id: _pest_log_id, ...rest }) => rest);
            const { error } = await supabase.from('pest_detection_logs').insert(records);
            if (error) console.warn('Sync pest logs error:', error.message);
            else console.log(` synced ${records.length} pest logs to Supabase`);
        }

        const { count: eventsCount } = await supabase.from('system_events').select('*', { count: 'exact', head: true });
        if (!eventsCount || eventsCount === 0) {
            const localEvents = await client.query('SELECT * FROM system_events');
            const records = localEvents.rows.map(({ event_id: _event_id, ...rest }) => rest);
            await supabase.from('system_events').insert(records);
            console.log(` synced ${records.length} events to Supabase`);
        }

        const { count: recsCount } = await supabase.from('recommendations_intelligence').select('*', { count: 'exact', head: true });
        if (!recsCount || recsCount === 0) {
            const localRecs = await client.query('SELECT * FROM recommendations_intelligence');
            const records = localRecs.rows.map(({ recommendation_id: _recommendation_id, ...rest }) => rest);
            await supabase.from('recommendations_intelligence').insert(records);
            console.log(` synced ${records.length} recommendations to Supabase`);
        }

        console.log('✅ Baseline sync check complete!');
    } catch (err) {
        console.warn('Sync check warning:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

syncSeedToSupabase();
