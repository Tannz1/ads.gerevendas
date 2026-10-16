# 02 — Direção visual, design system e todas as telas

## Princípio de experiência
O sistema deve parecer uma plataforma financeira/comercial premium, não um template genérico de chatbot. Manter **interface simples, comercial, consistente e confiável**, sem excesso de gradientes, cards inúteis, gráficos fictícios ou textos técnicos ao empreendedor.

**Atenção:** paleta provisória abaixo. Antes de concluir identidade, auditar o manual, ícones, logos e tipografias do GereVendas existente. Não alterar o CRM em produção.

## Identidade provisória
- Marca textual: **GereVendas Ads**; símbolo abstrato de expansão/conversão (não usar ícones oficiais da Meta como logo do produto).
- Fundo claro principal `#F7F9FC`, superfície `#FFFFFF`, tinta `#142337`, texto secundário `#617085`.
- Primária `#0E7666` (verde-petróleo), hover `#0A5B50`, sucesso `#11805C`.
- Info `#2867C8`, aviso `#B87111`, erro `#C93E45`, borda `#E2E8EF`.
- Hero/LP opcional fundo `#0D1C2B` e menta `#73E3BB`; usar só no marketing, não em todas as telas.
- Fonte: **Inter** corpo, **Manrope** em títulos; fontes por npm/web, sem bundling de arquivos não licenciados.
- Base 8 px: spacing 4,8,12,16,24,32,48; borda 10-14 px; sombras discretas.
- Títulos grandes apenas em header e hero. Dashboard com hierarquia H1 28-32, H2 20-24, corpo 14-16; badges apenas status relevantes.

## Grid / responsivo
- Desktop: sidebar 248px + topbar 72px; conteúdo 1120-1280px; Cards responsivos 12-column.
- Tablet: sidebar colapsável 72px; wizard 2-colunas quando couber.
- Mobile: navegação inferior ou menu, ações fixas no rodapé nas etapas críticas, editores empilhados.
- Conteúdo sempre navegável com teclado; foco visível, mensagem de erro na entrada correspondente.
- Estados obrigatórios: skeleton, empty, error, unauthorized, no-connected-account, pending-review, generation-running, Meta-rejected, subscription-past-due.

## Navegação principal
`Visão geral` / `Criar anúncio` / `Criativos` / `Campanhas` / `Resultados` / `Conexões` / `Assinatura` / `Configurações`.

## Telas (interfaces com conteúdo real, sem dados inventados)

### A. Landing (`/` ou gerevendas.com.br/ads)
- Hero: “Crie anúncios para seu negócio sem dominar tráfego pago.”
- CTA “Criar meus anúncios”; demonstração 3 passos; 3 exemplos de peças (marcar como exemplos); preço R$199; mídia à parte; FAQ Meta/WhatsApp/Pix.
- Prova social só com autorização e dados verificáveis. Não usar logo Sebrae sem licença/documento.

### B. Auth / entrada
- `/login`, `/signup`, `/invite/[token]`; e-mail/senha ou método suportado, verificação, termos, consentimentos separados e recuperações.
- Organização é criada depois do cadastro; somente membros autorizados acessam dados.

### C. Onboarding (`/onboarding/*`)
- Wizard 6 etapas com barra horizontal curta “Empresa > Oferta > Objetivo > Materiais > Revisão > Gerar”.
- Cada etapa tem no máximo 5-7 perguntas visíveis, ajuda contextual e progresso persistido.
- `Empresa`: nome, ramo, site/Instagram opcional, cidades, logo, cores.
- `Oferta`: produto/serviço, preço, regras do “a partir de”, diferenciais confirmáveis, link/WhatsApp.
- `Objetivo`: conversas WhatsApp apenas se elegível; site traffic; segmentação geográfica.
- `Materiais`: fotos reais preferenciais; declaração de uso autorizado; fallback imagem gerada.
- `Revisão`: distinguir “informado pelo cliente” e “sugerido pela IA”.
- Botão “Gerar minha primeira campanha”.

### D. Overview (`/dashboard`)
- Boas-vindas “Sua próxima campanha começa aqui” quando vazio; um CTA primário.
- Com campanhas: 4 KPIs reais (gasto, conversas atribuídas quando disponíveis, campanhas ativas, custo por resultado se houver); filtro 7d/30d; alertas importantes; última campanha; saldo de gerações.
- “Aguardando revisão Meta” e “Pagamento Meta pendente” com indicadores honestos.

### E. Estratégia (`/studio/strategy/[id]`)
- Cabeçalho “Sua estratégia está pronta” e resumo editável.
- 5 ângulos de venda em lista/cartões; justificativa em linguagem leiga; CTA e público/região.
- Chips “Precisa confirmar” para preço, condições, prova de serviço e localização.
- Ação “Aprovar estratégia e gerar anúncios”.

