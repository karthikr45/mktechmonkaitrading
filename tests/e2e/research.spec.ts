import { test, expect } from "@playwright/test";

test("client workspace contains research tools and no synthetic trading dashboard", async ({
  page,
}) => {
  const dashboardRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/dashboard"))
      dashboardRequests.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Charts & indicators", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New paper order" }),
  ).toHaveCount(0);
  await expect(page.getByText("Available paper funds")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Charts & indicators", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Charts & indicators", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Trade journal", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save journal note" }),
  ).toBeVisible();
  expect(dashboardRequests).toEqual([]);
});
