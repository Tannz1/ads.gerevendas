# ADR 0007 — Painel por empresa e execução segura

- Status: implementado; publicação real depende de homologação e configuração no ambiente isolado.
- Data: 26/10/2026
- Complementa: ADRs 0005 e 0006.

A conta de anúncios continua atribuída à organização. Seus membros compartilham a visibilidade conforme os papéis existentes. O painel `/app/painel` filtra conta e campanhas pela organização da sessão. Detalhes, retomada, ativação, pausa e sincronização também restringem a campanha à organização atual, além das políticas RLS. O estoque completo continua restrito ao operador.

O painel mostra métricas acumuladas recebidas da Meta, a cobertura de campanhas sincronizadas e a data mais antiga dos dados. Simulação não entra nos totais. Somamos investimento, impressões, cliques e conversas; CTR e CPC são calculados pelos totais. Alcance permanece por campanha, pois somá-lo contaria a mesma pessoa mais de uma vez. Totais monetários agregam somente BRL; outras moedas permanecem nos detalhes. Atualização é sob demanda, limitada a 20 campanhas por chamada e ao intervalo de 60 segundos por campanha.

Publicação e mudança de veiculação usam uma trava persistente por campanha. A trava não expira automaticamente: uma execução interrompida deve ser conferida antes de liberá-la. Cada escrita de publicação registra uma intenção antes de chamar a Meta. O registro do ID externo confirma a intenção na mesma transação. Uma intenção sem ID confirmado bloqueia nova criação, inclusive após timeout ou falha de persistência. O conteúdo, a conexão, a segmentação e os dados necessários para renderizar as peças são congelados antes da primeira escrita externa.

Antes da ativação, o servidor confere novamente proprietário, orçamento, duração, chave de autorização, conexão e ativos originais; também consulta situação da conta e pagamento. Reutilizar uma autorização anterior é bloqueado antes de chamar a Meta. Falha na ativação ou na gravação exige tentativa de pausa e alinhamento do estado no banco. Se a compensação não for confirmada, a trava permanece e a interface orienta pausar no ambiente oficial Meta e procurar suporte. Operações concorrentes também não podem atravessar a mesma trava; se uma pausa urgente estiver bloqueada por uma operação pendente, deve ser feita na Meta.

`reviewFromAds` não considera `UNKNOWN`, `WITH_ISSUES` ou um estado apenas pausado como aprovação. A situação da conta e a existência do pagamento são rechecadas mesmo após a configuração inicial.

Testes de contrato de escrita continuam exclusivamente manuais, autorizados pelo operador e com todos os objetos criados pausados. Implementação local e testes com mocks não comprovam homologação com a Meta.

## Banco e recuperação

Migration aditiva: `20261026140000_painel_publicacao_segura.sql`. Novas tabelas com `organization_id`, chaves compostas para impedir cruzamento entre empresas, RLS habilitada e sem acesso direto por clientes: `meta_campaign_executions`, `meta_publication_steps`, `meta_publication_snapshots`. RPCs de execução são exclusivas de `service_role`.

A leitura `meta_execution_overview` retorna apenas campanhas e datas das execuções da própria empresa para manter avisos no painel após recarregar. Tokens de execução e conteúdo dos snapshots permanecem privados.

Uma intenção pendente exige conferência do operador no Gerenciador de Anúncios. Se o objeto existir, registrar seu ID correto com `meta_record_publication` antes de liberar a execução usando seu token. Se a ausência for comprovada, remover apenas a intenção correspondente em uma intervenção técnica auditada e autorizada. Não apagar intenções ou liberar travas por tempo decorrido. Não liberar uma execução enquanto o processo original ainda puder continuar. A recuperação não cria nem ativa anúncios automaticamente.

Rollback operacional: desligar `FEATURE_FLAG_REAL_PUBLISHING`, conferir eventuais campanhas ativas na Meta e manter as tabelas de recuperação para auditoria. Reverter o código não pausa campanhas na Meta. Não remover esta migration nem apagar snapshots em ambiente já usado.

## Verificação local

- `npm run check`
- `npm run test:db` em PostgreSQL nativo no CI/Linux.
- `npm run test:db:embedded` como alternativa isolada para Windows, baseada em PostgreSQL WASM. Aplica as mesmas migrations e testes RLS; não comprova concorrência entre conexões.
- Build seguido de E2E em demonstração, sem configuração pública do Supabase no processo de build e de execução.
- `npm run test:meta-contract` somente após revisar as flags e obter autorização específica para quaisquer escritas reais.

O teste `meta-publication.contract.test.ts` exige `META_CONTRACT_WRITE=1` e `META_CONTRACT_PUBLISH=1`, além das variáveis `META_CONTRACT_AD_ACCOUNT_ID`, `META_CONTRACT_PAGE_ID`, `META_CONTRACT_PNG_PATH`, `META_CONTRACT_WEBSITE`, `META_CONTRACT_CITY`, `META_CONTRACT_STATE` e credenciais exclusivamente no servidor. `META_CONTRACT_INSTAGRAM_ID` é opcional. Uma falha pode deixar objetos pausados na Meta; conferir os IDs emitidos antes de repetir e limpar manualmente após a homologação. O teste cobre a criação para tráfego ao site; outros objetivos precisam de homologação específica antes da liberação geral.
