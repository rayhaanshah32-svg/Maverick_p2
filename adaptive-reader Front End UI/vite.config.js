import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow serving files from the sibling CV folder
      allow: [
        path.resolve(__dirname, '..'),
      ],
    },
  },
  // Expose the CV pipeline folder as /cv/ static asset alias
  publicDir: false,
  assetsInclude: ['**/*.data', '**/*.wasm'],
  resolve: {
    alias: {},
  },
  // Custom middleware to serve /cv/ → adaptive-reader-cv/
  plugins: [
    react(),
    {
      name: 'serve-cv-pipeline',
      configureServer(server) {
        server.middlewares.use('/cv', async (req, res, next) => {
          // Rewrite /cv/... requests to ../adaptive-reader-cv/...
          const cvRoot = path.resolve(__dirname, '../adaptive-reader-cv');
          const fsPath = path.join(cvRoot, req.url);
          const fs = await import('fs');
          if (fs.existsSync(fsPath) && fs.statSync(fsPath).isFile()) {
            const ext = path.extname(fsPath).toLowerCase();
            const mime = {
              '.js': 'application/javascript',
              '.mjs': 'application/javascript',
              '.wasm': 'application/wasm',
              '.data': 'application/octet-stream',
              '.css': 'text/css',
              '.html': 'text/html',
            }[ext] || 'application/octet-stream';
            res.setHeader('Content-Type', mime);
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            fs.createReadStream(fsPath).pipe(res);
          } else {
            next();
          }
        });
      },
    },
  ],
})
