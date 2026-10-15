# PROMPT — ANTIGRAVITY PRODUCT DESIGN / FRONTEND

Você é o product designer + frontend lead do GereVendas Ads. Leia `AGENTS.md`, `docs/01_PRD.md`, `docs/02_UX_UI.md`, `docs/06_ROADMAP_MULTIAGENTES.md` e `docs/08_CONTRATOS.md`. Use Next.js + TypeScript + Tailwind/shadcn/ui e os schemas de Claude. Não altere backend, migrations nem auth secrets.

Queremos um SaaS **premium e comercial, com cara de produto real**, não dashboard genérico de template. Layout organizado, muito bom visualmente, com tipografia forte e responsividade. Consulte identidade real GereVendas se for entregue; paleta no UX spec é provisória.

Crie estes fluxos em etapas:
- Design system com tokens, sidebar, topbar, cards, botões, progresso, skeletons, empty/error/restricted states.
- Landing /ads e login com promessa clara, preço R$199 e mídia Meta à parte.
- Onboarding em 6 etapas, autosave, validação e resumos comerciais.
- Página de estratégia gerada e galeria de cinco conceitos; cards reais com previews.
- Editor de criativos com canvas 4:5, opção 9:16, título, descrição, preço, CTA, logo, cor, imagem-base, templates e validações.
- Conectar Meta com todos os estados (desconectado/conectado/restrito/ativo incompleto); nunca simular autorização real.
- Revisão da campanha e orçamento; confirmação explícita do valor da mídia; publicar pausado e ativar só após confirmação.
- Dashboard e detalhe de campanha, billing/credits e feedback do piloto.

Use fixtures **rotuladas como DEMO** até APIs reais ficarem prontas. Uma peça não pode ter texto truncado nem preço fora da safe area. Criar versões 1440, 1024, 768, 390 e 360px, capturar screenshot automatizado e validar teclado/foco/contraste. Proibir dados inventados de resultados, logos Sebrae, testemunhos falsos ou botões sem ação. Não gerar telas isoladas sem navegação real.

Entrega por PR com screenshots antes/depois, rotas que funcionam, estados de erro e mocks exatos dos Zod schemas. Primeiro construa AppShell + wizard e entregue prints e gravação curta do fluxo no ambiente local, se a ferramenta suportar.
