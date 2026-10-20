import { describe, expect, it } from "vitest";
import { ANGLE_KEYS, strategyPlanSchema } from "@/contracts/creatives";
import { initialContents } from "@/lib/creatives";
import { checkFacts } from "@/server/ai/facts";
import { buildImagePrompt } from "@/server/ai/image-prompt";
import { mockStrategy } from "@/server/ai/mock-text";
import { confirmedFacts } from "@/server/ai/prompt";
import type { StrategyInput } from "@/server/ai/types";

/**
 * Conjunto fixo de avaliação cobrindo 12 segmentos locais (docs/04_IA_CRIATIVOS.md):
 * - Com preço confirmado
 * - Sem preço informado (orçamento sob consulta)
 * - Com termos confirmados pelo cliente (ex.: "garantia" ou "promoção" que o próprio cliente escreveu)
 */
const EVALUATION_BRIEFS: Array<{ label: string; brandColor: string | null; input: StrategyInput }> = [
  {
    label: "1. Padaria / Alimentação com preço confirmado",
    brandColor: "#C2410C",
    input: {
      business: {
        name: "Padaria São Bento",
        segment: "Padaria e Confeitaria",
        city: "Campinas",
        state: "SP",
        tone_of_voice: "acolhedor",
      },
      offer: {
        name: "Combo Café da Manhã",
        description: "Pão na chapa, café coado na hora e suco de laranja natural.",
        price_cents: 2490,
        differentiators: ["Fornada fresca a cada 30 minutos", "Estacionamento próprio"],
      },
      audience: {
        description: "Moradores e trabalhadores do centro e Cambuí",
        age_min: 22,
        age_max: 60,
        service_radius_km: 4,
      },
      objective: "mensagens_whatsapp",
    },
  },
  {
    label: "2. Salão de beleza / Estética com preço confirmado",
    brandColor: "#9D174D",
    input: {
      business: {
        name: "Studio Bela Flor",
        segment: "Salão de Beleza",
        city: "Sorocaba",
        state: "SP",
        tone_of_voice: "direto",
      },
      offer: {
        name: "Escova e Hidratação Profunda",
        description: "Lavagem especial, máscara nutritiva e finalização com escova.",
        price_cents: 12000,
        differentiators: ["Atendimento com hora marcada", "Produtos hipoalergênicos"],
      },
      audience: {
        description: "Mulheres que buscam praticidade na rotina semanal",
        age_min: 25,
        age_max: 55,
        service_radius_km: 6,
      },
      objective: "mensagens_whatsapp",
    },
  },
  {
    label: "3. Oficina mecânica sem preço fixo (orçamento presencial)",
    brandColor: "#1E3A8A",
    input: {
      business: {
        name: "Auto Center Avenida",
        segment: "Oficina Mecânica",
        city: "Ribeirão Preto",
        state: "SP",
        tone_of_voice: "técnico",
      },
      offer: {
        name: "Revisão de Freios e Suspensão",
        description: "Diagnóstico completo do sistema de freios, pastilhas e amortecedores.",
        price_cents: null,
        differentiators: ["Checklist impresso antes do serviço", "Elevadores modernos"],
      },
      audience: {
        description: "Motoristas que rodam diariamente na cidade ou estrada",
        age_min: 25,
        age_max: 62,
        service_radius_km: 10,
      },
      objective: "mensagens_whatsapp",
    },
  },
  {
    label: "4. Clínica odontológica (setor sensível, sem preço na peça)",
    brandColor: "#0F766E",
    input: {
      business: {
        name: "Odonto Vida Clínica",
        segment: "Odontologia",
        city: "Jundiaí",
        state: "SP",
        tone_of_voice: "sereno",
      },
      offer: {
        name: "Avaliação e Profilaxia Dental",
        description: "Consulta inicial com avaliação clínica e limpeza preventiva.",
        price_cents: null,
        differentiators: ["Consultório no centro", "Atendimento aos sábados"],
      },
      audience: { description: "Famílias e adultos da região central", age_min: 20, age_max: 65, service_radius_km: 8 },
      objective: "mensagens_whatsapp",
    },
  },
  {
    label: "5. Pet shop / Banho e tosa com preço confirmado",
    brandColor: "#0369A1",
    input: {
      business: { name: "Amigo Fiel Pet", segment: "Pet Shop", city: "Santos", state: "SP", tone_of_voice: "alegre" },
      offer: {
        name: "Banho e Tosa Higiênica",
        description: "Banho morno com secagem silenciosa e corte de unhas incluso.",
        price_cents: 6500,
        differentiators: ["Visor de vidro para acompanhar", "Toalhas esterilizadas"],
      },
      audience: {
        description: "Tutores de cães de pequeno e médio porte",
        age_min: 21,
        age_max: 60,
        service_radius_km: 5,
      },
      objective: "visitas_perfil",
    },
  },
  {
    label: "6. Academia de bairro com mensalidade confirmada",
    brandColor: "#B91C1C",
    input: {
      business: {
        name: "Espaço Movimento",
        segment: "Academia e Treinamento",
        city: "Bauru",
        state: "SP",
        tone_of_voice: "motivador",
      },
      offer: {
        name: "Plano Mensal de Musculação",
        description: "Acesso livre à musculação e acompanhamento de instrutor de sala.",
        price_cents: 11990,
        differentiators: ["Ambiente climatizado", "Sem taxa de matrícula"],
      },
      audience: {
        description: "Moradores que querem treinar perto de casa",
        age_min: 18,
        age_max: 58,
        service_radius_km: 3,
      },
      objective: "mensagens_whatsapp",
    },
  },
  {
    label: "7. Assistência técnica com garantia confirmada pelo cliente no texto",
    brandColor: "#1D4ED8",
    input: {
      business: {
        name: "TecnoCell Reparos",
        segment: "Assistência Técnica de Celulares",
        city: "Piracicaba",
        state: "SP",
        tone_of_voice: "direto",
      },
      offer: {
        name: "Troca de Tela e Bateria",
        description: "Substituição rápida no mesmo dia com garantia de 90 dias na peça.",
        price_cents: 18000,
        differentiators: ["Laboratório à vista do cliente"],
      },
      audience: {
        description: "Pessoas que usam o celular para trabalho",
        age_min: 20,
        age_max: 55,
        service_radius_km: 7,
      },
      objective: "mensagens_whatsapp",
    },
  },
  {
    label: "8. Escola de idiomas local (tráfego para site)",
    brandColor: "#4338CA",
    input: {
      business: {
        name: "Talk Now Idiomas",
        segment: "Educação e Idiomas",
        city: "São José dos Campos",
        state: "SP",
        tone_of_voice: "profissional",
      },
      offer: {
        name: "Curso de Inglês em Turmas Reduzidas",
        description: "Aulas presenciais duas vezes por semana com até 6 alunos por sala.",
        price_cents: 28000,
        differentiators: ["Material didático incluso", "Horários noturnos e aos sábados"],
      },
      audience: {
        description: "Jovens e profissionais em busca de conversação",
        age_min: 18,
        age_max: 45,
        service_radius_km: 10,
      },
      objective: "trafego_site",
    },
  },
  {
    label: "9. Lavanderia doméstica por cesto",
    brandColor: "#0284C7",
    input: {
      business: {
        name: "Lavanderia Água Clara",
        segment: "Lavanderia",
        city: "Londrina",
        state: "PR",
        tone_of_voice: "prático",
      },
      offer: {
        name: "Cesto de Roupas Lavadas e Dobradas",
        description: "Lavagem, secagem e dobra de até 25 peças do dia a dia.",
        price_cents: 7900,
        differentiators: ["Coleta e entrega no bairro", "Entrega em 48 horas"],
      },
      audience: {
        description: "Pessoas com rotina corrida que moram em apartamento",
        age_min: 24,
        age_max: 55,
        service_radius_km: 5,
      },
      objective: "mensagens_whatsapp",
    },
  },
  {
    label: "10. Floricultura e presentes",
    brandColor: "#15803D",
    input: {
      business: {
        name: "Jardim da Serra Flores",
        segment: "Floricultura",
        city: "Curitiba",
        state: "PR",
        tone_of_voice: "delicado",
      },
      offer: {
        name: "Arranjo de Flores da Estação",
        description: "Buquê montado no dia com cartão personalizado e embalagem.",
        price_cents: 9500,
        differentiators: ["Entrega agendada por período"],
      },
      audience: {
        description: "Clientes que desejam presentear em datas especiais",
        age_min: 22,
        age_max: 60,
        service_radius_km: 12,
      },
      objective: "visitas_perfil",
    },
  },
  {
    label: "11. Marcenaria sob medida (sem preço fixo)",
    brandColor: "#78350F",
    input: {
      business: {
        name: "Móveis Artesanais Silva",
        segment: "Marcenaria",
        city: "Belo Horizonte",
        state: "MG",
        tone_of_voice: "confiável",
      },
      offer: {
        name: "Armários Planejados para Cozinha",
        description: "Projeto em MDF naval com ferragens de amortecimento e medição local.",
        price_cents: null,
        differentiators: ["Projeto 3D detalhado", "Montagem própria"],
      },
      audience: {
        description: "Proprietários reformando ou mudando de imóvel",
        age_min: 28,
        age_max: 62,
        service_radius_km: 20,
      },
      objective: "reconhecimento_local",
    },
  },
  {
    label: "12. Pizzaria artesanal de bairro",
    brandColor: "#991B1B",
    input: {
      business: {
        name: "Forno da Vila Pizzaria",
        segment: "Restaurante e Pizzaria",
        city: "Porto Alegre",
        state: "RS",
        tone_of_voice: "acolhedor",
      },
      offer: {
        name: "Pizza Grande de Fermentação Natural",
        description: "Massa maturada por 48 horas, molho de tomate italiano e muçarela.",
        price_cents: 6800,
        differentiators: ["Forno a lenha", "Pedido direto pelo WhatsApp"],
      },
      audience: {
        description: "Famílias e casais dos bairros vizinhos",
        age_min: 20,
        age_max: 60,
        service_radius_km: 6,
      },
      objective: "mensagens_whatsapp",
    },
  },
];

