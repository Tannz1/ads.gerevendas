import { z } from "zod";
import { COPY_LIMITS, creativeFormatSchema, templateKeySchema, type CreativeFormat } from "./strategy";

/**
 * Peça editável. O design é renderizado de forma determinística pelos templates
 * (`src/components/creative`) tanto no editor quanto na exportação PNG.
 */

export type SafeArea = { top: number; right: number; bottom: number; left: number };

/**
 * Dimensões de exportação e áreas seguras (px no tamanho final). Nos stories, o topo e a base
 * ficam livres de texto porque a interface do app cobre essas faixas.
 */
export const FORMAT_SPECS: Record<CreativeFormat, { width: number; height: number; safe: SafeArea; label: string }> = {
  feed_4x5: { width: 1080, height: 1350, safe: { top: 72, right: 72, bottom: 72, left: 72 }, label: "Feed 4:5" },
  stories_9x16: {
    width: 1080,
    height: 1920,
    safe: { top: 250, right: 72, bottom: 340, left: 72 },
    label: "Stories 9:16",
  },
};

export const BACKGROUND_STYLES = ["solido", "gradiente", "claro"] as const;
export const backgroundStyleSchema = z.enum(BACKGROUND_STYLES);
export type BackgroundStyle = z.infer<typeof backgroundStyleSchema>;

/** Maior preço exibível na peça (R$ 999.999,99): cabe em todos os modelos por construção. */
export const MAX_PRICE_CENTS = 99_999_999;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor em hexadecimal, ex.: #C2410C");

export const creativeDesignSchema = z
  .object({
    format: creativeFormatSchema,
    template_key: templateKeySchema,
    business_name: z.string().trim().min(1).max(60),
    headline: z
      .string()
      .trim()
      .min(3, "Título muito curto")
      .max(COPY_LIMITS.headline, "Título: máximo de 40 caracteres"),
    body: z.string().trim().max(COPY_LIMITS.body, "Texto: máximo de 90 caracteres"),
    cta: z.string().trim().min(2).max(24, "Botão: máximo de 24 caracteres"),
    show_price: z.boolean(),
    /** Em centavos; obrigatório quando show_price = true e sempre igual ao preço confirmado da oferta. */
    price_cents: z.number().int().nonnegative().max(MAX_PRICE_CENTS, "Preço acima do limite da peça").nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    brand_color: hex,
    background: backgroundStyleSchema,
  })
  .refine((d) => !d.show_price || d.price_cents !== null, {
    message: "Preço ausente",
    path: ["price_cents"],
  });
export type CreativeDesign = z.infer<typeof creativeDesignSchema>;

export const CREATIVE_STATUSES = ["draft", "approved"] as const;
export const creativeStatusSchema = z.enum(CREATIVE_STATUSES);

export const creativeViewSchema = z.object({
  id: z.uuid(),
  concept_id: z.uuid().nullable(),
  status: creativeStatusSchema,
  version: z.number().int().positive(),
  design: creativeDesignSchema,
  updated_at: z.string(),
  approved_at: z.string().nullable(),
});
export type CreativeView = z.infer<typeof creativeViewSchema>;

export type DesignIssue = { field: keyof CreativeDesign | "layout"; message: string };

/**
 * Regras de veracidade da peça contra a oferta confirmada (usada no editor, no servidor e
 * replicada no banco): preço só aparece se confirmado e sempre com o valor confirmado.
 */
export function checkDesignAgainstOffer(
  design: Pick<CreativeDesign, "show_price" | "price_cents" | "currency">,
  offer: { price_cents: number | null; price_confirmed_by_client: boolean; currency: string },
): DesignIssue[] {
  if (!design.show_price) return [];
  if (offer.price_cents === null || !offer.price_confirmed_by_client) {
    return [{ field: "show_price", message: "A oferta não tem preço confirmado; a peça não pode mostrar preço." }];
  }
  if (design.price_cents !== offer.price_cents || design.currency !== offer.currency) {
    return [{ field: "price_cents", message: "O preço da peça precisa ser igual ao preço confirmado da oferta." }];
  }
  return [];
}
