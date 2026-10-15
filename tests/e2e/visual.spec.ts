import { expect, test } from "@playwright/test";

const WIDTHS = [1440, 1024, 768, 390, 360];
const ROUTES = [
  { path: "/", name: "landing" },
  { path: "/entrar", name: "entrar" },
  { path: "/app", name: "inicio" },
  { path: "/app/onboarding", name: "onboarding" },
  { path: "/app/conta", name: "conta" },
];

test.describe("responsividade", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "roda uma vez, no projeto desktop"));

  for (const route of ROUTES) {
    test(`${route.name}: sem rolagem horizontal e com screenshot`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route.path);
        await page.waitForLoadState("networkidle");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${route.path} @ ${width}px`).toBeLessThanOrEqual(0);
        await page.screenshot({ path: `test-results/screenshots/${route.name}-${width}.png`, fullPage: true });
      }
    });
  }
});

test("navegação por teclado alcança o CTA principal", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (name === "Quero participar do piloto") return;
  }
  throw new Error("CTA principal não recebeu foco em 8 tabs");
});
