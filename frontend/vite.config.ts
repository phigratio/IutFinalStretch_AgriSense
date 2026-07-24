import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the Express backend during development.
      "/api": process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000",
      // Auth endpoints, including the Google OAuth redirect handshake.
      "/auth": process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000",
      "/health": process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000",
    },
  },
});
