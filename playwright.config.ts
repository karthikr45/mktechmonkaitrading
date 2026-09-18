import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3100" },
  webServer: [
    {
      command:
        "PORT=4100 WEB_ORIGIN=http://127.0.0.1:3100 pnpm --filter @mk/api exec tsx src/main.ts",
      url: "http://127.0.0.1:4100/v1/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command:
        "API_URL=http://127.0.0.1:4100 NEXT_DIST_DIR=.next-test pnpm --filter @mk/web exec next build && NEXT_DIST_DIR=.next-test pnpm --filter @mk/web exec next start --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
