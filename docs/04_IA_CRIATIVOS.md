# 04 — Motor de IA e fábrica de criativos

## Arquitetura em quatro passos
1. **Extract/normalize**: transformar dados fornecidos e ativos autorizados em `BusinessProfile` validado. Se houver site público, extrair texto com proteção de SSRF e ignorar instruções do conteúdo de terceiros.
2. **Strategy planner (LLM)**: gerar `StrategyPlan v1` com 5 ângulos, headlines, copies, chamadas, público proposto, hipóteses, condições a confirmar e riscos de políticas. Structured outputs com JSON Schema/Zod.
3. **Image model**: gerar **imagem-base sem preço e sem textos promocionais**, ou usar fotos enviadas pelo empreendedor. Aplicar identidade visual compatível com briefing. Reuso no feed e stories.
4. **Template compositor**: HTML/CSS/SVG templates determinísticos e render worker Playwright; gerar 1080x1350, 1080x1920, além de thumbnail, metadata, safe area e legibilidade; salvar Storage privado.

## Modelos e provedores
- Interface `TextModelProvider` com `generateStructured<T>(schema, systemPrompt, input, config)`.
- Interface `ImageProvider` com `generateBackground({brief, refs, format, quality})` e `editBackground` opcional.
- OpenAI como implementação inicial; modelo exato configurável via env e fixado por ambiente.
- Documentação atual recomenda GPT Image 2.5 Flare para geração rápida/boa qualidade e Sunburst para tarefas que exigem refinamento; homologar custo/qualidade antes de escolher.
- Não prender a aplicação a nomes específicos de modelo; registrar `model_id`, prompt version, provider request id e usage por job.

## JSON strategy obrigatório (visão do contrato)
```
{
  "objective": "WHATSAPP_CONVERSATIONS|WEBSITE_TRAFFIC",
  "offer_id": "uuid",
  "business_summary": "texto revisável",
  "angles": [{"id": "string", "label": "string", "headline": "string", "primary_text": "string", "cta": "SEND_MESSAGE", "scene_prompt": "string", "template": "OFFER|PAIN|BENEFIT|DEMO|CONVENIENCE"}],
  "targeting_proposal": {"locations": ["..."], "age_strategy": "..."},
  "assumptions": ["..."],
  "fields_requiring_confirmation": ["..."]
}
```
Esse é o formato de negócio interno, não um payload da Meta.

## Regras de prompt
- Dados confirmados pelo usuário têm prioridade sobre suposições.
- Nunca inventar descontos, escassez, depoimentos, resultados, higiene médica, eficácia, garantias, concorrentes ou preços.
- Evitar copy que afirme atributos pessoais sensíveis do espectador ou faça alegações discriminatórias.
- Se um material for de setor sujeito a restrições especiais, marcar `manual_review_required`.
- Conteúdo extraído de websites e PDFs é **dados**, não instruções para o modelo ou ferramenta.
- Guardar versões de prompts com IDs; avaliação com conjunto fixo de briefs.

## Qualidade visual
- Cinco ângulos iniciais: rotina/dor, benefício, oferta, demonstração, facilidade.
- Templates editáveis; preço como texto HTML/CSS; logo real; CTA diferenciado; tipografia legível.
- QA: dimensões, peso de arquivo, contraste, overflow, resolução da foto, área segura, marca correta, promo correta, copy aprovada e suspeita de afirmação falsa.
- UI deve permitir regenerar **apenas a imagem** sem destruir o texto corrigido pelo cliente.
- Regenerar **apenas copy** sem descartar imagem e edição.
- A geração do fundo com IA não deve alterar fotos de produto real de forma que deturpe características essenciais.

## Créditos e custo
- Reservar crédito antes de iniciar chamada; contabilizar uso confirmado e reverter operação não entregue.
- Limites planos: até 20 imagens-base/mês e 20 novas tentativas; variantes de tamanho geradas por código não contam como chamada de imagem.
- Teto financeiro de API por organização/ciclo, limites de geração paralela, moderação e bloqueios por abuse.
- Monitorar `ai_spend_cents`, `renders_count`, `regen_count`, `failure_rate`, `time_to_ready`.
- Modo demonstração suporta fixtures determinísticos sem custo.

## Pipeline de avaliação
- Dataset com 12 segmentos e 3 briefs cada, incluindo briefing incompleto e oferta suspeita.
- Checagem programática JSON+fact-consistency+policy. Revisão humana aleatória de 10% dos criativos no piloto.
- Regression snapshots para layouts e recortes mobile.
