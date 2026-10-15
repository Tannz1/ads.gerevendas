import type { ComponentType } from "react";
import type { CreativeDesign } from "@/contracts/creative";
import type { TemplateKey } from "@/contracts/strategy";
import { renderableText } from "@/lib/creative/typography";
import { DestaqueTemplate } from "./templates/destaque";
import { FaixaTemplate } from "./templates/faixa";
import { MinimalTemplate } from "./templates/minimal";
import { OfertaTemplate } from "./templates/oferta";
import type { ArtworkFonts, TemplateProps } from "./templates/shared";

export type { ArtworkFonts } from "./templates/shared";

const TEMPLATES: Record<TemplateKey, ComponentType<TemplateProps>> = {
  destaque: DestaqueTemplate,
  oferta: OfertaTemplate,
  minimal: MinimalTemplate,
  faixa: FaixaTemplate,
};

/** Rótulos para o seletor de modelos do editor. */
export const TEMPLATE_OPTIONS: ReadonlyArray<{ key: TemplateKey; label: string; description: string }> = [
  { key: "destaque", label: "Destaque", description: "Título grande sobre a cor da marca." },
  { key: "oferta", label: "Oferta", description: "Preço em evidência num cartão." },
  { key: "minimal", label: "Minimal", description: "Fundo claro e tipografia elegante." },
  { key: "faixa", label: "Faixa", description: "Faixa diagonal marcante atrás do título." },
];

/** Rótulos para o seletor de fundo. */
export const BACKGROUND_OPTIONS: ReadonlyArray<{ key: CreativeDesign["background"]; label: string }> = [
  { key: "gradiente", label: "Gradiente" },
  { key: "solido", label: "Sólido" },
  { key: "claro", label: "Claro" },
];

/** Textos da peça como serão desenhados (sem caracteres que as fontes não têm). */
export function renderableDesign(design: CreativeDesign): CreativeDesign {
  return {
    ...design,
    business_name: renderableText(design.business_name),
    headline: renderableText(design.headline),
    body: renderableText(design.body),
    cta: renderableText(design.cta),
  };
}

/**
 * Arte da peça no tamanho nativo (FORMAT_SPECS). Componente puro — sem hooks nem APIs do
 * navegador — para que o MESMO JSX seja desenhado no editor (DOM) e na exportação PNG
 * (`next/og`/Satori). `fonts` traz as famílias: no DOM, as variáveis CSS do layout
 * (`var(--font-display)`); na rota, os nomes registrados no ImageResponse.
 */
export function CreativeArtwork({ design, fonts }: { design: CreativeDesign; fonts: ArtworkFonts }) {
  const Template = TEMPLATES[design.template_key];
  return <Template design={renderableDesign(design)} fonts={fonts} />;
}
