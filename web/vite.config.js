import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:4175" } },
    fs: { allow: [".."] },
  },
  build: { target: "es2022" },
  test: { include: ["tests/unit/**/*.test.js"], environment: "node" },
});
