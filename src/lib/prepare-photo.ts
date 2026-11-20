/** Maior lado enviado ao servidor. Igual a MAX_PHOTO_SIDE do servidor, que normaliza de novo. */
const MAX_SIDE = 2048;
/** JPG/PNG até este tamanho segue como está: o servidor já corrige rotação e reduz. */
const KEEP_BYTES = 1.5 * 1024 * 1024;

/**
 * Reduz a foto no navegador antes de enviar: fotos de celular passam fácil de 5–15 MB (e do limite das
 * server actions) e podem vir em WebP/HEIC. Desenha já em pé (EXIF aplicado) e gera um JPG de até
 * 2048 px. Se o navegador não conseguir ler o arquivo (ex.: HEIC no Chrome), devolve o original e o
 * servidor responde com a mensagem de formato.
 */
export async function preparePhoto(file: File): Promise<File> {
  const accepted = file.type === "image/jpeg" || file.type === "image/png";
  if (accepted && file.size <= KEEP_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // PNG (ex.: logotipo) pode ter transparência: continua PNG.
    const png = file.type === "image/png";
    if (!png) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const type = png ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob || (accepted && blob.size >= file.size)) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + (png ? ".png" : ".jpg");
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}

/** Troca, no FormData, o arquivo do campo pela versão reduzida. */
export async function preparePhotoField(formData: FormData, field = "file"): Promise<FormData> {
  const file = formData.get(field);
  if (file instanceof File && file.size > 0) formData.set(field, await preparePhoto(file));
  return formData;
}

/** Mensagem quando o envio nem chega ao servidor (rede caiu ou arquivo grande demais). */
export const PHOTO_SEND_FAILED = "Não foi possível enviar a foto. Confira sua internet ou tente uma foto menor.";
