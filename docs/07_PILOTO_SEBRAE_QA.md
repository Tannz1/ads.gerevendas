# 07 — Piloto com empreendedores, Sebrae e QA

## Premissa
A parceria com Sebrae é canal de acesso, orientação e validação **conforme autorização específica**. Não supor integração técnica, endorsement, acesso livre à base de atendidos ou permissão de marca. Cada participante entra voluntariamente, recebe aviso de privacidade e controla conta Meta e gasto.

## Plano de recrutamento sugerido
- Cohort inicial: 10–20 empresas de perfis mistos com representante responsável.
- Metade com conta Meta elegível e anúncios anteriores; metade iniciantes (para entender fricção de setup).
- Serviços locais, beleza, comércio, com pelo menos alguns sites ativos para fallback website traffic.
- Termo de participação, uso de dados, IA, direitos de imagem e gastos de mídia. Não testar usando verba real sem autorização e teto.
- Criar `pilot_invite` de uso único e escopo de organização. `feature_flag_pilot=true`; permitir desativar participação.
- Parceiro recebe apenas relatório agregado/anônimo por padrão. Acesso a empresas individuais só com base jurídica, contrato e consentimento formal.

## Protocolo de sessão
1. Entrevista curta sobre criação de anúncios e dificuldades prévias.
2. O participante cadastra negócio com auxílio mínimo; medir tempo e perguntas repetidas.
3. Aprova perfil e oferta (preço e condições reais).
4. IA gera cinco peças, o usuário escolhe e corrige; medir regenerações e nota visual.
5. Conecta Meta se possuir ativos; registrar bloqueios sem tentar burlar elegibilidade.
6. Configura billing Meta no ambiente Meta; gastos por conta/cliente.
7. Aprova explicitamente orçamento, período e ativos; sistema publica PAUSED.
8. Usuário decide quando ativar campanha elegível.
9. Após 7 dias (janela observacional sugerida), coletar satisfação e disponibilidade de métricas, sem prometer resultados.

## Instrumentação
Eventos mínimos: `signup_completed`, `onboarding_step_completed`, `profile_approved`, `strategy_generated`, `creative_generated`, `creative_regenerated`, `creative_approved`, `meta_connect_started`, `meta_connect_succeeded`, `meta_connect_failed`, `meta_assets_eligible`, `publish_confirmed`, `publish_paused_succeeded`, `activation_confirmed`, `meta_ad_rejected`, `campaign_paused`, `pilot_feedback_submitted`.
Incluir propriedades: org_id pseudonimizado, cohort, feature flags, timestamps, step_duration, error_code, image model (sem corpo do prompt com PII). Não registrar conteúdos sensíveis.

## Métricas e decisões
- Ativação de produto: usuário aprovou >= 1 criativo e chegou ao passo Meta.
- Conversão real de onboarding: >= 60% no teste, meta orientativa.
- Publicação sem suporte em contas elegíveis: >= 80%, meta orientativa.
- Qualidade visual avaliada pelo cliente: medir nota 1-5 e proporção de regeneração; não fixar sucesso sem observar.
- Custo médio de IA por campanha, erros Meta, créditos consumidos e suporte por cliente.
- Decisão go/no-go: nenhum incidente de gastos sem consentimento, isolamento de dados provado e reconciliador de publicações estável.

## Matriz de testes
### Unitários
Validação de preço/oferta, schema strategy, formato, crédito reservado/estornado, cálculo budget em centavos, autorização de rotas, regra de ativação, prompts resistentes a dados maliciosos.
### Integração
Supabase RLS multi-org, OAuth callback with invalid state, cancelamento de token, duplicação de webhook, timeout Meta após criação parcial, conta sem Página/WhatsApp elegíveis, job sem crédito.
### E2E Playwright
1. Signup -> org -> oferta -> geração mock -> aprovar -> publicar mock PAUSED -> ativar mock com confirmação.
2. Login org A tenta buscar criativo org B: 403/404 sem dados.
3. Renovação/cancelamento assinatura e crédito.
4. Mock Meta rejeita anúncio e UI explica erro.
5. Session expirada antes de ativar: operação abortada.
6. Budget alterado depois da aprovação: aprovação invalidada, nova confirmação.
7. Layout 1440, 1024, 768, 390 e 360 px.
### Resiliência
Worker cai entre Meta Campaign e AdSet; reprocessar sem campanha duplicada. Upload falha após geração; repetir render sem chamada de IA adicional. Gateway envia 3 eventos iguais: ledger único.
### Segurança
SSRF no website, SVG/HTML com payload XSS, bypass RLS, brute force OTP, upload MIME falso, exposição de signed URL, prompt injection em conteúdo externo.

## Critérios de pronto para piloto real
- Sandbox/Mock testado + conta Meta autorizada; feature `REAL_PUBLISHING` fechada por padrão.
- Backup & restore em staging; política de privacidade, consentimento, termo de uso e canal de suporte.
- Contrato de piloto define quem paga anúncio e limitações de elegibilidade.
- Revogar conexão Meta imediatamente funcional; incident response e kill switch.
- Sem uso promocional da marca Sebrae ou logos de empresas sem consentimento.

## Relatório de encerramento do piloto
Tabela agregada: convidados, cadastros, contas elegíveis, estratégias, imagens, campanhas pausadas, ativações confirmadas, bloqueios por categoria, média de tempo para primeira peça, satisfação visual, erros e melhorias. Separar dados observados de relatos e não atribuir vendas por ausência de rastreamento CRM.