### F. Galeria (`/studio/creatives/[batchId]`)
- Grade de cinco artes (proporção 4:5), filtros conceito, status, formato e variantes.
- Em cada arte: `Editar`, `Gerar alternativa` (custo em créditos), `Aprovar`, `Excluir`.
- Nunca imprimir prompt bruto do modelo em UI padrão; disponibilizar opção avançada.

### G. Editor visual (`/studio/editor/[creativeId]`)
- Desktop: propriedades esquerda 300px, canvas central 4:5 com zoom, prévia direita Feed/Stories; mobile canvas primeiro + propriedades em acordeão.
- Editar título, subtítulo, preço, botão ilustrativo, fonte, cores, logo, posição e imagem-base.
- Templates em 5 famílias: `Oferta`, `Problema`, `Benefício`, `Demonstração`, `Conveniência`.
- Texto em HTML/SVG/CSS renderizado deterministicamente, não “queimado” na imagem-base IA.
- Safe area, contraste e alertas de truncamento; validação de preços e marcas.
- `Salvar`, `Gerar variação`, `Aprovar criativo`.

### H. Conexão Meta (`/integrations/meta`)
- Estados: desconectado, autorizado, parcialmente configurado, inelegível, token expirado.
- Botão oficial de autorização, seleção conta, Página, Instagram e WhatsApp quando aplicável.
- Checklist de permissões e orientações legíveis. Não pedir usuário/senha Meta dentro do SaaS.
- Se pagamento Meta ausente, abrir a área oficial de cobrança da Meta; não coletar cartão na aplicação.

### I. Publicação (`/campaigns/new`)
- Revisão visual dos criativos selecionados, identidade e destino, orçamento BRL, duração/data de término, categoria especial quando aplicável, conta usada.
- Box persistente de resumo: `Plano GereVendas: R$199/mês` separado de `Mídia Meta: R$xxx autorizados`.
- Checkbox de consentimento de gasto + confirmação em modal com valor final e ativos.
- Stepper: `Validando > Criando (pausado) > Pronto para ativação > Enviado à revisão Meta`.
- Cada estado explica o que aconteceu; retries seguros sem duplicação.

### J. Campanhas / detalhe (`/campaigns` / `/campaigns/[id]`)
- Lista com filtros, gasto, período, status Meta e status interno, ações permitidas.
- Detalhe com KPIs, 5 criativos, dados de configuração, timeline de eventos, avisos e ações pausa/retomada.
- Se métricas de conversas indisponíveis, mostrar “Não disponível nessa conta/objetivo”, nunca `0` inventado.

### K. Assinatura (`/billing`)
- Plano contratado, ciclos, créditos disponíveis/consumidos, histórico de pagamentos e botões de checkout do provedor.
- Explicar explicitamente que verba de anúncios é paga à Meta, não ao GereVendas Ads.

### L. Piloto (`/pilot/feedback`)
- Micro pesquisa de 3 perguntas após etapa relevante; feedback de criativo (bom/ruim/motivo), obstáculos Meta, nota de compreensão.
- Administração interna com apenas dados agregados e acesso restrito; nenhum painel especial para Sebrae sem contrato de governança e consentimento.

## Componentes
`AppShell`, `Sidebar`, `PageHeader`, `StepProgress`, `BudgetSummary`, `CreativeCard`, `CanvasEditor`, `TemplateSelector`, `MetaConnectionStatus`, `CampaignStatus`, `EmptyState`, `ErrorPanel`, `CreditMeter`, `ActivityTimeline`, `FeedbackPopover`, `ConfirmPublishDialog`.

## Regras de qualidade visual
- Produzir primeiro Figma ou equivalentes no código (Storybook) para 5 telas críticas e adaptar responsivamente.
- Toda tela deve ter ao menos um estado vazio e um estado com dados realistas **rotulados como demo**.
- Reuse os mesmos tokens de layout, spacing, estados e linguagem no produto inteiro.
- Editor: respeitar margens de segurança, não deixar texto sobre rosto, preço ou CTA fora do frame; verificar via snapshot visual.
- Preferir cenas reais dos clientes; imagens sintéticas são referência ilustrativa e não prova de resultado do serviço.

## Aceite UX
Com um usuário não técnico: identificar ação principal em menos de 10s (meta experimental), terminar briefing sem ajuda, reconhecer gastos distintos (SaaS x Meta), revisar e corrigir preço, entender bloqueio de publicação e voltar ao trabalho salvo sem perder dados.
