import process from "node:process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Після основної збірки (CI викликає `vite build --base=...`) збираємо ще й сервер кімнат у <outDir>/server/rooms.mjs,
// щоб він їхав у тому самому релізі, що й гра. Конфіг сервера окремий: vite.server.config.ts.
function roomsServer(): Plugin {
  let outDir = "dist";
  return {
    name: "hryah-rooms-server",
    apply: "build",
    configResolved(config) { outDir = config.build.outDir; },
    async closeBundle() {
      if (process.env["HRYAH_SKIP_SERVER"]) return;
      const { build } = await import("vite");
      // outDir береться з основної збірки, тож `--outDir` на кшталт dist-x кладе сервер поруч, а не в dist/server.
      await build({ configFile: "vite.server.config.ts", logLevel: "warn", build: { outDir: `${outDir}/server` } });
    },
  };
}

// base задає CI: `vite build --base=/experimental/` для experimental, `/` для main.
export default defineConfig({
  plugins: [react(), roomsServer()],
  // Локально сервер кімнат: `npm run rooms` (порт 8090).
  server: { proxy: { "/api": "http://127.0.0.1:8090" } },
});
