import { expect, test } from "@playwright/test";
import { p } from "./paths";

test("landing mostra proposta, preço e mídia à parte", async ({ page }) => {
  await page.goto(p("/"));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Anúncios para o seu negócio");
  await expect(page.locator("#preco")).toContainText("R$ 199");
  await expect(page.locator("#preco")).toContainText("paga diretamente à Meta");
  await expect(page.getByText("Exemplo ilustrativo")).toBeVisible();
});

test("CTA leva ao login", async ({ page }) => {
  await page.goto(p("/"));
  await page.getByRole("link", { name: "Quero participar do piloto" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});
