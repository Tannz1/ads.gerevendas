import { z } from "zod";

export const API_ERROR_CODES = [
  "validation_failed",
  "not_authenticated",
  "forbidden",
  "not_found",
  "conflict",
  "facts_not_confirmed",
  "organization_limit_reached",
  "credit_limit_reached",
  "feature_disabled",
  "external_unavailable",
  "internal",
] as const;
export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Formato único de erro retornado por rotas e server actions. */
export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    correlation_id: z.string(),
    field_errors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export type ApiOk<T> = { ok: true; data: T; correlation_id: string };
export type ApiResult<T> = ApiOk<T> | ApiError;

export function apiError(
  code: ApiErrorCode,
  message: string,
  correlation_id: string,
  field_errors?: Record<string, string[]>,
): ApiError {
  return { ok: false, error: { code, message, correlation_id, field_errors } };
}
