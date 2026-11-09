import type { Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { BrandMark } from "@/components/marketing/brand-mark";
import { Carousel } from "@/components/marketing/carousel";
import { BAKERY, BAKERY_ROUND } from "@/components/marketing/demo-ads";
import { FluidAd } from "@/components/marketing/fluid-ad";
import { ScrollTourSection } from "@/components/marketing/scroll-tour";
import { TEMPLATE_LABELS } from "@/contracts/creatives";
import { cn } from "@/lib/cn";

// Sora: fonte da marca Gere Vendas (texto corrido). Os títulos usam Archivo largo (letreiro), já no layout raiz.
const sora = localFont({
  src: "./fonts/sora-latin.woff2",
  variable: "--font-sora",
  weight: "300 800",
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#ffffff" };

const CRM_URL = "https://www.gerevendascrm.com.br/";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * LP "o balcão do bairro" para o dono de negócio local, que lê no celular e já tentou anunciar.
 * Linguagem visual do comércio de rua: título em letreiro de fachada e a etiqueta amarela de preço
 * (o único elemento chamativo). Só fatos do produto: sem depoimentos nem números inventados.
 */

const faq = [
  {
    q: "Tem fidelidade ou multa para sair?",
    a: "Não. São R$ 199 por mês no piloto, sem fidelidade. Você usa enquanto fizer sentido para o seu negócio.",
  },
  {
    q: "Preciso entender de tráfego pago?",
    a: "Não. Você manda a foto do produto, diz o preço e escolhe a região e o valor por dia. Os textos, as versões do anúncio e a campanha saem dessas respostas.",
  },
  {
    q: "Funciona para o meu tipo de negócio?",
    a: "Funciona melhor para quem vende no bairro e atende pelo WhatsApp: comércio, alimentação, beleza, pet, oficina e serviços. Se o cliente pode te chamar para comprar ou agendar, faz sentido.",
  },
  {
    q: "A IA pode inventar promoção, preço ou depoimento?",
    a: "Não. Ela só usa o que você escreveu: preço, parcelamento, desconto ou entrega entram no anúncio só se você informou. E você revisa tudo antes de publicar.",
  },
  {
    q: "Preciso ter Instagram ou página no Facebook?",
    a: "Você precisa de uma Página no Facebook e pode ligar o Instagram do negócio. A conexão é feita dentro do app, com cada passo explicado.",
  },
  {
    q: "Quando o anúncio começa a aparecer?",
    a: "O anúncio é criado pausado. Depois que você confirma o valor e a verba é paga, ele é ativado e passa pela revisão da Meta, que avalia todo anúncio antes de mostrar.",
  },
];

export default function Home() {
  return (
    <div className={cn(sora.variable, "overflow-x-clip bg-white font-lp text-lp-tinta")}>
      <Header />
      <main>
        <Hero />
        <Pains />
        <ScrollTourSection />
        <Video />
        <Vitrine />
        <Comparison />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

/* ---------------------------------------------------------------- topo */

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-lp-linha bg-white/92 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 px-5 sm:px-8">
        <BrandLogo />
        <nav aria-label="Principal" className="hidden items-center gap-8 text-[15px] font-medium text-lp-cinza lg:flex">
          <a href="#como-funciona" className="hover:text-lp-tinta">
            Como funciona
          </a>
          <a href="#preco" className="hover:text-lp-tinta">
            Preço
          </a>
          <a href="#duvidas" className="hover:text-lp-tinta">
            Dúvidas
          </a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-5">
          <Link href="/entrar" className="hidden text-[15px] font-semibold text-lp-cinza hover:text-lp-tinta sm:block">
            Entrar
          </Link>
          <CtaLink size="sm">Criar meu anúncio</CtaLink>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="bg-white">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-10 px-5 pt-8 pb-12 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 lg:pt-14 lg:pb-16">
        <div>
          <h1 className="lp-letreiro text-[clamp(2.6rem,10vw,5rem)] leading-[0.98] text-balance">
            Seu produto é bom. Falta gente ver.
          </h1>
          <p className="mt-5 max-w-[31rem] text-[18px] leading-relaxed text-lp-cinza sm:text-[20px]">
            Mande a foto do produto e o GereVendas Ads coloca o seu anúncio no Instagram e no Facebook para quem está
            perto. Quem se interessa chama você direto no WhatsApp.
          </p>
          <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
            <CtaLink size="lg" className="w-full sm:w-auto">
              Criar meu anúncio
            </CtaLink>
            <a
              href="#video"
              className="inline-flex items-center justify-center gap-2 text-[16px] font-semibold text-lp-tinta underline decoration-lp-verde decoration-2 underline-offset-4 hover:text-lp-verde"
            >
              Ver o app em 2 minutos
            </a>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="lp-etiqueta text-[18px] font-bold">R$ 199 por mês</span>
            <span className="text-[15px] text-lp-cinza">sem fidelidade e só roda com o seu ok</span>
          </div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

/** A dona do negócio recebendo a conversa que o anúncio trouxe. Pessoa, negócio e conversa são ilustrativos. */
function HeroVisual() {
  return (
    <figure className="mx-auto w-full max-w-[460px] lg:mr-0 lg:ml-auto">
      <div className="relative rounded-[28px] bg-lp-claro p-3 sm:p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática da LP, já otimizada */}
        <img
          src={`${base}/lp/dona-padaria.jpg`}
          alt="Dona de padaria sorrindo enquanto olha o celular no balcão"
          width={880}
          height={1320}
          fetchPriority="high"
          className="aspect-[4/5] w-full rounded-[20px] object-cover"
        />
        <div className="absolute top-[12%] -left-2 w-[70%] max-w-[280px] rounded-2xl bg-white p-3 shadow-[0_18px_40px_-18px_rgb(16_35_26/0.45)] sm:-left-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#25d366] text-white">
              <WhatsIcon className="size-4" />
            </span>
            <p className="text-[13px] leading-tight font-bold">
              Nova mensagem
              <span className="block text-[12px] font-normal text-lp-cinza">WhatsApp, agora</span>
            </p>
          </div>
          <p className="mt-2 rounded-xl bg-[#e7fbe3] px-3 py-2 text-[14px] leading-snug">
            Oi! Vi o anúncio. Ainda tem o café da manhã completo?
          </p>
        </div>
        <div className="absolute -right-2 bottom-[9%] flex w-[64%] max-w-[260px] items-center gap-3 rounded-2xl bg-white p-2.5 shadow-[0_18px_40px_-18px_rgb(16_35_26/0.45)] sm:-right-6">
          <div className="w-12 shrink-0 overflow-hidden rounded-lg">
            <FluidAd
              format="feed"
              content={BAKERY.ad}
              businessName={BAKERY.businessName}
              priceLabel={BAKERY.priceLabel}
              imageSrc={BAKERY.photo ?? null}
            />
          </div>
          <p className="min-w-0 text-[13px] leading-tight font-bold">
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-lp-verde">
              <span className="size-1.5 rounded-full bg-lp-verde" />
              Anúncio no ar
            </span>
            <span className="mt-0.5 block truncate">{BAKERY.ad.headline}</span>
          </p>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[13px] text-lp-cinza lg:text-right">
        Exemplo ilustrativo, com negócio fictício
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------- dor */

function Pains() {
  const falas = [
    "Posto todo dia e quase ninguém vê.",
    "Já impulsionei, gastei e não chegou nenhum cliente.",
    "Não tenho tempo pra aprender o Gerenciador de Anúncios.",
  ];
  return (
    <section aria-labelledby="dor-titulo" className="bg-lp-claro">
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
        <h2 id="dor-titulo" className="lp-letreiro text-[clamp(1.9rem,6vw,3.1rem)] leading-[1.04]">
          Soa familiar?
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-3">
          {falas.map((f) => (
            <li
              key={f}
              className="border-l-4 border-lp-verde pl-5 text-[clamp(1.2rem,3.6vw,1.45rem)] leading-snug font-semibold"
            >
              “{f}”
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-3xl text-[18px] leading-relaxed sm:text-[20px]">
          Não é falta de produto bom. É falta da pessoa certa ver. O GereVendas Ads mostra o seu produto para quem está
          perto e quer comprar, e leva essa pessoa direto para o seu WhatsApp.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- vídeo */

function Video() {
  return (
    <section id="video" aria-labelledby="video-titulo" className="scroll-mt-16 bg-lp-claro">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12 lg:py-20">
        <div>
          <h2 id="video-titulo" className="lp-letreiro text-[clamp(1.9rem,6vw,3.1rem)] leading-[1.04]">
            Prefere ver funcionando?
          </h2>
          <p className="mt-3 max-w-md text-[17px] leading-relaxed text-lp-cinza">
            Em 2 minutos, o caminho inteiro: da foto do produto até a conversa no WhatsApp, com a tela do app.
          </p>
          <CtaLink size="lg" className="mt-7 hidden lg:inline-flex">
            Criar meu anúncio
          </CtaLink>
        </div>
        <figure>
          {/* No celular, a versão vertical (texto maior); no computador, a horizontal. Só carregam no play. */}
          <video
            controls
            preload="none"
            playsInline
            poster={`${base}/lp/apresentacao-vertical-capa.jpg`}
            className="mx-auto aspect-[9/16] w-full max-w-[380px] rounded-[24px] bg-lp-tinta lg:hidden"
          >
            <source src={`${base}/lp/apresentacao-vertical.mp4`} type="video/mp4" />
          </video>
          <video
            controls
            preload="none"
            playsInline
            poster={`${base}/lp/apresentacao-capa.jpg`}
            className="hidden aspect-video w-full rounded-[24px] bg-lp-tinta lg:block"
          >
            <source src={`${base}/lp/apresentacao.mp4`} type="video/mp4" />
          </video>
          <figcaption className="mt-3 text-center text-[14px] text-lp-cinza lg:text-left">
            Negócio e números de exemplo.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- vitrine */

function Vitrine() {
  return (
    <section aria-labelledby="vitrine-titulo" className="bg-white">
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-end lg:gap-12">
          <h2 id="vitrine-titulo" className="lp-letreiro text-[clamp(1.9rem,6vw,3.1rem)] leading-[1.04]">
            Uma foto, cinco anúncios diferentes
          </h2>
          <p className="text-[17px] leading-relaxed text-lp-cinza">
            Cada versão chama o cliente de um jeito. Elas rodam juntas e a Meta mostra mais a que traz mais conversas.
          </p>
        </div>
        <div className="mt-9">
          <Carousel label="Exemplos de versões do anúncio" desktopFrom="lg" gridClassName="lg:grid-cols-5 lg:gap-5">
            {BAKERY_ROUND.map(({ ad }, i) => (
              <div key={ad.template}>
                <div className="overflow-hidden rounded-2xl">
                  <FluidAd
                    format="feed"
                    content={ad}
                    businessName={BAKERY.businessName}
                    priceLabel={BAKERY.priceLabel}
                    imageSrc={BAKERY.photo ?? null}
                  />
                </div>
                <p className="mt-3 text-center text-[15px] font-semibold lg:text-left">
                  {i + 1}. {TEMPLATE_LABELS[ad.template]}
                </p>
              </div>
            ))}
          </Carousel>
          {/* Prateleira da vitrine */}
          <div aria-hidden className="mt-4 hidden h-2.5 rounded-full bg-lp-verde lg:block" />
        </div>
        <p className="mt-5 text-[14px] text-lp-cinza">Padaria fictícia, só para mostrar o formato.</p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- comparação */

const COMPARA = {
  linhas: [
    "Quem faz o anúncio",
    "Tempo até ficar pronto",
    "Custo fixo",
    "Precisa entender de tráfego",
    "Controle do gasto",
  ],
  colunas: [
    {
      nome: "Agência",
      valores: ["A agência", "Dias de briefing e aprovação", "Contrato mensal", "Não", "Depende da agência"],
    },
    {
      nome: "Fazer sozinho",
      valores: ["Você", "Horas aprendendo", "Sem mensalidade, mas o seu tempo", "Sim", "Fácil errar no orçamento"],
    },
    {
      nome: "GereVendas Ads",
      valores: [
        "A IA, com a sua foto",
        "Poucos minutos",
        "R$ 199 por mês, sem fidelidade",
        "Não",
        "Teto fechado e pausa em um toque",
      ],
    },
  ],
};

function Comparison() {
  const [agencia, sozinho, nos] = COMPARA.colunas;
  return (
    <section aria-labelledby="comparar-titulo" className="bg-lp-claro">
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
        <h2 id="comparar-titulo" className="lp-letreiro max-w-3xl text-[clamp(1.9rem,6vw,3.1rem)] leading-[1.04]">
          Sem agência e sem curso de tráfego
        </h2>

        {/* Computador: tabela */}
        <table className="mt-9 hidden w-full border-collapse overflow-hidden rounded-2xl bg-white text-left md:table">
          <thead>
            <tr className="border-b border-lp-linha">
              <th scope="col" className="w-[24%] p-4" />
              <th scope="col" className="p-4 text-[16px] font-semibold text-lp-cinza">
                {agencia.nome}
              </th>
              <th scope="col" className="p-4 text-[16px] font-semibold text-lp-cinza">
                {sozinho.nome}
              </th>
              <th scope="col" className="bg-lp-verde p-4 text-[17px] font-bold text-white">
                {nos.nome}
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARA.linhas.map((l, i) => (
              <tr key={l} className="border-b border-lp-linha last:border-0">
                <th scope="row" className="p-4 text-[15px] font-semibold">
                  {l}
                </th>
                <td className="p-4 text-[15px] text-lp-cinza">{agencia.valores[i]}</td>
                <td className="p-4 text-[15px] text-lp-cinza">{sozinho.valores[i]}</td>
                <td className="bg-lp-verde/8 p-4 text-[15px] font-semibold text-lp-verde-escuro">{nos.valores[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Celular: uma pergunta por bloco, GereVendas Ads em destaque */}
        <dl className="mt-8 grid gap-3 md:hidden">
          {COMPARA.linhas.map((l, i) => (
            <div key={l} className="rounded-2xl bg-white p-4">
              <dt className="text-[15px] font-bold">{l}</dt>
              <dd className="mt-2 grid gap-1 text-[15px]">
                <span className="text-lp-cinza">
                  {agencia.nome}: {agencia.valores[i]}
                </span>
                <span className="text-lp-cinza">
                  {sozinho.nome}: {sozinho.valores[i]}
                </span>
                <span className="font-semibold text-lp-verde-escuro">
                  {nos.nome}: {nos.valores[i]}
                </span>
              </dd>
            </div>
          ))}
        </dl>
        <CtaLink size="lg" className="mt-9 w-full sm:w-auto">
          Criar meu anúncio
        </CtaLink>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- preço */

function Pricing() {
  const incluso = [
    "Cinco versões do anúncio a cada produto, para feed e stories",
    "A foto do seu produto em todas as versões",
    "Campanha montada no Instagram e no Facebook",
    "Clientes chamando direto no seu WhatsApp",
    "Investido, conversas e custo por conversa",
    "Registro das vendas que vieram das conversas",
  ];
  const verba = [
    ["Teste de 1 semana", "R$ 10 por dia, 7 dias", "R$ 70"],
    ["Uma semana forte", "R$ 20 por dia, 7 dias", "R$ 140"],
    ["O mês inteiro", "R$ 10 por dia, 30 dias", "R$ 300"],
  ];
  const controle = [
    ["O anúncio nasce pausado", "Nada é gasto até você confirmar."],
    ["O gasto tem teto", "Nunca passa do total que você escolheu."],
    ["A IA não inventa", "Preço e promoção só se você escreveu."],
    ["Pausa com um toque", "Sem ligar para ninguém."],
  ];
  return (
    <section id="preco" aria-labelledby="preco-titulo" className="scroll-mt-16 bg-white">
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
        <h2 id="preco-titulo" className="lp-letreiro max-w-3xl text-[clamp(1.9rem,6vw,3.1rem)] leading-[1.04]">
          Quanto custa, sem letra miúda
        </h2>

        <div className="mt-9 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="text-[17px] font-semibold">A ferramenta</p>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="lp-etiqueta text-[clamp(1.8rem,7vw,2.6rem)] leading-none font-bold">R$ 199</span>
              <span className="text-[17px] text-lp-cinza">por mês, sem fidelidade</span>
            </p>
            <ul className="mt-6 grid gap-2.5 text-[16px]">
              {incluso.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-lp-verde" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-[17px] font-semibold">A verba dos anúncios</p>
            <p className="mt-2 text-[16px] leading-relaxed text-lp-cinza">
              A verba dos anúncios não está incluída na mensalidade: você escolhe o valor a cada anúncio e paga à parte.
              Por exemplo:
            </p>
            <ul className="mt-5 grid gap-3">
              {verba.map(([titulo, conta, total]) => (
                <li
                  key={titulo}
                  className="flex items-center justify-between gap-4 border-b border-lp-linha pb-3 last:border-0"
                >
                  <span>
                    <span className="block text-[16px] font-semibold">{titulo}</span>
                    <span className="text-[15px] text-lp-cinza">{conta}</span>
                  </span>
                  <span className="lp-etiqueta shrink-0 text-[18px] font-bold">{total}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* O dinheiro sob controle */}
        <div className="mt-12 rounded-[24px] bg-lp-verde p-6 text-white sm:p-9">
          <p className="lp-letreiro text-[clamp(1.6rem,5vw,2.4rem)] leading-[1.05]">Nenhum real sai sem o seu ok.</p>
          <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {controle.map(([t, d]) => (
              <li key={t}>
                <p className="text-[17px] font-bold">{t}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-white/80">{d}</p>
              </li>
            ))}
          </ul>
        </div>

        <CtaLink size="lg" className="mt-9 w-full sm:w-auto">
          Quero começar agora
        </CtaLink>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- dúvidas */

function Faq() {
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="scroll-mt-16 bg-lp-claro">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-6 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-12 lg:py-20">
        <h2 id="duvidas-titulo" className="lp-letreiro text-[clamp(1.9rem,6vw,3.1rem)] leading-[1.04]">
          Dúvidas comuns
        </h2>
        <div className="divide-y divide-lp-linha border-y border-lp-linha">
          {faq.map((f) => (
            <details key={f.q} className="lp-faq group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-semibold">
                {f.q}
                <span
                  aria-hidden
                  className="lp-faq-icon grid size-8 shrink-0 place-items-center rounded-full bg-white text-xl leading-none text-lp-verde transition-transform"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-[16px] leading-relaxed text-lp-cinza">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- fechamento */

function FinalCta() {
  const passos = [
    ["Crie sua conta", "Nome, cidade e o WhatsApp do negócio."],
    ["Conecte a sua Página", "Facebook e Instagram, com cada passo explicado."],
    ["Mande a primeira foto", "Preço, região e valor. Confira e confirme."],
  ];
  return (
    <section className="bg-lp-verde text-white">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-14 lg:py-20">
        <div>
          <h2 className="lp-letreiro text-[clamp(2rem,7vw,3.6rem)] leading-[1.02]">
            O seu cliente já está no Instagram. Falta ele ver você.
          </h2>
          <Link
            href="/entrar"
            className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-2xl bg-white px-7 text-[17px] font-bold whitespace-nowrap text-lp-verde-escuro transition-colors hover:bg-lp-claro sm:w-auto"
          >
            Criar meu anúncio
          </Link>
        </div>
        <ol className="grid gap-5">
          {passos.map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[17px] font-bold text-lp-verde">
                {i + 1}
              </span>
              <span>
                <span className="block text-[18px] font-bold">{t}</span>
                <span className="text-[16px] text-white/80">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-lp-verde-escuro text-white/75">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-white">
          <BrandMark className="h-7 w-auto" />
          <span className="rounded-md bg-white px-1.5 py-0.5 text-xs leading-none font-bold text-lp-verde">Ads</span>
        </div>
        <nav aria-label="Rodapé" className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          <Link href="/entrar" className="hover:text-white">
            Entrar
          </Link>
          <a href="#preco" className="hover:text-white">
            Preço
          </a>
          <a href={CRM_URL} className="hover:text-white">
            Conheça o Gere Vendas CRM
          </a>
        </nav>
      </div>
      <div className="mx-auto max-w-[1180px] border-t border-white/15 px-5 py-5 text-[13px] sm:px-8">
        © 2026 GereVendas Ads. Publicação na Meta sujeita à revisão e às políticas da plataforma.
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------- peças pequenas */

function CtaLink({ size, className, children }: { size: "sm" | "lg"; className?: string; children: ReactNode }) {
  return (
    <Link
      href="/entrar"
      className={cn(
        "inline-flex items-center justify-center rounded-2xl bg-lp-verde font-bold whitespace-nowrap text-white transition-colors hover:bg-lp-verde-escuro",
        size === "sm" ? "h-10 px-4 text-[14px]" : "h-14 px-7 text-[17px]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function WhatsIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}
