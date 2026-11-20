/**
 * Mensagens dos códigos de falha dos jobs de geração. Fica fora dos componentes "use client": uma página
 * de servidor que importa de lá recebe só uma referência de cliente, e a mensagem some.
 */
export const JOB_ERRORS: Record<string, string> = {
  facts_violation:
    "A IA sugeriu algo que você não confirmou no cadastro (preço, desconto ou promessa). Nada foi salvo.",
  invalid_output: "A resposta da IA veio incompleta. Nada foi salvo.",
  external_unavailable: "O serviço de IA não respondeu.",
  timeout: "A geração demorou demais e foi interrompida.",
  internal: "Não conseguimos salvar o resultado.",
  storage_failed: "Não conseguimos guardar a imagem.",
  feature_disabled: "A geração com IA não está ativada.",
};
