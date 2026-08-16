import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // 与 wrangler dev 本地 R2 行为对齐：让 fetch/request 走 Workers 兼容实现
    environment: "node",
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/static/**"],
      reporter: ["text", "html"],
    },
  },
});
