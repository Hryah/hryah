import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'portable-html-line-endings',
    // Vite's script-tag removal can leave a blank line with CRLF input.
    // Normalize before that transform so Windows and LF checkouts build the same HTML.
    transformIndexHtml: { order: 'pre', handler: (html) => html.replace(/\r\n?/g, '\n') },
  }],
  base: './',
  publicDir: './generated',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5179,
  },
});
