import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base задає CI: `vite build --base=/experimental/` для experimental, `/` для main.
export default defineConfig({
  plugins: [react()],
});
