type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE = /(token|secret|password|authorization|cookie|api[_-]?key|service[_-]?role)/i;

/** Remove valores de chaves sensíveis antes de logar. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1),
    ]),
  );
}

/** Log estruturado em JSON (uma linha), sempre com correlation_id quando houver. */
export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(redact(fields) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
