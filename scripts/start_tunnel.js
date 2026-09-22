import { spawn } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

console.log('⏳ Starting Cloudflare Tunnel for Meta WhatsApp Webhooks (http://localhost:5173)...');

const isWindows = process.platform === 'win32';
const cloudflared = spawn(isWindows ? 'npx.cmd' : 'npx', ['-y', 'cloudflared', 'tunnel', '--url', 'http://localhost:5173'], {
    stdio: ['inherit', 'pipe', 'pipe']
});

let tunnelUrl = '';

function checkOutput(data) {
    const text = data.toString();
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !tunnelUrl) {
        tunnelUrl = match[0];
        console.log('\n======================================================');
        console.log(`🌐 CLOUDFLARE PUBLIC TUNNEL ONLINE: ${tunnelUrl}`);
        console.log(`📋 META CALLBACK URL:               ${tunnelUrl}/api/webhook/whatsapp`);
        console.log(`🔑 META VERIFY TOKEN:               ${process.env.META_WEBHOOK_VERIFY_TOKEN || 'iotrex_verify_token_123'}`);
        console.log('======================================================\n');
        console.log('🟢 Webhook tunnel is live and forwarding to local Vite/API server.');
    }
}

cloudflared.stdout.on('data', checkOutput);
cloudflared.stderr.on('data', checkOutput);

cloudflared.on('close', (code) => {
    console.log(`Tunnel process exited with code ${code}`);
});

process.on('SIGINT', () => {
    cloudflared.kill('SIGINT');
    process.exit();
});

