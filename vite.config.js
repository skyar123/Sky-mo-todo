import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* The shared board lives behind a Netlify Function, which vite does not serve.
   Locally the requests go to `netlify dev`, or to tests/api-stub.mjs, which
   speaks the same contract. This only affects the dev and preview servers;
   the built output is unchanged. */
const apiTarget = process.env.SKYMO_API_TARGET || `http://localhost:${process.env.API_PORT || 4174}`;
const proxy = { "/api": { target: apiTarget, changeOrigin: true } };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  build: {
    target: "es2020",
    sourcemap: false, // the bundle ships to a public URL; keep the source out of it
  },
});