describe("dataset de avaliação de briefs (12 segmentos locais)", () => {
  it.each(EVALUATION_BRIEFS)("gera plano válido, sem violar fatos e com 5 peças: $label", ({ input, brandColor }) => {
    const plan = mockStrategy(input);
    const parsed = strategyPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);

    // 1. Checagem factual estrita
    const violations = checkFacts(plan, confirmedFacts(input));
    expect(violations).toEqual([]);

    // 2. Exatamente os 5 ângulos na ordem esperada
    expect(plan.angles.map((a) => a.key)).toEqual([...ANGLE_KEYS]);

    // 3. Peças iniciais respeitam preço confirmado vs ausente
    const contents = initialContents(plan, brandColor, input.offer.price_cents);
    expect(contents).toHaveLength(5);
    for (const item of contents) {
      if (input.offer.price_cents === null) {
        expect(item.content.show_price).toBe(false);
      }
      // Prompt de imagem para cada ângulo não pede texto nem preço
      const imgPrompt = buildImagePrompt(
        { segment: input.business.segment, offer_name: input.offer.name, city: input.business.city },
        item.angle_key,
      );
      expect(imgPrompt.toLowerCase()).toContain("sem nenhum texto");
    }
  });

  it("bloqueia qualquer plano em que a IA invente preço ou promessa não confirmada no dataset", () => {
    const sample = EVALUATION_BRIEFS[2]!.input; // Oficina sem preço
    const plan = mockStrategy(sample);
    plan.angles[0]!.body = "Revisão completa por R$ 99,90 com 50% de desconto garantido só hoje!";
    const violations = checkFacts(plan, confirmedFacts(sample));
    expect(violations.length).toBeGreaterThanOrEqual(3);
  });
});
