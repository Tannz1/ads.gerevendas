import type { Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { Carousel } from "@/components/marketing/carousel";
import { BAKERY, BAKERY_ROUND } from "@/components/marketing/demo-ads";
import { FluidAd } from "@/components/marketing/fluid-ad";
import { Storyboard } from "@/components/marketing/storyboard";
import { TEMPLATE_LABELS } from "@/contracts/creatives";
import { cn } from "@/lib/cn";

// Sora: fonte da marca Gere Vendas (site do CRM). Arquivo local, OFL, para o build não depender do Google Fonts.
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
 * LP comercial para o dono de negócio local: lê no celular, tem pouco tempo e já tentou anunciar.
 * Ordem: a dor, a saída em 3 passos (com vídeo), as telas, o controle do dinheiro, o preço e dúvidas.
 */

const included = [
  "Sem fidelidade: você usa enquanto fizer sentido",
  "Cinco versões do anúncio a cada produto, para feed e stories",
  "A foto do seu produto em todas as versões",
  "Campanha montada no Instagram e no Facebook",
  "Clientes chamando direto no seu WhatsApp",
  "Painel com investimento, conversas e custo por conversa",
  "Registro das vendas que vieram das conversas",
];

const faq = [
  {
    q: "Tem fidelidade ou multa para sair?",
    a: "Não. São R$ 199 por mês no piloto, sem fidelidade. Você usa enquanto fizer sentido para o seu negócio.",
  },
  {
    q: "Funciona para o meu tipo de negócio?",
    a: "Funciona melhor para quem vende no bairro e atende pelo WhatsApp: comércio, alimentação, beleza, pet, oficina e serviços. Se o cliente pode te chamar para comprar ou agendar, faz sentido.",
  },
  {
    q: "Preciso entender de tráfego pago?",
    a: "Não. Você manda a foto do produto, diz o preço e escolhe a região e o valor por dia. Os textos, as versões do anúncio e a campanha saem dessas respostas.",
  },
  {
    q: "Preciso ter Instagram ou página no Facebook?",
    a: "Você precisa de uma Página no Facebook e pode ligar o Instagram do negócio. A conexão é feita dentro do app, com cada passo explicado.",
  },
  {
    q: "A IA pode inventar promoção, preço ou depoimento?",
    a: "Não. Ela só usa o que você escreveu: preço, parcelamento, desconto ou entrega entram no anúncio só se você informou. E você revisa tudo antes de publicar.",
  },
  {
    q: "Quanto vou gastar com os anúncios?",
    a: "Você escolhe o valor por dia (a partir de R$ 10) e por quantos dias. Essa verba é cobrada à parte da mensalidade e o gasto nunca passa do total que você confirmou.",
  },
  {
    q: "A foto pode ser do celular?",
    a: "Pode. O anúncio começa pela foto do seu produto, em JPG ou PNG de até 5 MB. Boa luz e o produto em destaque já bastam.",
  },
  {
    q: "Quando o anúncio começa a aparecer?",
    a: "O anúncio é criado pausado. Depois que você confirma o valor e a verba é paga, ele é ativado e passa pela revisão da Meta, que avalia todo anúncio antes de mostrar.",
  },
];

export default function Home() {
  return (
    <div className={cn(sora.variable, "overflow-x-clip bg-white font-lp text-gv-ink")}>
      <Header />
      <main>
        <Hero />
        <Pains />
        <Benefits />
        <HowItWorks />
        <ForWho />
        <Storyboard />
        <Showcase />
        <Comparison />
        <Control />
        <Pricing />
        <GetStarted />
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
    <header className="sticky top-0 z-30 border-b border-gv-line/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
        <BrandLogo />
        <nav aria-label="Principal" className="hidden items-center gap-8 text-[15px] font-medium text-gv-mute lg:flex">
          <a href="#como-funciona" className="hover:text-gv-ink">
            Como funciona
          </a>
          <a href="#preco" className="hover:text-gv-ink">
            Preço
          </a>
          <a href="#duvidas" className="hover:text-gv-ink">
            Dúvidas
          </a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link href="/entrar" className="hidden text-[15px] font-semibold text-gv-mute hover:text-gv-ink sm:block">
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
    <section className="relative overflow-hidden bg-[#f3faf5]">
      {/* Brilho suave do verde da marca, atrás da foto. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] size-[720px] rounded-full bg-[radial-gradient(closest-side,rgb(34_197_94/0.22),transparent)]"
      />
      <div className="relative mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-5 pt-10 pb-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:pt-16 lg:pb-24">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[14px] font-semibold text-gv-green shadow-[0_4px_14px_-6px_rgb(6_40_20/0.25)]">
            <span aria-hidden className="size-2 rounded-full bg-gv-glow" />
            Para quem vende no bairro
          </p>
          <h1 className="mt-5 text-[clamp(2.6rem,9.5vw,4.6rem)] leading-[1] font-bold tracking-[-0.05em] text-balance text-gv-ink">
            Seu produto é bom. <span className="text-gv-green">Falta gente ver.</span>
          </h1>
          <p className="mt-6 max-w-[30rem] text-[18px] leading-relaxed text-gv-mute sm:text-[20px]">
            Mande a foto do produto e o GereVendas Ads coloca o seu anúncio no Instagram e no Facebook para quem está
            perto. Quem se interessa chama você direto no WhatsApp.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <CtaLink size="lg" className="w-full sm:w-auto">
              Criar meu anúncio agora
            </CtaLink>
            <a
              href="#passos"
              className="inline-flex h-12 items-center justify-center gap-2.5 text-[16px] font-semibold text-gv-ink hover:text-gv-green"
            >
              <span className="grid size-10 place-items-center rounded-full bg-white shadow-[0_6px_16px_-8px_rgb(6_40_20/0.4)]">
                <svg aria-hidden viewBox="0 0 24 24" className="ml-0.5 size-4 text-gv-green" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
              </span>
              Ver em 2 minutos
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-[15px] font-medium text-gv-ink/80">
            {["R$ 199/mês no piloto", "Sem fidelidade", "Só roda com o seu ok"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="text-gv-green">
                  <CheckIcon />
                </span>
                {t}
              </li>
            ))}
          </ul>
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
      <div className="relative px-3 pt-6 pb-10 sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática da LP, já otimizada */}
        <img
          src={`${base}/lp/dona-padaria.jpg`}
          alt="Dona de padaria sorrindo enquanto olha o celular no balcão"
          width={880}
          height={1320}
          fetchPriority="high"
          className="aspect-[4/5] w-full rounded-[32px] object-cover shadow-[0_40px_80px_-40px_rgb(6_40_20/0.55)]"
        />

        {/* Mensagem chegando no WhatsApp */}
        <div className="absolute top-[14%] left-0 w-[68%] max-w-[280px] rounded-2xl bg-white p-3.5 shadow-[0_24px_48px_-20px_rgb(6_40_20/0.45)]">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#25d366] text-white">
              <WhatsIcon className="size-5" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-[13px] font-bold">Nova mensagem</p>
              <p className="text-[12px] text-gv-mute">WhatsApp · agora</p>
            </div>
          </div>
          <p className="mt-2.5 rounded-xl bg-[#e7fbe3] px-3 py-2 text-[14px] leading-snug text-[#111b21]">
            Oi! Vi o anúncio. Ainda tem o café da manhã completo?
          </p>
        </div>

        {/* O anúncio que trouxe a conversa */}
        <div className="absolute right-0 bottom-0 flex w-[66%] max-w-[270px] items-center gap-3 rounded-2xl bg-white p-2.5 shadow-[0_24px_48px_-20px_rgb(6_40_20/0.45)]">
          <div className="w-14 shrink-0 overflow-hidden rounded-lg">
            <FluidAd
              format="feed"
              content={BAKERY.ad}
              businessName={BAKERY.businessName}
              priceLabel={BAKERY.priceLabel}
              imageSrc={BAKERY.photo ?? null}
            />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-gv-green">
              <span className="size-1.5 rounded-full bg-gv-glow" />
              Anúncio no ar
            </p>
            <p className="mt-0.5 truncate text-[13.5px] font-bold">{BAKERY.ad.headline}</p>
            <p className="text-[12px] text-gv-mute">Instagram e Facebook</p>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-[13px] text-gv-mute lg:text-right">
        Exemplo ilustrativo, com negócio fictício
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------- dor */

function Pains() {
  const pains = [
    {
      title: "Posta todo dia e quase ninguém vê",
      text: "O alcance do perfil caiu e o post fica só para quem já te segue.",
    },
    {
      title: "Já impulsionou e o dinheiro sumiu",
      text: "Gastou, vieram curtidas de longe e nenhuma mensagem de cliente.",
    },
    {
      title: "Não tem tempo para aprender anúncio",
      text: "Arte, texto, público, orçamento… o Gerenciador de Anúncios assusta.",
    },
  ];
  return (
    <section aria-labelledby="dor-titulo" className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-24">
        <h2
          id="dor-titulo"
          className="max-w-2xl text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]"
        >
          Isso acontece com você?
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          {pains.map((p) => (
            <li key={p.title} className="rounded-3xl border border-gv-line bg-gv-paper p-6">
              <span aria-hidden className="grid size-10 place-items-center rounded-full bg-[#fde7e4] text-[#c0392b]">
                <CrossIcon />
              </span>
              <h3 className="mt-4 text-[19px] leading-snug font-bold">{p.title}</h3>
              <p className="mt-2 text-[16px] leading-relaxed text-gv-mute">{p.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-2xl text-[19px] leading-relaxed font-semibold sm:text-xl">
          Não é falta de produto bom. É falta da pessoa certa ver. O GereVendas Ads mostra o seu produto para quem está
          perto e quer comprar, e leva essa pessoa direto para o seu WhatsApp.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- como funciona */

function HowItWorks() {
  const steps = [
    { title: "Mande a foto", text: "Do celular mesmo. Diga o nome e o preço do produto." },
    { title: "Escolha região e valor", text: "Na sua cidade ou na região, a partir de R$ 10 por dia." },
    { title: "Receba clientes no WhatsApp", text: "Quem se interessa toca no anúncio e chama você." },
  ];
  return (
    <section id="passos" aria-labelledby="passos-titulo" className="scroll-mt-20 bg-white">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14 lg:py-24">
        <div>
          <p className="text-[15px] font-semibold text-gv-green">Simples assim</p>
          <h2
            id="passos-titulo"
            className="mt-3 text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]"
          >
            Três passos e o anúncio está pronto
          </h2>
          <ol className="mt-8 grid gap-6">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gv-green text-[17px] font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[19px] font-bold">{s.title}</h3>
                  <p className="mt-1 text-[16px] leading-relaxed text-gv-mute">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <figure>
          {/* No celular, a versão vertical (texto maior); no computador, a horizontal. Só carrega no play. */}
          <video
            controls
            preload="none"
            playsInline
            poster={`${base}/lp/apresentacao-vertical-capa.jpg`}
            className="mx-auto aspect-[9/16] w-full max-w-[400px] rounded-3xl bg-gv-night shadow-[0_30px_60px_-30px_rgb(6_40_20/0.6)] lg:hidden"
          >
            <source src={`${base}/lp/apresentacao-vertical.mp4`} type="video/mp4" />
          </video>
          <video
            controls
            preload="none"
            playsInline
            poster={`${base}/lp/apresentacao-capa.jpg`}
            className="hidden aspect-video w-full rounded-3xl bg-gv-night shadow-[0_30px_60px_-30px_rgb(6_40_20/0.6)] lg:block"
          >
            <source src={`${base}/lp/apresentacao.mp4`} type="video/mp4" />
          </video>
          <figcaption className="mt-3 text-center text-[14px] text-gv-mute lg:text-left">
            Veja o app funcionando em 2 minutos. Negócio e números de exemplo.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- vitrine */

function Showcase() {
  return (
    <section aria-labelledby="exemplos-titulo" className="bg-gv-paper">
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-24">
        <p className="text-[15px] font-semibold text-gv-green">Cinco versões para cada produto</p>
        <h2
          id="exemplos-titulo"
          className="mt-3 max-w-2xl text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]"
        >
          Cada versão chama o cliente de um jeito
        </h2>
        <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-gv-mute">
          Elas rodam juntas e a Meta mostra mais a que traz mais conversas. Você não precisa escolher.
        </p>
        <div className="mt-8">
          <Carousel label="Exemplos de versões do anúncio" desktopFrom="lg" gridClassName="lg:grid-cols-5 lg:gap-5">
            {BAKERY_ROUND.map(({ ad }, i) => (
              <div key={ad.template}>
                <div className="overflow-hidden rounded-2xl shadow-[0_20px_36px_-22px_rgb(6_40_20/0.55)]">
                  <FluidAd
                    format="feed"
                    content={ad}
                    businessName={BAKERY.businessName}
                    priceLabel={BAKERY.priceLabel}
                    imageSrc={BAKERY.photo ?? null}
                  />
                </div>
                <p className="mt-3 text-center text-[15px] font-semibold lg:text-left">
                  Versão {i + 1}: {TEMPLATE_LABELS[ad.template]}
                </p>
              </div>
            ))}
          </Carousel>
        </div>
        <p className="mt-6 text-[14px] text-gv-mute">Padaria fictícia, só para mostrar o formato.</p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- controle do dinheiro */

function Control() {
  const points = [
    { title: "Nasce pausado", text: "Nada é gasto até você confirmar." },
    { title: "Teto de gasto", text: "Nunca passa do total que você escolheu." },
    { title: "A IA não inventa", text: "Preço e promoção só se você escreveu." },
    { title: "Pausa com um toque", text: "Sem ligar para ninguém." },
  ];
  return (
    <section className="lp-dark">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-14 lg:py-24">
        <div>
          <h2 className="text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]">
            Nenhum real sai sem o seu ok.
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-0.5 text-gv-mint">
                  <CheckIcon />
                </span>
                <div>
                  <p className="text-[17px] font-bold text-white">{p.title}</p>
                  <p className="mt-1 text-[16px] leading-relaxed text-[#b6c8bc]">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div aria-hidden className="mx-auto w-full max-w-[420px]">
          <div className="rounded-3xl bg-white p-5 text-gv-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)] sm:p-7">
            <p className="text-[17px] font-bold">Tudo pronto!</p>
            <dl className="mt-4 divide-y divide-gv-line text-[15px]">
              {[
                ["Região", "Campinas"],
                ["Duração", "7 dias"],
                ["Por dia", "R$ 20"],
                ["Destino", "seu WhatsApp"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="font-semibold">{k}</dt>
                  <dd className="text-gv-mute">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-gv-paper px-4 py-3">
              <span className="text-[15px] text-gv-mute">Total máximo</span>
              <span className="text-2xl font-bold text-gv-green">R$ 140</span>
            </div>
            <p className="mt-4 rounded-2xl bg-gv-green py-3.5 text-center text-[16px] font-bold text-white">
              Publicar anúncio
            </p>
            <p className="mt-3 text-center text-[13px] text-gv-mute">O anúncio é criado pausado.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- benefícios */

function Benefits() {
  const items = [
    {
      title: "Mais gente vendo o seu produto",
      text: "O anúncio aparece para quem está perto do seu negócio, não só para quem já te segue.",
      icon: <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z" />,
    },
    {
      title: "Clientes direto no WhatsApp",
      text: "Um toque no anúncio e a conversa começa com você, no número do seu negócio.",
      icon: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
    },
    {
      title: "Pronto em poucos minutos",
      text: "Foto, preço e valor por dia. Sem fazer arte, sem escrever texto, sem configurar campanha.",
      icon: <path d="M12 7v5l3 2m7-2a10 10 0 11-20 0 10 10 0 0120 0z" />,
    },
    {
      title: "Você manda no dinheiro",
      text: "A partir de R$ 10 por dia, com teto fechado. Nada roda sem o seu ok e você pausa quando quiser.",
      icon: <path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-4z" />,
    },
    {
      title: "Tudo pelo celular",
      text: "Do cadastro aos resultados, no mesmo app. Não precisa de computador.",
      icon: <path d="M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zm3 17h2" />,
    },
    {
      title: "Você vê o que deu certo",
      text: "Quanto investiu, quantas conversas chegaram e quanto custou cada uma. E registra as vendas.",
      icon: <path d="M4 20h16M7 16V9m5 7V4m5 12v-5" />,
    },
  ];
  return (
    <section aria-labelledby="beneficios-titulo" className="bg-gv-paper">
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-24">
        <p className="text-[15px] font-semibold text-gv-green">O que muda no seu negócio</p>
        <h2
          id="beneficios-titulo"
          className="mt-3 max-w-2xl text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]"
        >
          Anunciar fica simples, barato e no seu controle
        </h2>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {items.map((b) => (
            <li key={b.title} className="rounded-3xl border border-gv-line bg-white p-6">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#e4f6e9] text-gv-green">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {b.icon}
                </svg>
              </span>
              <h3 className="mt-4 text-[19px] leading-snug font-bold">{b.title}</h3>
              <p className="mt-2 text-[16px] leading-relaxed text-gv-mute">{b.text}</p>
            </li>
          ))}
        </ul>
        <CtaBand />
      </div>
    </section>
  );
}

/** Chamada no meio da página: botão e as garantias, sempre iguais. */
function CtaBand({ dark = false }: { dark?: boolean }) {
  return (
    <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
      <CtaLink size="lg" className="w-full sm:w-auto">
        Criar meu anúncio
      </CtaLink>
      <p className={cn("text-[15px]", dark ? "text-[#9fb3a6]" : "text-gv-mute")}>
        R$ 199/mês no piloto · sem fidelidade · a verba você escolhe
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- para quem é */

function ForWho() {
  const segments = [
    "Padaria e confeitaria",
    "Salão e barbearia",
    "Estética",
    "Pet shop",
    "Oficina e autopeças",
    "Lanchonete e delivery",
    "Loja de roupas",
    "Ótica",
    "Academia",
    "Assistência técnica",
    "Hortifrúti e mercado",
    "Prestador de serviço",
  ];
  return (
    <section aria-labelledby="quem-titulo" className="bg-gv-paper">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:py-24">
        <div>
          <p className="text-[15px] font-semibold text-gv-green">Para quem é</p>
          <h2
            id="quem-titulo"
            className="mt-3 text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]"
          >
            Feito para quem vende no bairro
          </h2>
          <p className="mt-4 text-[17px] leading-relaxed text-gv-mute">
            Funciona melhor para quem atende pelo WhatsApp e tem um produto ou serviço com preço: o cliente vê o
            anúncio, chama e você fecha a venda na conversa.
          </p>
        </div>
        <ul className="flex flex-wrap content-start gap-2.5">
          {segments.map((s) => (
            <li
              key={s}
              className="rounded-full border border-gv-line bg-white px-4 py-2 text-[15px] font-medium text-gv-ink"
            >
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- comparação */

function Comparison() {
  const rows = [
    "Quem faz o anúncio",
    "Tempo até ficar pronto",
    "Custo fixo",
    "Precisa entender de tráfego",
    "Controle do gasto",
  ];
  const cols = [
    {
      name: "Contratar agência",
      values: ["A agência", "Dias de briefing e aprovação", "Contrato mensal de agência", "Não", "Depende da agência"],
      best: false,
    },
    {
      name: "Fazer sozinho",
      values: ["Você", "Horas aprendendo", "Sem mensalidade, mas o seu tempo", "Sim", "Fácil errar no orçamento"],
      best: false,
    },
    {
      name: "GereVendas Ads",
      values: [
        "A IA, com a sua foto",
        "Poucos minutos",
        "R$ 199/mês, sem fidelidade",
        "Não",
        "Teto fechado e pausa em um toque",
      ],
      best: true,
    },
  ];
  return (
    <section aria-labelledby="comparar-titulo" className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-24">
        <p className="text-[15px] font-semibold text-gv-green">Compare</p>
        <h2
          id="comparar-titulo"
          className="mt-3 max-w-2xl text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]"
        >
          Sem agência e sem curso de tráfego
        </h2>
        <ul className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
          {cols.map((c) => (
            <li
              key={c.name}
              className={cn(
                "rounded-3xl p-6",
                c.best
                  ? "lp-dark order-first text-white shadow-[0_30px_60px_-30px_rgb(6_40_20/0.7)] lg:order-none"
                  : "border border-gv-line bg-gv-paper",
              )}
            >
              <p className="flex items-center justify-between gap-3 text-[19px] font-bold">
                {c.name}
                {c.best && (
                  <span className="rounded-full bg-gv-green px-2.5 py-1 text-[12px] font-bold text-white">
                    Mais simples
                  </span>
                )}
              </p>
              <dl className={cn("mt-4 divide-y", c.best ? "divide-white/10" : "divide-gv-line")}>
                {rows.map((r, i) => (
                  <div key={r} className="py-3">
                    <dt className={cn("text-[13px] font-semibold", c.best ? "text-gv-mint" : "text-gv-mute")}>{r}</dt>
                    <dd className="mt-0.5 text-[16px] font-medium">{c.values[i]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <CtaBand />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- quanto custa */

function CostExample() {
  const examples = [
    { label: "Teste de 1 semana", calc: "R$ 10 por dia × 7 dias", total: "R$ 70" },
    { label: "Uma semana forte", calc: "R$ 20 por dia × 7 dias", total: "R$ 140" },
    { label: "O mês inteiro", calc: "R$ 10 por dia × 30 dias", total: "R$ 300" },
  ];
  return (
    <div className="mt-6 rounded-[28px] border border-gv-line bg-gv-paper p-6 sm:p-8">
      <h3 className="text-[22px] font-bold tracking-[-0.02em]">Quanto custa de verdade</h3>
      <p className="mt-2 max-w-2xl text-[16px] leading-relaxed text-gv-mute">
        São duas partes: a mensalidade da ferramenta (R$ 199) e a verba dos anúncios. A verba dos anúncios não está
        incluída na mensalidade: você escolhe o valor a cada anúncio e paga à parte. Exemplos de verba:
      </p>
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {examples.map((e) => (
          <li key={e.label} className="rounded-2xl bg-white p-5">
            <p className="text-[14px] font-semibold text-gv-green">{e.label}</p>
            <p className="mt-1 text-[15px] text-gv-mute">{e.calc}</p>
            <p className="mt-2 text-[28px] leading-none font-bold">{e.total}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[14px] text-gv-mute">O gasto nunca passa do total que você confirmou.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- como começar */

function GetStarted() {
  const steps = [
    { title: "Crie sua conta", text: "Cadastre o negócio: nome, cidade e o WhatsApp onde você atende." },
    { title: "Conecte a sua Página", text: "Ligue a Página do Facebook e o Instagram. O app mostra cada passo." },
    { title: "Mande a primeira foto", text: "Escolha o produto, o preço, a região e o valor. Confira e confirme." },
  ];
  return (
    <section aria-labelledby="comecar-titulo" className="bg-gv-paper">
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-24">
        <p className="text-[15px] font-semibold text-gv-green">Depois do clique</p>
        <h2
          id="comecar-titulo"
          className="mt-3 max-w-2xl text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]"
        >
          Comece hoje em 3 etapas
        </h2>
        <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-3xl border border-gv-line bg-white p-6">
              <span className="grid size-11 place-items-center rounded-full bg-gv-green text-[18px] font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 text-[19px] font-bold">{s.title}</h3>
              <p className="mt-2 text-[16px] leading-relaxed text-gv-mute">{s.text}</p>
            </li>
          ))}
        </ol>
        <CtaBand />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- preço */

function Pricing() {
  return (
    <section id="preco" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-24">
        <p className="text-[15px] font-semibold text-gv-green">Preço</p>
        <h2 className="mt-3 max-w-2xl text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]">
          Um preço só, sem fidelidade e sem surpresa
        </h2>
        <div className="mt-10 grid grid-cols-1 overflow-hidden rounded-[28px] border border-gv-line lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="lp-dark p-7 sm:p-10">
            <p className="font-semibold text-gv-mint">Plano do piloto</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-[clamp(3.2rem,14vw,5rem)] leading-none font-bold tracking-[-0.05em]">R$ 199</span>
              <span className="text-lg font-semibold text-[#b6c8bc]">por mês</span>
            </p>
            <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-[#b6c8bc]">
              Sem fidelidade, sem agência e sem designer. Você usa enquanto fizer sentido para o seu negócio.
            </p>
            <CtaLink size="lg" className="mt-8 w-full sm:w-auto">
              Quero começar agora
            </CtaLink>
          </div>
          <div className="bg-white p-7 sm:p-10">
            <h3 className="text-2xl font-bold tracking-[-0.02em]">O que entra na mensalidade</h3>
            <ul className="mt-6 grid gap-3.5 text-[16px]">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 text-gv-green">
                    <CheckIcon />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <CostExample />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- dúvidas */

function Faq() {
  return (
    <section id="duvidas" className="scroll-mt-20 bg-white">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12 lg:py-24">
        <h2 className="text-[clamp(1.9rem,6vw,3rem)] leading-[1.08] font-bold tracking-[-0.035em]">Dúvidas comuns</h2>
        <div className="divide-y divide-gv-line border-y border-gv-line">
          {faq.map((f) => (
            <details key={f.q} className="lp-faq group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] font-semibold">
                {f.q}
                <span
                  aria-hidden
                  className="lp-faq-icon grid size-8 shrink-0 place-items-center rounded-full border border-gv-line text-xl leading-none text-gv-green transition-transform"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-5 text-[16px] leading-relaxed text-gv-mute">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- fechamento */

function FinalCta() {
  return (
    <section className="lp-dark">
      <div className="mx-auto max-w-[1200px] px-5 py-20 text-center sm:px-8 lg:py-28">
        <h2 className="mx-auto max-w-3xl text-[clamp(2rem,7vw,3.8rem)] leading-[1.05] font-bold tracking-[-0.04em]">
          O seu cliente já está no Instagram. Falta ele ver você.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-[#b6c8bc]">
          Mande a foto do primeiro produto hoje. R$ 199 por mês no piloto, sem fidelidade, e o anúncio só vai ao ar com
          a sua confirmação.
        </p>
        <CtaLink size="lg" className="mt-8 w-full sm:w-auto">
          Criar meu anúncio
        </CtaLink>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/6 bg-[#040c07] text-[#9fb3a6]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div>
          <BrandLogo tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">Um produto Gere Vendas para quem vende no bairro.</p>
        </div>
        <nav aria-label="Rodapé" className="flex flex-col gap-3 text-[15px]">
          <Link href="/entrar" className="hover:text-gv-mint">
            Entrar
          </Link>
          <a href="#preco" className="hover:text-gv-mint">
            Preço
          </a>
          <a href={CRM_URL} className="hover:text-gv-mint">
            Conheça o Gere Vendas CRM
          </a>
        </nav>
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-2 border-t border-white/6 px-5 py-6 text-[13px] sm:flex-row sm:justify-between sm:px-8">
        <p>© 2026 GereVendas Ads</p>
        <p>Publicação na Meta sujeita à revisão e às políticas da plataforma.</p>
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
        "lp-btn-primary inline-flex items-center justify-center rounded-2xl bg-gv-green font-bold whitespace-nowrap text-white transition-colors hover:bg-gv-green-strong",
        size === "sm" ? "h-10 px-4 text-[14px]" : "h-14 px-7 text-[17px]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-[20px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
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
