# 01 — PRD e mapa do produto

## 1. Visão
**GereVendas Ads**: transforme informações reais de um negócio em estratégia, criativos estáticos e campanhas Meta, com aprovação de verba e resultados em linguagem acessível. O produto é novo e inicialmente independente do CRM GereVendas, com integração futura planejada.

**Proposta de valor:** "Você conta o que vende; o GereVendas Ads cria os anúncios e ajuda a colocá-los no Facebook e Instagram."

**Negócio:** R$ 199/mês, por organização/empresa, 1 conta Meta inicialmente, 4 lotes/campanhas novas por ciclo, até 20 imagens-base e 20 créditos de regeneração; adaptar cortes Feed/Stories por código não consome nova geração. Definir política de upgrade/estorno. Mídia paga diretamente pelo cliente na Meta. Não vender resultado garantido.

## 2. Público e hipóteses
- Primário: empreendedores locais, prestadores de serviços, comércio de bairro e beleza que vendem pelo WhatsApp.
- Secundário: negócios com website e tráfego local.
- Hipótese: o cliente prefere revisar cinco peças prontas a preencher um gerenciador de campanhas complexo.
- Hipótese: qualidade visual, clareza de preço, suporte para conectar Meta e simplicidade são mais importantes do que configurabilidade avançada.

## 3. Objetivos do MVP
1. Organização pode criar perfil, cadastrar produto e oferta e anexar imagens autorizadas.
2. Motor gera estratégia editável e até cinco propostas completas, com imagens-base e layouts reais.
3. Cliente aprova uma campanha, conecta sua conta de anúncios e confirma verba/periodicidade.
4. Integração cria objetos Meta inicialmente PAUSED, reconcilia IDs e ativa somente após confirmação autorizada.
5. Cliente consulta status, gastos informados pela Meta e pausa/retoma quando permitido.
6. Assinatura SaaS, limites de consumo, histórico e auditoria.
7. Piloto Sebrae com convites controlados e feedback estruturado, sem acesso compartilhado aos dados entre empresas.

## 4. Fora do MVP
- Criação 100% automática de portfólio empresarial, conta de anúncios e forma de pagamento Meta.
- Recebimento de Pix para recarga automática do saldo Meta.
- Conversas/leads detalhados de WhatsApp sem contrato e integração separada.
- Otimização autônoma de orçamento, Google Ads, vídeo, relatórios de faturamento atribuídos sem CRM.
- Clonagem ou modificação destrutiva do CRM atual.

## 5. Jornada do usuário
1. LP > cadastro > criar organização.
2. Onboarding passo 1: empresa (nome, categoria, logo, website/Instagram opcional, município/área).
3. Passo 2: produto/serviço (descrição, preço, oferta confirmada, fotos/provas, restrições e CTA).
4. Passo 3: objetivo (WhatsApp **se homologado**; tráfego para site como fallback), público e cobertura geográfica.
5. Passo 4: IA sugere plano em linguagem simples; mostra premissas e itens a confirmar.
6. Passo 5: cinco propostas em galeria; editor de preço, título, CTA, cores, imagem; variantes feed e story.
7. Passo 6: aprovação da peça e da campanha.
8. Passo 7: conectar Meta via fluxo OAuth oficial, descobrir/adquirir permissões de ativos, selecionar conta/página/Instagram/WhatsApp elegíveis.
9. Passo 8: orientar billing Meta em interface própria da Meta; mostrar bloqueios/limitações de verificação.
10. Passo 9: orçamento em BRL, duração, gastos esperados, consentimento explícito; criar PAUSED e somente ativar por ação humana.
11. Passo 10: dashboard com status, impressões, investimento, conversas quando disponibilizadas e ações de pausa/retomada.

## 6. Requisitos funcionais de prioridade P0
- Multi-tenant, auth, roles `owner`, `member`, `support` (suporte excepcional e auditado).
- Perfil da empresa, oferta, termos verificados, arquivos protegidos.
- IA retorna JSON estruturado com estratégia/copies/planos visuais; editor sempre manual.
- Renderização de criativos 1080x1350, 1080x1920 e preview responsiva, respeitando safe areas.
- Geração enfileirada, custo/latência, cancelamento, reserva/consumo/reversão de créditos.
- Meta OAuth, validação de ativos, publicação PAUSED, ativação, pausas e insights.
- Modo `mock`, `sandbox` (quando aplicável) e `real` claramente separados.
- Assinaturas SaaS via gateway brasileiro com webhook assinado e ledger de eventos.
- Telemetria consentida, suporte de falhas e logs sem dados sensíveis.

## 7. Requisitos não funcionais
- Segurança LGPD por desenho, exclusão e exportação de dados, consentimento, política de retenção.
- A11y WCAG 2.2 AA como alvo: contraste, foco, labels, teclado, leitores de tela.
- LCP e responsividade em mobile-first; upload e geração sem bloquear a página.
- Recuperação de workers, retries controlados, deduplicação, observabilidade.
- Export PDF/relatório fica opcional; relatórios no dashboard são prioritários.

## 8. Métricas de validação (metas de teste, não previsões)
- >= 10 empresas voluntárias no piloto, perfis distintos, com adesão/consentimento.
- > 60% terminam onboarding; > 80% publicam sem intervenção técnica após conexão elegível.
- 100% das publicações respeitam aprovação humana e limites de orçamento.
- 0 vazamento entre organizações; 0 anúncios ativados sem autorização.
- Medir tempo por etapa, taxa de falha de OAuth, quantidade de regenerações, custo de IA por organização, suporte por usuário e rejeições Meta.
- Resultado publicitário não é garantido; medir conversas e leads somente quando observado.

## 9. Campos a confirmar no piloto
- Condições reais de preço/serviço, áreas atendidas, provas/fotos autorizadas, horários, disponibilidade e domínio.
- Se o empreendedor já possui Facebook Page, Instagram, conta Meta Ads e WhatsApp Business compatíveis.
- Se a conta suporta anúncios para WhatsApp. Não prometer esse objetivo antes de homologação.
- Se o CRM GereVendas atual dispõe de APIs/SSO/organizações compatíveis; fazer auditoria read-only, nunca supor.

## 10. Regras comerciais
- `billing_status=active` não libera gastos Meta; assinatura é separada da mídia.
- Ação de criar anúncios consome crédito só quando saída foi entregue e armazenada (reservar antes, reverter falhas).
- Re-render sem nova imagem-base não consome crédito de geração de imagem.
- Campanhas já ativas na Meta não devem ser pausadas automaticamente apenas por falta de pagamento SaaS sem contrato explícito: definir política e comunicá-la.
- Imagens reais do cliente têm prioridade sobre cenas sintéticas; não fabricar depoimentos nem antes/depois demonstrativo tratado como caso real.
