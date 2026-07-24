import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the Express backend during development.
      "/api": "http://localhost:3000",
      // Auth endpoints, including the Google OAuth redirect handshake.
      "/auth": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
