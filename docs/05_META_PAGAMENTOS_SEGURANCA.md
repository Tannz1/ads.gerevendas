# 05 — Meta, cobranças e segurança

## Prioridade 0: homologação da Meta
A API oficialmente suporta criar e gerenciar `Campaign`, `AdSet`, `AdCreative`, `Ad` e consultar `Insights`. **Isso não garante** a disponibilidade, no nosso app, de publicação em contas de terceiros, destino WhatsApp ou criação de portfólio empresarial sem revisão/permissões específicas.

### Checkpoint de integração (não pular)
1. Criar Meta App próprio; identificar produto Marketing API e login para autorização empresarial aplicável.
2. Fixar versão estável da Graph API suportada no período (`META_GRAPH_API_VERSION`) e gravar num ADR.
3. Confirmar com os controles do Meta Developer quais permissões são realmente necessárias (`ads_management`, `ads_read`, `business_management` quando aplicável e permissões sobre páginas/ativos).
4. Conferir App Review, requisitos de verificação e limites do **Marketing API Access Tier** (*Limited*/*Full*) separados de `ads_management`.
5. Implementar OAuth code + state/CSRF, callback exato, teste contra sessão, troca server-side e token vault; tratar revogação/expiração.
6. Descobrir ad accounts, page, Instagram e número/identidade WhatsApp elegíveis. Mostrar o que falta e não prosseguir sem ativo essencial.
7. Testar campanha existente PAUSED, upload de imagem, adcreative e ad PAUSED, GET status/insights, alterações de status, erros e rate limits.
8. Homologar especificamente `Click-to-WhatsApp` usando payload/versionamento compatíveis com a conta e o objetivo vigente. Se não passar, desligar feature flag e lançar tráfego para website apenas.
9. Solicitar acessos de produção e revisar políticas; registrar evidência de teste/consentimento.

### Módulo Meta
`MetaOAuthService`, `MetaAccountDiscovery`, `MetaEligibilityValidator`, `MetaMediaUploader`, `MetaCampaignPublisher`, `MetaStatusService`, `MetaInsightsImporter`, `MetaErrorMapper`, `MetaReconciler`.

A interface de adaptação não expõe Graph payload bruto à camada UI. Backend transforma `CampaignDraft` em configurações elegíveis, usando feature matrix por objetivo, conta e API version. O preview deve anunciar opções indisponíveis; não “substituir silenciosamente” o objetivo desejado.

### Objetivos
- `WHATSAPP_CONVERSATIONS`: obrigatório homologar suporte de conta/página/número, destination e event/optimization atual. Copiar exatamente o objetivo e os parâmetros da versão testada; não reutilizar exemplos antigos como `LINK_CLICKS` sem validar.
- `WEBSITE_TRAFFIC`: fallback para negócios com URL válida. Pixel/CAPI são recursos de evolução para mensuração de vendas, não pressupostos.
- Categorias especiais (habitação, emprego, crédito, política etc.) devem aplicar regras específicas ou ser bloqueadas no primeiro MVP.

### Segurança de gasto
- Dinheiro: `budget_cents` inteiro em BRL, `start_at/end_at`, `budget_type`, conta e campanha no snapshot aprovado. A própria Meta pode operar orçamento diário de modo flexível; informar essa semântica ao usuário.
- Não permitir aprovação automática por IA ou pela integração Sebrae. Exigir role `owner`, sessão ativa, confirmação com orçamento e duração, audit trail e idempotency key.
- `publish-paused` cria campanha/conjunto/criativos/anúncios PAUSED, salva IDs após cada sucesso. `activate` exige uma segunda confirmação contextual do mesmo snapshot, checa saldo/permissões/status quando a API permitir e ativa de modo controlado.
- `status/meta_review` é distinto de `approved-by-user`. Anúncio enviado não equivale a anúncio veiculado.
- Deduplicação: cada operação tem `publication_operation_id` persistente, `request_hash`, IDs retornados, estado `partial`, reconciliação GET antes de retry. Tratar timeout após criação remota.
- `kill switch` desliga publicações e aumentos de gasto em caso de incidente.

## Pagamentos: dois livros separados
### A) Assinatura GereVendas Ads
- Valor R$ 199/mês; usar provedor BR que suporte cobrança com Pix/cartão via checkout oficial e webhooks assinados.
- Tabelas: assinatura, invoice/payment events, ledger de créditos. Estados `trialing`, `active`, `past_due`, `canceled`, `suspended`.
- Webhook idempotente por `(provider,event_id)`; checar assinatura/HMAC, confirmar recurso na API do gateway quando necessário, processar com transação e auditar.
- Nunca expor secret no frontend; publicar entitlement via backend após confirmação do gateway.
- Para Pix mensal, verificar mecanismo específico de recorrência do gateway antes de anunciar débito automático.

### B) Gasto com mídia Meta
- Cobrado diretamente pela Meta ao cliente; o SaaS NÃO recolhe o saldo publicitário e NÃO armazena cartão Meta.
- Interface mostra passo de configurar cartão ou saldo/Pix **somente quando a conta e localização tiverem essas opções no ambiente Meta**.
- Não dizer que a conta está financeiramente apta só porque o usuário clicou no link; confirmar status por fontes disponibilizadas ou usar `billing_unverified` e orientar a conclusão.
- Conta, página, WhatsApp e portfólio pertencem ao cliente; evitar asset ownership centralizado na plataforma.
- Não há requisito de criar Business Portfolio nem Ad Account automaticamente no MVP.

## Segurança geral
- OAuth state/nonce, URLs exatas, cookies httpOnly/SameSite, tokens encrypt-at-rest; serviço específico para atualização/revogação.
- RLS em todas as tabelas por organization_id; backend verifica roles; suporte com acesso elevado somente sob autorização, prazo e auditoria.
- Dados pessoais de clientes e contatos: coletar mínimo necessário; consentimento separado para piloto, IA e marketing; política de retenção e export/delete da LGPD.
- Empresa piloto tem dados próprios. Sebrae recebe apenas agregados anonimizados salvo contrato + consentimento específico; nenhuma conta Meta “emprestada” por padrão.
- Scanning de upload, validar MIME real/tamanho, thumbnails e signed URLs, antivírus quando aplicável.
- URLs de sites fornecidos para análise: SSRF guard, bloquear IP interno/metadata, verificar DNS e redirects, limites de tamanho/tempo, não executar JavaScript não confiável sem sandbox.
- HTML de criativo somente por templates permitidos; sanitizar dados (XSS/injection); não permitir prompt de origem pública sobrescrever system.
- Rate limits para auth, geração, conexões Meta, webhooks e exportação; antifraude básico.
- Backup/restauração, segregação staging/prod, Sentry com scrubbing; auditoria de todas as operações financeiras e de publicação.

## Política e conformidade
- Verificar Meta Advertising Standards e categorias especiais com revisão humana onde relevante. Não prometer aprovar todos os anúncios.
- Uso de imagem de marca/rosto e fotografia de serviço com licença/consentimento; confirmar bases legais e direitos de uso.
- Menção e logo Sebrae exigem aprovação formal; não presumir endosso ou repasse livre de dados.

## Documentação técnica prioritária
- Meta workspace: https://www.postman.com/meta/facebook-marketing-api/overview
- Meta onboarding: https://www.postman.com/meta/facebook-marketing-api/collection/9jo4f5y/mapi-onboarding
- Meta tiers (04/05/2026): https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/
