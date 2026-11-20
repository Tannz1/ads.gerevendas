import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MAX_PHOTO_SIDE, normalizePhoto, orientedDataUri } from "@/server/photo";

/** Foto "deitada" com a etiqueta EXIF de girar 90°, como o celular grava uma foto tirada em pé. */
async function sidewaysPhoto(width = 400, height = 300) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (x < width / 2) raw[i] = 255;
      else raw[i + 2] = 255;
    }
  }
  return new Uint8Array(
    await sharp(raw, { raw: { width, height, channels: 3 } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer(),
  );
}

async function pixel(bytes: Uint8Array, x: number, y: number) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
}

describe("normalizePhoto", () => {
  it("aplica a rotação do EXIF e remove a etiqueta", async () => {
    const out = await normalizePhoto(await sidewaysPhoto());
    expect(out?.kind).toEqual({ mime: "image/jpeg", ext: "jpg" });
    const meta = await sharp(out!.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([300, 400]);
    expect(meta.orientation ?? 1).toBe(1);
    expect(meta.exif).toBeUndefined();
    // Em pé: vermelho em cima, azul embaixo.
    const [r1, , b1] = await pixel(out!.bytes, 150, 20);
    const [r2, , b2] = await pixel(out!.bytes, 150, 380);
    expect(r1).toBeGreaterThan(200);
    expect(b1).toBeLessThan(60);
    expect(b2).toBeGreaterThan(200);
    expect(r2).toBeLessThan(60);
  });

  it("reduz foto grande de celular sem aumentar foto pequena", async () => {
    const big = await normalizePhoto(await sidewaysPhoto(4000, 3000));
    const meta = await sharp(big!.bytes).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(MAX_PHOTO_SIDE);
    const small = await normalizePhoto(await sidewaysPhoto(40, 30));
    expect((await sharp(small!.bytes).metadata()).height).toBe(40);
  });

  it("mantém PNG com transparência como PNG", async () => {
    const png = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const out = await normalizePhoto(new Uint8Array(png));
    expect(out?.kind.mime).toBe("image/png");
    expect((await sharp(out!.bytes).metadata()).hasAlpha).toBe(true);
  });

  it("recusa o que não é JPG/PNG legível", async () => {
    expect(await normalizePhoto(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(await normalizePhoto(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBeNull();
  });
});

describe("orientedDataUri", () => {
  it("corrige fotos antigas guardadas com a etiqueta de rotação", async () => {
    const uri = await orientedDataUri(await sidewaysPhoto(), "image/jpeg");
    const bytes = new Uint8Array(Buffer.from(uri.split(",")[1], "base64"));
    const meta = await sharp(bytes).metadata();
    expect([meta.width, meta.height]).toEqual([300, 400]);
  });

  it("não recodifica imagem já em pé", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } })
      .png()
      .toBuffer();
    expect(await orientedDataUri(new Uint8Array(png), "image/png")).toBe(
      `data:image/png;base64,${png.toString("base64")}`,
    );
  });
});
