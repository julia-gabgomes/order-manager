import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      NODE_ENV: "test",
    },
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
});
