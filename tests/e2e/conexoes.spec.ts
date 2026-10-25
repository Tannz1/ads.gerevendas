import { expect, test } from "@playwright/test";
import { p } from "./paths";

test("conexões em demonstração mostram os 4 passos", async ({ page }) => {
  await page.goto(p("/entrar"));
  await page.getByRole("link", { name: "Entrar em modo demonstração" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(p("/app/conexoes"));
  await expect(page.getByRole("heading", { name: "Conexões Meta" })).toBeVisible();
  for (const title of [
    "1. Conta de anúncios",
    "2. Página e Instagram",
    "3. Convite da Meta",
    "4. Forma de pagamento",
  ]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.getByText("Demonstração", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reservar minha conta de anúncios" })).toHaveCount(0);
});

test("painel do estoque não existe para quem não é operador", async ({ page }) => {
  await page.goto(p("/entrar"));
  await page.getByRole("link", { name: "Entrar em modo demonstração" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(p("/app/operador/estoque"));
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estoque de contas de anúncios" })).toHaveCount(0);
});
