import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 근무 규칙·시간 계산 같은 순수 로직만 검사한다(`npm test`). 화면·DB는 건드리지 않는다.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
