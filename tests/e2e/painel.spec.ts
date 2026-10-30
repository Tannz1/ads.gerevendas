import { expect, test } from "@playwright/test";
import { p } from "./paths";

test("painel em demonstração não inventa conta nem métricas", async ({ page }) => {
  await page.goto(p("/app/painel"));
  await expect(page.getByRole("heading", { name: "Resultados", exact: true })).toBeVisible();
  // Sem campanhas, nenhum número inventado.
  await expect(page.getByText("R$", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Nenhuma campanha ainda")).toBeVisible();
  await expect(page.getByRole("button", { name: "Atualizar métricas da Meta" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Nova campanha", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `test-results/screenshots/painel-${test.info().project.name}.png`, fullPage: true });
});

test("acesso direto a campanha de outra empresa não expõe detalhes em demonstração", async ({ page }) => {
  await page.goto(p("/app/campanhas/00000000-0000-4000-8000-000000000001"));
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await expect(page.getByRole("button", { name: /ativar/i })).toHaveCount(0);
});
