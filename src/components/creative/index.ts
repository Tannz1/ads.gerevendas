/**
 * API pública das peças (templates, editor, validação e exportação PNG).
 * `src/lib/creative/fonts.ts` é só de servidor e fica de fora de propósito.
 */
export { BACKGROUND_OPTIONS, CreativeArtwork, TEMPLATE_OPTIONS, renderableDesign, type ArtworkFonts } from "./artwork";
export {
  CreativeCanvas,
  DOM_FONTS,
  describeDesign,
  measureFitIssues,
  type CreativeCanvasProps,
} from "./creative-canvas";
export { issuesToFieldErrors, validateDesign, type DesignOfferFacts } from "@/lib/creative/validate";
export {
  RENDER_FALLBACK_MESSAGE,
  RenderError,
  creativeFilename,
  downloadBlob,
  renderCreativePng,
} from "@/lib/creative/render-client";
