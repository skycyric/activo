import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test-setup.ts"],
    environmentMatchGlobs: [
      // Component tests (.test.tsx) run under jsdom
      ["src/**/*.test.tsx", "jsdom"],
    ],
  },
});
