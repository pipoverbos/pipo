import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.js"],
    // Los tests de punta a punta juegan niveles enteros sobre jsdom: pueden tardar varios segundos.
    testTimeout: 30000,
  },
});
