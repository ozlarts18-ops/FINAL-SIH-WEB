import http from 'http';
import { createApiMiddleware } from './apiBridge.js';

const PORT = process.env.PORT || 5000;
const apiMiddleware = createApiMiddleware();

const server = http.createServer((req, res) => {
    apiMiddleware(req, res, () => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Not found' }));
    });
});

server.listen(PORT, () => {
    console.log(`🌐 Local Database API Bridge server running on http://localhost:${PORT}`);
    console.log(`📡 Primary Storage (Local PostgreSQL): localhost:4000/IOTrex`);
    console.log(`🍃 Secondary Mirror (MongoDB): localhost:27017/IOTrex`);
});
