import { Fragment, createElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreativeArtwork, renderableDesign } from "@/components/creative/artwork";
import { describeDesign } from "@/components/creative/creative-canvas";
import { destaquePairs } from "@/components/creative/templates/destaque";
import { faixaPairs } from "@/components/creative/templates/faixa";
import { minimalPairs } from "@/components/creative/templates/minimal";
import { ofertaPairs } from "@/components/creative/templates/oferta";
import { meets, type ContrastPair } from "@/components/creative/templates/shared";
import { BACKGROUND_STYLES, type CreativeDesign } from "@/contracts/creative";
import { CREATIVE_FORMATS, TEMPLATE_KEYS, type TemplateKey } from "@/contracts/strategy";
import { contrastRatio, minContrast } from "@/lib/creative/color";
import { formatCents } from "@/lib/money";

const FONTS = { display: "Plus Jakarta Sans", body: "Inter" };

const base: CreativeDesign = {
  format: "feed_4x5",
  template_key: "destaque",
  business_name: "Padaria Sabor do Bairro",
  headline: "Café da manhã completo",
  body: "Pão na chapa, café e suco natural.",
  cta: "Pedir no WhatsApp",
  show_price: true,
  price_cents: 2490,
  currency: "BRL",
  brand_color: "#C2410C",
  background: "gradiente",
};

type Props = { style?: CSSProperties; children?: ReactNode; className?: string; "data-fit"?: string };
type HostNode = { type: string; props: Props; fitAncestors: string[]; childCount: number; text: string };

/** Expande componentes (como o Satori faz) e devolve os elementos HTML resultantes. */
function hostNodes(node: ReactNode, fragments: { count: number }, fitAncestors: string[] = []): HostNode[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (Array.isArray(node)) return node.flatMap((child) => hostNodes(child, fragments, fitAncestors));
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Props>;
  if (element.type === Fragment) {
    fragments.count++;
    return hostNodes(element.props.children, fragments, fitAncestors);
  }
  if (typeof element.type === "function") {
    const render = element.type as (props: Props) => ReactNode;
    return hostNodes(render(element.props), fragments, fitAncestors);
  }
  const children = ([] as ReactNode[]).concat(element.props.children ?? []).flat(Infinity as 1);
  const meaningful = children.filter((c) => c !== null && c !== undefined && typeof c !== "boolean");
  const fit = element.props["data-fit"];
  const self: HostNode = {
    type: String(element.type),
    props: element.props,
    fitAncestors,
    childCount: meaningful.length,
    text: meaningful.filter((c) => typeof c === "string" || typeof c === "number").join(""),
  };
  return [self, ...hostNodes(element.props.children, fragments, fit ? [...fitAncestors, fit] : fitAncestors)];
}

function textOf(nodes: HostNode[], start: number): string {
  // Concatena o texto do nó e dos descendentes diretos (o preço tem símbolo + valor).
  return nodes
    .slice(start, start + 3)
    .map((n) => n.text)
    .join(" ");
}

const COMBOS = TEMPLATE_KEYS.flatMap((template_key) =>
  CREATIVE_FORMATS.flatMap((format) =>
    BACKGROUND_STYLES.flatMap((background) =>
      [true, false].map((show_price) => ({
        ...base,
        template_key,
        format,
        background,
        show_price,
        price_cents: show_price ? base.price_cents : null,
      })),
    ),
  ),
);

