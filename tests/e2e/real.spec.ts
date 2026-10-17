import { expect, test, type Page } from "@playwright/test";
import { p } from "./paths";

// Modo real contra o Supabase LOCAL (`npx supabase start`): login por link mágico lido do Mailpit,
// dados gravados no Postgres com RLS. Não roda no CI. O app precisa estar em http://127.0.0.1:3000 com
// NEXT_PUBLIC_APP_URL igual a essa origem (os cookies de login não passam entre hosts). Uso:
//   E2E_REAL=1 E2E_PORT=3000 npx playwright test real --project=desktop
test.skip(!process.env.E2E_REAL, "defina E2E_REAL=1 com o Supabase local rodando");

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function magicLink(email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages.length) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { HTML: string };
      const href = /href="([^"]+\/auth\/v1\/verify[^"]+)"/.exec(msg.HTML)?.[1];
      if (href) return href.replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`link de acesso não chegou para ${email}`);
}

async function login(page: Page, email: string) {
  await page.goto(p("/entrar"));
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await expect(page.getByText("Link enviado")).toBeVisible();
  await page.goto(await magicLink(email));
  await expect(page).toHaveURL(/\/app$/);
}

async function createOrganization(page: Page, name: string) {
  await page.getByLabel("Nome da empresa").fill(name);
  await page.getByRole("button", { name: "Criar empresa" }).click();
  // Sem recarregar: o layout precisa refletir a empresa recém-criada.
  await expect(page.getByRole("heading", { name: "Seu negócio" })).toBeVisible();
  await expect(page.getByRole("banner")).toContainText(name);
}

const cont = (page: Page) => page.getByRole("button", { name: "Continuar", exact: true }).click();

test("login, empresa e onboarding persistidos; outra empresa não vê os dados", async ({ page, browser }) => {
  const run = Date.now();
  const nameA = `Padaria A ${run}`;
  await login(page, `dono.a.${run}@exemplo.test`);
  await createOrganization(page, nameA);

  await page.getByLabel("Nome do negócio").fill(nameA);
  await page.getByLabel("Segmento").fill("Alimentação");
  await page.getByLabel("Cidade").fill("Campinas");
  await page.getByLabel("Estado").selectOption("SP");
  await page.getByLabel(/WhatsApp/).fill("19999990000");
  await cont(page);

  await page.getByLabel("Produto ou serviço").fill("Café da manhã completo");
  await page.getByLabel("Descreva em poucas linhas").fill("Pão na chapa, café e suco natural.");
  await page.getByText("Mostrar preço", { exact: true }).click();
  await page.getByLabel("Preço", { exact: true }).fill("24,90");
  await page.getByLabel("Confirmo que este preço é real e está valendo hoje.").check();
  await cont(page);

  await page.getByLabel("Quem são seus clientes").fill("Moradores e trabalhadores do bairro");
  // Autosave no servidor: recarregar mantém etapa e dados.
  await expect(page.getByText("Rascunho salvo")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Quem compra" })).toBeVisible();
  await expect(page.getByLabel("Quem são seus clientes")).toHaveValue("Moradores e trabalhadores do bairro");
  await cont(page);

  await page.getByText("Receber mensagens no WhatsApp").click();
  await cont(page);
  await page.getByText("Acolhedor").click();
  await cont(page);

  await expect(page.getByText("R$ 24,90", { exact: false })).toBeVisible();
  await page.getByLabel(/Confirmo que as informações acima são verdadeiras/).check();
  await page.getByRole("button", { name: "Concluir cadastro" }).click();
  await expect(page.getByRole("heading", { name: "Cadastro concluído" })).toBeVisible();
  await expect(page.getByText("Simulação")).toHaveCount(0);

  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await expect(page.getByText("Concluído", { exact: true })).toBeVisible();

  // Outra empresa, outra sessão: começa do zero e não enxerga nada da empresa A.
  const other = await browser.newContext();
  const pageB = await other.newPage();
  await login(pageB, `dono.b.${run}@exemplo.test`);
  await expect(pageB.getByRole("banner")).toContainText("Sem empresa");
  await createOrganization(pageB, `Salão B ${run}`);
  await expect(pageB.getByLabel("Nome do negócio")).toHaveValue("");
  await pageB.goto(p("/app"));
  await expect(pageB.getByText("Não iniciado")).toBeVisible();
  await expect(pageB.getByText(nameA)).toHaveCount(0);
  await other.close();
});
