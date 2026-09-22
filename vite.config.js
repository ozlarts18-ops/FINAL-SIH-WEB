import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dotenv from 'dotenv';
import { createApiMiddleware } from './server/apiBridge.js';

dotenv.config();

function localPostgresApiPlugin() {
    return {
        name: 'local-postgres-api-plugin',
        configureServer(server) {
            server.middlewares.use(createApiMiddleware());
        },
        configurePreviewServer(server) {
            server.middlewares.use(createApiMiddleware());
        }
    };
}

export default defineConfig({
    plugins: [
        react(),
        localPostgresApiPlugin()
    ],
    server: {
        allowedHosts: true,
        host: true
    },
    preview: {
        allowedHosts: true,
        host: true
    }
});
