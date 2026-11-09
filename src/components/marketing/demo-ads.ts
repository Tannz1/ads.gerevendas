import type { CreativeContent } from "@/contracts/creatives";

/**
 * Dados FICTÍCIOS da landing, no mesmo formato que o editor grava (`CreativeContent`), para as peças
 * da LP saírem do renderizador real (`AdTemplate`). Negócios, ofertas e preços são inventados e
 * rotulados como exemplo na página. `photo` aponta para um arquivo em /public quando houver foto.
 */
export type DemoBusiness = {
  id: string;
  label: string;
  businessName: string;
  initials: string;
  /** O que o dono escreveu no cadastro: a IA usa só isso. */
  note: string;
  priceLabel: string | null;
  photo?: string;
  ad: CreativeContent;
};

const bakeryColors = { background: "#f6e3cc", accent: "#c2410c", text: "#3b1a08" };

export const DEMO_BUSINESSES: DemoBusiness[] = [
  {
    id: "padaria",
    label: "Padaria",
    businessName: "Padaria Pão Quente",
    initials: "PQ",
    note: "Café da manhã completo por R$ 24,90: pão na chapa, café e suco natural. Pedido pelo WhatsApp até as 10h.",
    priceLabel: "R$ 24,90",
    ad: {
      template: "oferta",
      headline: "Café da manhã completo",
      body: "Pão na chapa, café e suco natural",
      cta: "Pedir no WhatsApp",
      show_price: true,
      colors: bakeryColors,
    },
  },
  {
    id: "salao",
    label: "Salão",
    businessName: "Studio Bela Rosa",
    initials: "BR",
    note: "Toda terça, escova com hidratação por R$ 89. Agendamento pelo WhatsApp, com horário marcado.",
    priceLabel: "R$ 89,00",
    ad: {
      template: "oferta",
      headline: "Terça da escova",
      body: "Escova com hidratação, com hora marcada",
      cta: "Agendar horário",
      show_price: true,
      colors: { background: "#f5dbe6", accent: "#a3245d", text: "#3a0f24" },
    },
  },
  {
    id: "petshop",
    label: "Pet shop",
    businessName: "Cão Feliz Pet",
    initials: "CF",
    note: "Banho e tosa para cães pequenos, R$ 60. A gente busca e leva de volta aqui no bairro.",
    priceLabel: "R$ 60,00",
    ad: {
      template: "oferta",
      headline: "Banho e tosa com leva e traz",
      body: "Para cães de porte pequeno, aqui no bairro",
      cta: "Agendar banho",
      show_price: true,
      colors: { background: "#d8eedf", accent: "#15803d", text: "#0e3b24" },
    },
  },
  {
    id: "oficina",
    label: "Oficina",
    businessName: "Auto Center Silva",
    initials: "AS",
    note: "Troca de óleo com filtro por R$ 149. Não precisa marcar hora, é só chegar.",
    priceLabel: "R$ 149,00",
    ad: {
      template: "oferta",
      headline: "Troca de óleo sem marcar hora",
      body: "Óleo e filtro, é só chegar",
      cta: "Chamar no WhatsApp",
      show_price: true,
      colors: { background: "#dde3f2", accent: "#1d4ed8", text: "#0f1b3d" },
    },
  },
];

export const BAKERY = DEMO_BUSINESSES[0];

/** Uma rodada da padaria fictícia: as cinco composições, como o app entrega. */
export const BAKERY_ROUND: Array<{ ad: CreativeContent; stories?: boolean }> = [
  { ad: BAKERY.ad },
  {
    ad: {
      template: "problema",
      headline: "Sem tempo de tomar café em casa?",
      body: "A gente separa o seu pedido",
      cta: "Pedir no WhatsApp",
      show_price: false,
      colors: { background: "#3b1a08", accent: "#f59e0b", text: "#fdf2e3" },
    },
  },
  {
    ad: {
      template: "beneficio",
      headline: "Pão na chapa do jeito que você gosta",
      body: "Com manteiga ou requeijão",
      cta: "Pedir no WhatsApp",
      show_price: false,
      colors: bakeryColors,
    },
    stories: true,
  },
  {
    ad: {
      template: "demonstracao",
      headline: "Pão, café e suco na mesma bandeja",
      body: "Café da manhã completo",
      cta: "Pedir no WhatsApp",
      show_price: true,
      colors: { background: "#fff7ee", accent: "#c2410c", text: "#3b1a08" },
    },
  },
  {
    ad: {
      template: "conveniencia",
      headline: "Peça até as 10h pelo WhatsApp",
      body: "Retire no balcão sem fila",
      cta: "Pedir no WhatsApp",
      show_price: false,
      colors: bakeryColors,
    },
  },
];
