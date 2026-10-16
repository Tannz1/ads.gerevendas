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

test("rota inexistente mostra 404 em português", async ({ page }) => {
  const res = await page.goto(p("/nao-existe"));
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Anúncios para o seu negócio");
});
