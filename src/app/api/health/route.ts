/** Healthcheck para o orquestrador de containers (Docker/EasyPanel). Sem dados sensíveis. */
export function GET() {
  return Response.json({ ok: true, service: "gerevendas-ads" });
}
