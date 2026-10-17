export type ImageKind = { mime: "image/jpeg" | "image/png"; ext: "jpg" | "png" };

/** Identifica JPEG/PNG pelos primeiros bytes (assinatura do arquivo), nunca pelo nome ou pelo tipo declarado. */
export function detectImage(bytes: Uint8Array): ImageKind | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return { mime: "image/png", ext: "png" };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  return null;
}

/** Limite de foto enviada pelo cliente (o bodySizeLimit das server actions tem folga acima disso). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
