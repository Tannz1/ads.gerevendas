import type { ApiError } from "@/contracts/api";
import { DAILY_GENERATION_LIMIT, type JobErrorCode } from "@/contracts/strategy";

/** Mensagens da geração por código de erro do job (o job em si só guarda o código). */
export const JOB_ERROR_MESSAGES: Record<JobErrorCode, { title: string; text: string }> = {
  provider_timeout: {
    title: "A IA demorou demais para responder",
    text: "Nada foi salvo. Tente de novo em instantes.",
  },
  provider_unavailable: {
    title: "O serviço de IA está fora do ar",
    text: "Não conseguimos falar com o serviço de IA agora. Tente de novo em alguns minutos.",
  },
  provider_rate_limited: {
    title: "Muitos pedidos ao serviço de IA",
    text: "O serviço de IA pediu uma pausa. Aguarde um minuto e tente de novo.",
  },
  invalid_output: {
    title: "A resposta da IA veio fora do formato",
    text: "A resposta foi descartada porque não seguia o formato esperado. Tente de novo.",
  },
  fact_check_failed: {
    title: "A IA inventou informações e a resposta foi descartada",
    text: "A IA incluiu afirmações que não estão no seu cadastro (como preços, números, promessas ou depoimentos). Para não mostrar nada falso, descartamos tudo. Tente de novo; se repetir, revise o cadastro do negócio.",
  },
  stale_timeout: {
    title: "A geração travou",
    text: "A geração passou do tempo limite e foi interrompida. Tente de novo.",
  },
  quota_exceeded: {
    title: "Limite diário atingido",
    text: `Sua empresa usou as ${DAILY_GENERATION_LIMIT} gerações das últimas 24 horas. Tente novamente mais tarde.`,
  },
  feature_disabled: {
    title: "Geração com IA desligada",
    text: "A geração com IA foi desligada neste ambiente. Tente mais tarde.",
  },
  internal: {
    title: "Algo deu errado do nosso lado",
    text: "Não foi possível concluir a geração. Tente de novo.",
  },
};

/** Títulos claros para os erros do pedido de geração (a mensagem do servidor vem embaixo). */
export const REQUEST_ERROR_TITLES: Partial<Record<ApiError["error"]["code"], string>> = {
  quota_exceeded: "Limite diário atingido",
  brief_not_ready: "Conclua o cadastro do negócio",
  feature_disabled: "Geração indisponível",
  forbidden: "Sem permissão",
  conflict: "Já existe um pedido em andamento",
  not_found: "Não encontrado",
};

/** Referência curta para o suporte: primeiros 8 caracteres do correlation id. */
export function errorRef(correlationId: string | null | undefined): string | null {
  return correlationId ? correlationId.slice(0, 8) : null;
}

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  // Fuso fixo: o texto sai igual no servidor e no navegador (sem erro de hidratação).
  timeZone: "America/Sao_Paulo",
});

/** "dd/mm/aaaa hh:mm" no horário de Brasília. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = Object.fromEntries(DATE_TIME.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}
