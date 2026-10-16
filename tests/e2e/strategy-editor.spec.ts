import { expect, test, type Page } from "@playwright/test";
import { p } from "./paths";

/** Onboarding concluído (modo demonstração), no mesmo formato que o assistente grava. */
function completedOnboarding({ withPrice }: { withPrice: boolean }) {
  return {
    step: 6,
    completed: true,
    data: {
      business: {
        name: "Padaria Exemplo",
        segment: "Alimentação",
        city: "Campinas",
        state: "SP",
        whatsapp: "(19) 99999-0000",
        instagram_handle: "",
        website_url: "",
      },
      offer: {
        name: "Café da manhã completo",
        description: "Pão na chapa, café coado e suco natural feitos na hora.",
        show_price: withPrice,
        price: withPrice ? "24,90" : "",
        price_confirmed_by_client: withPrice,
        differentiators: ["Pão saindo do forno toda manhã", "", ""],
      },
      audience: {
        description: "Moradores e trabalhadores do bairro",
        age_min: "25",
        age_max: "55",
        service_radius_km: "",
      },
      goal: { objective: "mensagens_whatsapp" },
      identity: { brand_primary_color: "#C2410C", tone_of_voice: "acolhedor" },
      review: { facts_confirmed: true },
    },
  };
}

async function seed(page: Page, withPrice: boolean) {
  await page.goto(p("/app"));
  await page.evaluate((draft) => {
    localStorage.clear();
    localStorage.setItem("gv-ads:onboarding:v1", JSON.stringify(draft));
  }, completedOnboarding({ withPrice }));
}

async function generateStrategy(page: Page) {
  await page.goto(p("/app/estrategia"));
  await page.getByRole("button", { name: /Gerar estratégia/ }).click();
  await expect(page.getByRole("heading", { name: "Conceitos de anúncio" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Simulação", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Conteúdo de exemplo gerado sem IA real/)).toBeVisible();
  const cards = page.getByRole("article");
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  return cards;
}

test("estratégia simulada vira peça editável, exportada e aprovada", async ({ page }) => {
  test.setTimeout(90_000);
  await seed(page, true);
  const cards = await generateStrategy(page);
  await expect(page.getByText("Versão 1 · gerada em")).toBeVisible();

  await cards.first().getByRole("button", { name: "Feed 4:5" }).click();
  await expect(page).toHaveURL(/\/app\/criativos\/demo-[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Editar peça" })).toBeVisible();
  await expect(page.getByText("Rascunho", { exact: true })).toBeVisible();
  await expect(page.getByText("Aprovar não publica nada. A publicação na Meta chega numa próxima fase.")).toBeVisible();

  // Título editado aparece na prévia (descrição acessível da arte).
  await page.getByLabel("Título", { exact: true }).fill("Café quentinho no bairro");
  const preview = page.getByRole("img", { name: /^Prévia da peça/ });
  await expect(preview).toHaveAttribute("aria-label", /Café quentinho no bairro/);
  await expect(page.getByText("Salvo", { exact: true })).toBeVisible();

  // Troca de formato salva automaticamente.
  await page.locator("label", { hasText: "Stories 9:16" }).click();
  await expect(page.getByRole("radio", { name: "Stories 9:16" })).toBeChecked();
  await expect(preview).toHaveAttribute("aria-label", /Stories 9:16/);
  await expect(page.getByText("Salvo", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PNG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^gerevendas-.+\.png$/);

  await page.getByRole("button", { name: "Aprovar peça" }).click();
  await expect(page.getByText("Aprovada", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Aprovada em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "Criativos" }).click();
  await expect(page.getByRole("heading", { name: "Criativos", level: 1 })).toBeVisible();
  const card = page.getByRole("link", { name: /Café quentinho no bairro/ });
  await expect(card).toContainText("Aprovada");
  await expect(card).toContainText("Stories 9:16");

  // Editar de novo volta a peça para rascunho.
  await card.click();
  await expect(page.getByRole("heading", { name: "Editar peça" })).toBeVisible();
  await expect(page.getByText("Aprovada", { exact: true }).first()).toBeVisible();
  await page.getByLabel("Título", { exact: true }).fill("Café quentinho perto de você");
  await expect(page.getByText("Rascunho", { exact: true })).toBeVisible();
  await expect(page.getByText("Salvo", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aprovar peça" })).toBeEnabled();

  // Rotas ficam preservadas (Activity): ao voltar à estratégia, os botões não ficam presos em "Criando…".
  await page.getByRole("main").getByRole("link", { name: "Criativos" }).click();
  await expect(page.getByRole("link", { name: /Café quentinho perto de você/ })).toContainText("Rascunho");
  await page.getByRole("link", { name: "Criar a partir da estratégia" }).click();
  await expect(page.getByRole("heading", { name: "Conceitos de anúncio" })).toBeVisible();
  await expect(page.getByRole("article").first().getByRole("button", { name: "Feed 4:5" })).toBeEnabled();
});

test("oferta sem preço: nenhum conceito ou peça mostra preço e o seletor fica bloqueado", async ({ page }) => {
  test.setTimeout(60_000);
  await seed(page, false);
  const cards = await generateStrategy(page);

  const previews = page.getByRole("img", { name: /^Prévia da peça/ });
  await expect(previews).toHaveCount(await cards.count());
  for (const label of await previews.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""))) {
    expect(label).not.toContain("Preço");
  }
  await expect(page.getByRole("main")).not.toContainText("R$");

  await cards.first().getByRole("button", { name: "Stories 9:16" }).click();
  await expect(page.getByRole("heading", { name: "Editar peça" })).toBeVisible();
  const toggle = page.getByRole("switch", { name: /Mostrar preço/ });
  await expect(toggle).toBeDisabled();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText("A oferta não tem preço confirmado no cadastro")).toBeVisible();
  await expect(page.getByRole("img", { name: /^Prévia da peça/ })).not.toHaveAttribute("aria-label", /Preço/);
  await expect(page.getByRole("main")).not.toContainText("R$");
});

test("recomeçar a demonstração apaga a estratégia e as peças simuladas", async ({ page }) => {
  await seed(page, true);
  const cards = await generateStrategy(page);
  await cards.first().getByRole("button", { name: "Feed 4:5" }).click();
  await expect(page.getByRole("heading", { name: "Editar peça" })).toBeVisible();

  await page.goto(p("/app/onboarding"));
  await page.getByRole("button", { name: "Recomeçar demonstração" }).click();
  await expect(page.getByRole("heading", { name: "Seu negócio" })).toBeVisible();
  expect(
    await page.evaluate(() => [
      localStorage.getItem("gv-ads:strategy:v1"),
      localStorage.getItem("gv-ads:creatives:v1"),
    ]),
  ).toEqual([null, null]);

  await page.goto(p("/app/criativos"));
  await expect(page.getByRole("heading", { name: "Nenhuma peça ainda" })).toBeVisible();
});

test("estratégia sem cadastro concluído mostra o caminho para o cadastro", async ({ page }) => {
  await page.goto(p("/app"));
  await page.evaluate(() => localStorage.clear());
  await page.goto(p("/app/estrategia"));
  await expect(page.getByRole("heading", { name: "Primeiro, conte sobre o seu negócio" })).toBeVisible();
  await page.getByRole("link", { name: "Começar cadastro" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding$/);
});