describe("templates compatíveis com Satori", () => {
  it.each(COMBOS.map((d) => [`${d.template_key}/${d.format}/${d.background}/${d.show_price ? "preço" : "sem"}`, d]))(
    "%s",
    (_name, design) => {
      const fragments = { count: 0 };
      const nodes = hostNodes(
        createElement(CreativeArtwork, { design: design as CreativeDesign, fonts: FONTS }),
        fragments,
      );
      const d = design as CreativeDesign;

      // Satori posiciona errado filhos de Fragment; todo elemento é flex; sem classes nem grid.
      expect(fragments.count).toBe(0);
      for (const n of nodes) {
        expect(n.type).toBe("div");
        expect(n.props.className).toBeUndefined();
        expect(n.props.style?.display).toBe("flex");
        for (const value of Object.values(n.props.style ?? {})) {
          if (typeof value === "string") expect(value).not.toMatch(/var\(/);
        }
      }

      // Raiz no tamanho nativo.
      expect(nodes[0].props.style?.width).toBe(1080);
      expect(nodes[0].props.style?.height).toBe(d.format === "feed_4x5" ? 1350 : 1920);

      // Todo texto medido fica dentro da coluna da área segura.
      const fits = nodes.filter((n) => n.props["data-fit"] && n.props["data-fit"] !== "layout");
      expect(fits.map((n) => n.props["data-fit"])).toEqual(
        expect.arrayContaining(["headline", "cta", "business_name"]),
      );
      for (const n of fits) expect(n.fitAncestors).toContain("layout");
      // Nenhum texto solto fora das caixas medidas (exceto a letra decorativa do minimal e o monograma).
      for (const n of nodes) {
        if (n.text && !n.props["data-fit"] && !n.fitAncestors.some((a) => a !== "layout")) {
          expect(n.text.length).toBeLessThanOrEqual(1);
        }
      }

      // Preço só quando show_price, sempre o valor formatado de price_cents.
      const priceIndex = nodes.findIndex((n) => n.props["data-fit"] === "price");
      if (d.show_price) {
        expect(priceIndex).toBeGreaterThan(-1);
        expect(textOf(nodes, priceIndex).replace(/\s+/g, " ").trim()).toBe(formatCents(2490).replace(/\s/g, " "));
      } else {
        expect(priceIndex).toBe(-1);
        expect(renderToStaticMarkup(createElement(CreativeArtwork, { design: d, fonts: FONTS }))).not.toContain("R$");
      }

      const html = renderToStaticMarkup(createElement(CreativeArtwork, { design: d, fonts: FONTS }));
      expect(html).toContain("Café da manhã completo");
      expect(html).toContain("Pedir no WhatsApp");
    },
  );

  it("remove emojis antes de desenhar (editor e PNG iguais)", () => {
    const design = { ...base, headline: "Café quentinho ☕", cta: "Peça já 👉" };
    expect(renderableDesign(design).headline).toBe("Café quentinho");
    const html = renderToStaticMarkup(createElement(CreativeArtwork, { design, fonts: FONTS }));
    expect(html).not.toContain("☕");
    expect(html).not.toContain("👉");
  });

  it("moeda com símbolo fora das fontes usa o código ISO (nada de fontes externas)", () => {
    const html = renderToStaticMarkup(
      createElement(CreativeArtwork, { design: { ...base, currency: "INR" }, fonts: FONTS }),
    );
    expect(html).toContain("INR");
    expect(html).not.toContain("₹");
    const euro = renderToStaticMarkup(
      createElement(CreativeArtwork, { design: { ...base, currency: "EUR" }, fonts: FONTS }),
    );
    expect(euro).toContain("€");
  });

  it("descrição acessível resume título, preço e botão", () => {
    expect(describeDesign(base)).toMatch(/Café da manhã completo\. .*Preço: R\$\s24,90\. Botão: Pedir no WhatsApp\.$/);
    expect(describeDesign({ ...base, show_price: false, price_cents: null })).not.toContain("Preço");
  });
});

const PAIRS: Record<TemplateKey, (d: CreativeDesign) => ContrastPair[]> = {
  destaque: destaquePairs,
  oferta: ofertaPairs,
  minimal: minimalPairs,
  faixa: faixaPairs,
};
const BRANDS = [
  "#FFFF00",
  "#111111",
  "#2A45E8",
  "#C2410C",
  "#FFFFFF",
  "#000000",
  "#22C55E",
  "#E11D48",
  "#7C3AED",
  "#0EA5E9",
  "#F59E0B",
  "#767676",
  "#FDE68A",
  "#1E293B",
];

describe("legibilidade com qualquer cor da marca", () => {
  const cases = TEMPLATE_KEYS.flatMap((t) =>
    BACKGROUND_STYLES.flatMap((bg) => BRANDS.map((brand) => [t, bg, brand] as const)),
  );
  it.each(cases)("%s / %s / %s", (template, background, brand) => {
    const pairs = PAIRS[template]({ ...base, template_key: template, background, brand_color: brand });
    for (const pair of pairs) {
      expect(
        meets(pair),
        `${pair.role}: ${pair.fg} sobre ${pair.bgs.join(", ")} = ${minContrast(pair.fg, pair.bgs).toFixed(2)}`,
      ).toBe(true);
    }
  });

  it("texto comum sempre ≥ 4,5:1 e títulos ≥ 3:1", () => {
    const pairs = PAIRS.destaque({ ...base, brand_color: "#2A45E8" });
    const body = pairs.find((p) => p.role === "texto")!;
    expect(body.min).toBe(4.5);
    expect(contrastRatio(body.fg, body.bgs[0])).toBeGreaterThanOrEqual(4.5);
  });
});
