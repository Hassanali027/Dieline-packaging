import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.tsx'],
            ssr: 'resources/js/ssr.jsx',
            refresh: true,
        }),
        react(),
        tailwindcss(),
    ],
    esbuild: {
        jsx: 'automatic',
    },
    build: {
        rollupOptions: {
            output: {
                // Code shared by the editor page and the lazy 3D chunk gets its own chunk.
                // Without this Rollup folds the editor page into a shared chunk and the
                // Vite manifest loses "resources/js/pages/editor.tsx" (500 on /editor).
                manualChunks(id) {
                    const path = id.replace(/\\/g, '/');
                    // lib/three (except materials) stays out, so Three.js only loads with the 3D chunk.
                    const shared = /\/resources\/js\/(lib\/dieline\/|lib\/three\/materials|store\/|types\/)/;
                    if (shared.test(path) || /node_modules\/(clipper2-js|zundo)\//.test(path)) {
                        return 'editor-core';
                    }
                },
            },
        },
    },
});
