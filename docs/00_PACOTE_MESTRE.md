# GereVendas Ads — pacote mestre de construção

**Produto:** SaaS de criação, publicação e acompanhamento de anúncios Meta com inteligência artificial.  
**Domínio proposto:** `ads.gerevendas.com.br`  
**Piloto:** empresas participantes, recrutadas com apoio de parceria com o Sebrae, mediante autorização de cada empresa.  
**Preço-alvo:** R$ 199/mês (verba de mídia paga diretamente à Meta).

## Como usar com Claude, GPT/Codex e Antigravity

1. Abra este pacote na raiz do repositório no VS Code.
2. Entregue `AGENTS.md` e `docs/01_PRD.md` aos três agentes como contexto comum.
3. Execute primeiro o prompt de `agent_prompts/00_ORQUESTRADOR_CLAUDE.md`.
4. Faça a auditoria técnica do CRM existente e o experimento mínimo da Meta antes de assumir APIs disponíveis.
5. Distribua tarefas conforme `docs/06_ROADMAP_MULTIAGENTES.md`, com arquivos e contratos exclusivos por agente.
6. Nenhum agente deve ativar anúncios, cobrar pagamentos reais, modificar o CRM existente ou implantar produção sem autorização explícita.

## Índice

- `AGENTS.md`: regras inegociáveis para todos os agentes.
- `docs/01_PRD.md`: visão, personas, jornadas, escopo, requisitos, critérios de aceite.
- `docs/02_UX_UI.md`: arquitetura de informação, telas, design system, UX responsiva.
- `docs/03_ARQUITETURA_BACKEND.md`: stack, módulos, banco, filas, APIs, infraestrutura.
- `docs/04_IA_CRIATIVOS.md`: agentes, prompts, composição de imagens e custos.
- `docs/05_META_PAGAMENTOS_SEGURANCA.md`: integração Meta, publicação, financeiro, privacidade.
- `docs/06_ROADMAP_MULTIAGENTES.md`: fases, responsáveis, PRs e entregáveis verificáveis.
- `docs/07_PILOTO_SEBRAE_QA.md`: plano de teste de campo e qualidade.
- `docs/08_CONTRATOS.md`: contratos de API, estados e esquema de dados.
- `agent_prompts/`: prompts individuais prontos para delegação.
- `.env.example`: inventário de configurações, sem segredos.

## Estado de referência

**Este pacote é uma especificação de implementação, não uma aplicação pronta.** A identidade visual definitiva do CRM não foi fornecida: as cores propostas são provisórias. A parceria com Sebrae não implica acesso a recursos internos ou autorização de marca. A publicação em contas de terceiros depende de revisão, permissões e elegibilidade da Meta. A compatibilidade exata dos anúncios com destino WhatsApp deverá ser homologada na versão fixada da API.

## Fontes técnicas verificadas em 15/out/2026

- Meta Marketing API (workspace oficial): https://www.postman.com/meta/facebook-marketing-api/overview
- Meta MAPI Onboarding (coleção oficial): https://www.postman.com/meta/facebook-marketing-api/collection/9jo4f5y/mapi-onboarding
- Meta Marketing API Access Tier (mudança de 2026): https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/
- OpenAI Images: https://developers.openai.com/api/docs/guides/image-generation
- OpenAI Images REST: https://developers.openai.com/api/reference/resources/images/methods/generate

