import "server-only";
import { detectImage, type ImageKind } from "@/lib/image-bytes";

/** Maior lado guardado: sobra para o maior formato da peça (1080x1920) e para o avatar de vídeo. */
export const MAX_PHOTO_SIDE = 2048;

/** Carregado só quando há foto: o módulo nativo não pesa nas páginas que importam este arquivo. */
const loadSharp = () => import("sharp").then((m) => m.default);

/**
 * Prepara a foto enviada (quase sempre do celular): aplica a rotação do EXIF, porque o render da peça
 * (Satori) ignora essa etiqueta e publicaria a foto deitada; tira os metadados (GPS, aparelho) e reduz
 * para no máximo MAX_PHOTO_SIDE. PNG continua PNG (logotipo com transparência). Null se não for
 * JPG/PNG legível.
 */
export async function normalizePhoto(bytes: Uint8Array): Promise<{ bytes: Uint8Array; kind: ImageKind } | null> {
  const kind = detectImage(bytes);
  if (!kind) return null;
  try {
    const sharp = await loadSharp();
    const img = sharp(bytes, { failOn: "error" })
      .rotate()
      .resize({ width: MAX_PHOTO_SIDE, height: MAX_PHOTO_SIDE, fit: "inside", withoutEnlargement: true });
    const out = kind.mime === "image/png" ? img.png() : img.jpeg({ quality: 85, mozjpeg: true });
    return { bytes: new Uint8Array(await out.toBuffer()), kind };
  } catch {
    return null;
  }
}

/** Data URI para o render da peça; fotos guardadas antes da normalização ainda podem vir deitadas. */
export async function orientedDataUri(bytes: Uint8Array, mime: string): Promise<string> {
  let out: Uint8Array = bytes;
  try {
    const sharp = await loadSharp();
    const { orientation } = await sharp(bytes).metadata();
    if (orientation && orientation > 1) {
      const img = sharp(bytes).rotate();
      out = new Uint8Array(await (mime === "image/png" ? img.png() : img.jpeg({ quality: 90 })).toBuffer());
    }
  } catch {
    // Arquivo que o sharp não lê: segue como está (o render mostra o que conseguir).
  }
  return `data:${mime};base64,${Buffer.from(out).toString("base64")}`;
}
