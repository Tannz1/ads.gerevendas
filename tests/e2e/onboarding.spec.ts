import { expect, test, type Page } from "@playwright/test";
import { p } from "./paths";

async function startDemo(page: Page) {
  await page.goto(p("/entrar"));
  await page.getByRole("link", { name: "Entrar em modo demonstração" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Modo demonstração.")).toBeVisible();
}

const cont = (page: Page) => page.getByRole("button", { name: "Continuar", exact: true }).click();

test("fluxo completo do onboarding em modo demonstração", async ({ page }) => {
  await startDemo(page);
  await page.getByRole("link", { name: "Começar cadastro" }).click();
  await expect(page.getByRole("heading", { name: "Seu negócio" })).toBeVisible();

  // Validação: não avança com campos vazios.
  await cont(page);
  await expect(page.getByText("Escolha o estado")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seu negócio" })).toBeVisible();

  await page.getByLabel("Nome do negócio").fill("Padaria Exemplo");
  await page.getByLabel("Segmento").fill("Alimentação");
  await page.getByLabel("Cidade").fill("Campinas");
  await page.getByLabel("Estado").selectOption("SP");
  await page.getByLabel(/WhatsApp/).fill("19999990000");
  await cont(page);

  await expect(page.getByRole("heading", { name: "O que você vende" })).toBeVisible();
  await page.getByLabel("Produto ou serviço").fill("Café da manhã completo");
  await page.getByLabel("Descreva em poucas linhas").fill("Pão na chapa, café e suco natural.");
  await page.getByText("Mostrar preço", { exact: true }).click();
  await page.getByLabel("Preço", { exact: true }).fill("24,90");
  await cont(page);
  await expect(page.getByText("Confirme que o preço é real e está vigente")).toBeVisible();
  await page.getByLabel("Confirmo que este preço é real e está valendo hoje.").check();
  await cont(page);

  await expect(page.getByRole("heading", { name: "Quem compra" })).toBeVisible();
  await page.getByLabel("Quem são seus clientes").fill("Moradores e trabalhadores do bairro");

  // Autosave: recarregar mantém a etapa e os dados.
  await expect(page.getByText("Salvo neste navegador")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Quem compra" })).toBeVisible();
  await expect(page.getByLabel("Quem são seus clientes")).toHaveValue("Moradores e trabalhadores do bairro");
  await cont(page);

  await expect(page.getByRole("heading", { name: "Objetivo" })).toBeVisible();
  await page.getByText("Receber mensagens no WhatsApp").click();
  await cont(page);

  await expect(page.getByRole("heading", { name: "Identidade" })).toBeVisible();
  await page.getByText("Acolhedor").click();
  await cont(page);

  await expect(page.getByRole("heading", { name: "Revisão" })).toBeVisible();
  await expect(page.getByText("R$ 24,90", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Concluir cadastro" }).click();
  await expect(page.getByText("Confirme que as informações são verdadeiras")).toBeVisible();

  await page.getByLabel(/Confirmo que as informações acima são verdadeiras/).check();
  await page.getByRole("button", { name: "Concluir cadastro" }).click();
  await expect(page.getByRole("heading", { name: "Cadastro concluído" })).toBeVisible();
  await expect(page.getByText("Simulação")).toBeVisible();

  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await expect(page.getByText("Concluído", { exact: true })).toBeVisible();
});

test("objetivo exige o canal correspondente", async ({ page }) => {
  await startDemo(page);
  await page.goto(p("/app/onboarding"));
  await page.evaluate(() => {
    localStorage.setItem(
      "gv-ads:onboarding:v1",
      JSON.stringify({
        step: 6,
        completed: false,
        data: {
          business: {
            name: "Loja",
            segment: "Moda",
            city: "Recife",
            state: "PE",
            whatsapp: "",
            instagram_handle: "",
            website_url: "",
          },
          offer: {
            name: "Camisetas",
            description: "Camisetas de algodão estampadas",
            show_price: false,
            price: "",
            price_confirmed_by_client: false,
            differentiators: ["", "", ""],
          },
          audience: { description: "Jovens adultos da cidade", age_min: "18", age_max: "35", service_radius_km: "" },
          goal: { objective: "visitas_perfil" },
          identity: { brand_primary_color: "#2A45E8", tone_of_voice: "divertido" },
          review: { facts_confirmed: true },
        },
      }),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "Concluir cadastro" }).click();
  await expect(page.getByRole("heading", { name: "Seu negócio" })).toBeVisible();
  await expect(page.getByText("Para esse objetivo, informe o Instagram na etapa 1")).toBeVisible();
});

test("criativos no modo demonstração avisam que exigem conta", async ({ page }) => {
  await startDemo(page);
  await page.goto(p("/app/criativos"));
  await expect(page.getByRole("heading", { name: "Faça login para criar anúncios" })).toBeVisible();
});
