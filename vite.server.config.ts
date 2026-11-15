import { defineConfig } from "vite";

// Збірка сервера кімнат одним файлом dist/server/rooms.mjs (без залежностей, цільовий Node 20).
// Запускається після основної збірки, тож emptyOutDir вимкнено.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: "server/main.ts",
    outDir: "dist/server",
    emptyOutDir: false,
    target: "node20",
    rollupOptions: { output: { entryFileNames: "rooms.mjs", format: "es" } },
  },
  ssr: { noExternal: true },
});
