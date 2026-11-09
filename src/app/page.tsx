import type { Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/marketing/brand-mark";
import { Carousel } from "@/components/marketing/carousel";
import { BAKERY, BAKERY_ROUND } from "@/components/marketing/demo-ads";
import { FluidAd } from "@/components/marketing/fluid-ad";
import { ScrollTourSection } from "@/components/marketing/scroll-tour";
import { Phone, ScreenPreview } from "@/components/marketing/storyboard";
import { TEMPLATE_LABELS } from "@/contracts/creatives";
import { cn } from "@/lib/cn";

// Sora: fonte da marca Gere Vendas. Arquivo local (OFL), sem depender do Google Fonts no build.
const sora = localFont({
  src: "./fonts/sora-latin.woff2",
  variable: "--font-sora",
  weight: "300 800",
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#ffffff" };

const CRM_URL = "https://www.gerevendascrm.com.br/";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const img3d = (nome: string) => `${base}/lp/3d/${nome}.webp`;

/**
 * LP do GereVendas Ads. Referência visual pedida pelo cliente: o site da Nio (fundo lima claro com curvas,
 * ilustrações 3D de pelúcia, cartões de oferta com faixa no cabeçalho, CTA rosa e grade de benefícios).
 * Público: dono de negócio local, no celular. Só fatos do produto: sem depoimentos nem números inventados.
 */

const incluso = [
  "Cinco versões do anúncio a cada produto",
  "A foto do seu produto em todas as versões",
  "Campanha no Instagram e no Facebook",
  "Clientes chamando no seu WhatsApp",
  "Resultados: investido, conversas e custo por conversa",
];

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
        <Recursos />
        <ScrollTourSection />
        <PorQue />
        <Vitrine />
        <Video />
        <Preco />
        <Comparacao />
        <Faq />
        <Fechamento />
      </main>
      <Footer />
    </div>
  );
}

/* ---------------------------------------------------------------- peças comuns */

function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", claro ? "text-white" : "text-lp-verde")}>
      <BrandMark className="h-8 w-auto" />
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 text-xs leading-none font-bold",
          claro ? "bg-white text-lp-verde" : "bg-lp-vivo text-white",
        )}
      >
        Ads
      </span>
    </span>
  );
}

/** Botão principal (rosa) ou secundário (verde-escuro), sempre em pílula. */
function Botao({
  children,
  tom = "rosa",
  className,
  href = "/entrar",
}: {
  children: ReactNode;
  tom?: "rosa" | "verde" | "branco";
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-14 items-center justify-center rounded-full px-8 text-[17px] font-bold whitespace-nowrap transition-colors",
        tom === "rosa" && "bg-lp-rosa text-white hover:bg-lp-rosa-escuro",
        tom === "verde" && "bg-lp-verde text-white hover:bg-lp-verde-escuro",
        tom === "branco" && "bg-white text-lp-verde hover:bg-lp-menta",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function Titulo({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2
      id={id}
      className={cn(
        "text-center text-[clamp(1.9rem,6vw,2.9rem)] leading-[1.08] font-bold tracking-[-0.035em] text-lp-verde",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={cn("size-5 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Ilustração 3D decorativa (pelúcia verde, fundo transparente). */
function Ilustra({ nome, className, prioridade = false }: { nome: string; className?: string; prioridade?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ilustração estática da LP, já otimizada (WebP)
    <img
      src={img3d(nome)}
      alt=""
      aria-hidden
      loading={prioridade ? "eager" : "lazy"}
      className={cn("pointer-events-none drop-shadow-[0_24px_30px_rgb(11_59_30/0.25)] select-none", className)}
    />
  );
}

/* ---------------------------------------------------------------- topo */

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-lp-linha/70 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="GereVendas Ads, início">
          <Logo />
        </Link>
        <nav
          aria-label="Principal"
          className="hidden items-center gap-8 text-[15px] font-semibold text-lp-cinza lg:flex"
        >
          <a href="#como-funciona" className="hover:text-lp-verde">
            Como funciona
          </a>
          <a href="#preco" className="hover:text-lp-verde">
            Preço
          </a>
          <a href="#duvidas" className="hover:text-lp-verde">
            Dúvidas
          </a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/entrar"
            className="hidden h-11 items-center rounded-full border-2 border-lp-verde px-5 text-[15px] font-bold text-lp-verde hover:bg-lp-menta sm:inline-flex"
          >
            Entrar
          </Link>
          <Link
            href="/entrar"
            className="inline-flex h-11 items-center rounded-full bg-lp-verde px-4 text-[14px] font-bold whitespace-nowrap text-white hover:bg-lp-verde-escuro sm:px-5 sm:text-[15px]"
          >
            Criar meu anúncio
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-lp-claro">
      {/* Curva clara grande ao fundo, como na referência */}
      <div
        aria-hidden
        className="absolute top-[38%] left-1/2 h-[120%] w-[170%] -translate-x-1/2 rounded-[50%] bg-lp-menta"
      />
      <div className="relative mx-auto max-w-[1240px] px-5 pt-10 sm:px-8 lg:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-[14px] font-semibold text-lp-verde shadow-[0_6px_20px_-12px_rgb(11_59_30/0.4)]">
            <span className="size-2 rounded-full bg-lp-vivo" />
            Anúncios para quem vende no bairro
          </p>
          <h1 className="mt-5 text-[clamp(2.5rem,9.5vw,4.6rem)] leading-[1] font-bold tracking-[-0.045em] text-lp-verde">
            Seu produto é bom. Falta gente ver.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[clamp(1.1rem,3.6vw,1.4rem)] leading-snug text-lp-cinza">
            Mande a foto do produto e o app cria o anúncio no Instagram e no Facebook. Quem se interessa chama você
            direto no WhatsApp.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Botao className="w-full sm:w-auto">Criar meu anúncio</Botao>
            <a
              href="#como-funciona"
              className="inline-flex h-14 w-full items-center justify-center rounded-full border-2 border-lp-verde bg-white px-8 text-[17px] font-bold text-lp-verde hover:bg-lp-menta sm:w-auto"
            >
              Ver o app por dentro
            </a>
          </div>
          <p className="mt-4 text-[14px] text-lp-cinza">Sem fidelidade · O anúncio só roda com o seu ok</p>
        </div>

        {/* O app no centro, a dona ao lado e o que acontece em volta */}
        <div className="relative mx-auto mt-10 h-[420px] max-w-[880px] sm:h-[500px] lg:mt-14 lg:h-[600px]">
          <Ilustra nome="megafone" prioridade className="absolute top-6 left-0 hidden w-36 -rotate-12 lg:block" />
          <Ilustra nome="conversa" prioridade className="absolute top-0 right-2 hidden w-32 rotate-6 lg:block" />

          <div className="absolute top-0 left-1/2 w-[230px] -translate-x-1/2 sm:w-[260px] lg:w-[280px]">
            <Phone>
              <ScreenPreview />
            </Phone>
          </div>

          <Ilustra
            nome="dona"
            prioridade
            className="absolute bottom-0 left-[-28px] w-[118px] sm:left-[6%] sm:w-[200px] lg:left-[10%] lg:w-[250px]"
          />

          <div className="absolute top-[34%] right-[-8px] w-[150px] rounded-2xl bg-white p-3 text-left shadow-[0_18px_40px_-20px_rgb(11_59_30/0.55)] sm:top-[22%] sm:right-[6%] sm:w-[220px] lg:right-[9%]">
            <p className="flex items-center gap-2 text-[12px] font-semibold text-lp-cinza">
              <span className="grid size-5 place-items-center rounded-full bg-[#25d366] text-white">
                <svg aria-hidden viewBox="0 0 24 24" className="size-3" fill="currentColor">
                  <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                </svg>
              </span>
              WhatsApp · agora
            </p>
            <p className="mt-1.5 text-[13px] leading-snug font-semibold text-lp-tinta sm:text-[14px]">
              Oi! Vi o anúncio do café da manhã. Ainda tem hoje?
            </p>
          </div>

          <p className="absolute right-2 bottom-16 hidden rounded-full bg-lp-verde px-4 py-2 text-[13px] font-bold text-white shadow-[0_14px_30px_-16px_rgb(11_59_30/0.7)] sm:right-[12%] sm:block sm:text-[14px]">
            5 versões prontas com a sua foto
          </p>
        </div>
      </div>
    </section>
  );
}

/** Cartão de oferta no formato da referência: faixa no topo, o que vem incluso, preço e botão rosa. */
function CartaoPlano() {
  return (
    <div className="mx-auto w-full max-w-[400px] rounded-[28px] bg-gradient-to-b from-white to-[#eef6e2] p-4 shadow-[0_24px_60px_-30px_rgb(11_59_30/0.5)] ring-1 ring-lp-linha">
      <p className="flex items-center justify-between rounded-xl bg-lp-verde px-4 py-2.5 text-[15px] font-bold text-white">
        Plano GereVendas Ads
        <span className="rounded-full bg-lp-vivo px-2.5 py-0.5 text-[12px]">Piloto</span>
      </p>
      <ul className="mt-4 grid gap-2.5 rounded-2xl bg-white p-4 text-[15px] ring-1 ring-lp-linha">
        {incluso.map((i) => (
          <li key={i} className="flex gap-2.5">
            <Check className="text-lp-vivo" />
            {i}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-center">
        <span className="align-top text-[18px] font-bold">R$ </span>
        <span className="text-[52px] leading-none font-bold tracking-[-0.04em]">199</span>
        <span className="text-[18px] font-semibold">/mês</span>
      </p>
      <p className="text-center text-[14px] text-lp-cinza">sem fidelidade · verba dos anúncios à parte</p>
      <Botao className="mt-4 w-full">Criar meu anúncio</Botao>
    </div>
  );
}

/* ---------------------------------------------------------------- recursos */

function Recursos() {
  const itens = [
    {
      t: "Foto vira anúncio",
      d: "Tire a foto do produto no celular. Ela vai para todas as versões do anúncio.",
      i: (
        <path d="M4 8a2 2 0 0 1 2-2h1.5L9 4h6l1.5 2H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      ),
    },
    {
      t: "Cinco versões",
      d: "A IA cria cinco anúncios, cada um chamando o cliente de um jeito.",
      i: <path d="M4 5h11v14H4zm4-2h12v14" />,
    },
    {
      t: "Clientes no WhatsApp",
      d: "Um toque no anúncio e a conversa começa no número do seu negócio.",
      i: <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />,
    },
    {
      t: "Resultados claros",
      d: "Quanto investiu, quantas conversas e quanto custou cada uma.",
      i: <path d="M4 20h16M7 16V9m5 7V4m5 12v-5" />,
    },
  ];
  return (
    <section aria-labelledby="recursos-titulo" className="bg-white">
      <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8 lg:py-20">
        <Titulo id="recursos-titulo">Tudo o que você precisa, num app só</Titulo>
        <p className="mx-auto mt-3 max-w-xl text-center text-[17px] text-lp-cinza">
          Sem agência, sem designer e sem curso de tráfego.
        </p>
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {itens.map((x) => (
            <li key={x.t} className="rounded-[24px] bg-lp-menta p-6 ring-1 ring-lp-linha">
              <span className="grid size-12 place-items-center rounded-full bg-lp-claro text-lp-verde">
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
                  {x.i}
                </svg>
              </span>
              <h3 className="mt-4 text-[19px] font-bold text-lp-verde">{x.t}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-lp-cinza">{x.d}</p>
            </li>
          ))}
        </ul>
        <div className="mt-10 text-center">
          <Botao tom="verde">Criar meu anúncio</Botao>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- por que */

function PorQue() {
  return (
    <section aria-labelledby="porque-titulo" className="relative overflow-hidden bg-lp-claro">
      <div
        aria-hidden
        className="absolute top-16 left-1/2 h-[120%] w-[150%] -translate-x-1/2 rounded-[50%] bg-lp-menta"
      />
      <div className="relative mx-auto max-w-[1240px] px-5 py-14 sm:px-8 lg:py-20">
        <Titulo id="porque-titulo">Por que escolher o GereVendas Ads</Titulo>
        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
          <TextoVerde
            t="Você manda no dinheiro"
            d="A partir de R$ 10 por dia, com teto fechado. O anúncio nasce pausado e você pausa quando quiser."
          />
          <IlustraVerde nome="megafone" />
          <TextoVerde
            t="A IA não inventa"
            d="Preço, desconto e entrega só entram no anúncio se você escreveu. Você aprova antes de publicar."
          />
          <IlustraVerde nome="sacola" />
          <TextoVerde
            t="Feito para o bairro"
            d="O anúncio aparece para quem está perto: na sua cidade ou na cidade e região."
          />
          <IlustraVerde nome="celular" />
        </div>
        <div className="mt-10 text-center">
          <Botao tom="verde">Criar meu anúncio</Botao>
        </div>
      </div>
    </section>
  );
}

function TextoVerde({ t, d }: { t: string; d: string }) {
  return (
    <div className="flex min-h-[190px] flex-col justify-center rounded-[22px] bg-gradient-to-br from-[#1f6b35] to-lp-verde p-6 text-white">
      <h3 className="text-[21px] leading-snug font-bold">{t}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-white/85">{d}</p>
    </div>
  );
}

function IlustraVerde({ nome }: { nome: string }) {
  return (
    <div
      aria-hidden
      className="relative hidden min-h-[190px] overflow-visible rounded-[22px] bg-gradient-to-br from-[#5ee06f] to-lp-vivo md:block"
    >
      <Ilustra nome={nome} className="absolute -top-6 left-1/2 w-44 -translate-x-1/2" />
    </div>
  );
}

/* ---------------------------------------------------------------- vitrine */

function Vitrine() {
  return (
    <section aria-labelledby="vitrine-titulo" className="bg-white">
      <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8 lg:py-20">
        <Titulo id="vitrine-titulo">Uma foto, cinco anúncios diferentes</Titulo>
        <p className="mx-auto mt-3 max-w-xl text-center text-[17px] text-lp-cinza">
          Elas rodam juntas e a Meta mostra mais a que traz mais conversas.
        </p>
        <div className="mt-10">
          <Carousel label="Exemplos de versões do anúncio" desktopFrom="lg" gridClassName="lg:grid-cols-5 lg:gap-5">
            {BAKERY_ROUND.map(({ ad }, i) => (
              <div key={ad.template}>
                <div className="overflow-hidden rounded-[20px] shadow-[0_20px_40px_-24px_rgb(11_59_30/0.55)]">
                  <FluidAd
                    format="feed"
                    content={ad}
                    businessName={BAKERY.businessName}
                    priceLabel={BAKERY.priceLabel}
                    imageSrc={BAKERY.photo ?? null}
                  />
                </div>
                <p className="mt-3 text-center text-[15px] font-semibold text-lp-verde">
                  Versão {i + 1}: {TEMPLATE_LABELS[ad.template]}
                </p>
              </div>
            ))}
          </Carousel>
        </div>
        <p className="mt-6 text-center text-[14px] text-lp-cinza">
          Exemplo ilustrativo: padaria fictícia, só para mostrar o formato.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- vídeo */

function Video() {
  return (
    <section id="video" aria-labelledby="video-titulo" className="scroll-mt-20 bg-lp-claro">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-12 lg:py-20">
        <div className="text-center lg:text-left">
          <h2
            id="video-titulo"
            className="text-[clamp(1.9rem,6vw,2.9rem)] leading-[1.08] font-bold tracking-[-0.035em] text-lp-verde"
          >
            Veja funcionando em 2 minutos
          </h2>
          <p className="mt-3 text-[17px] leading-relaxed text-lp-cinza">
            Da foto do produto até a conversa no WhatsApp, com a tela do app.
          </p>
          <Botao className="mt-7 hidden lg:inline-flex">Criar meu anúncio</Botao>
        </div>
        <figure>
          {/* No celular, a versão vertical (texto maior); no computador, a horizontal. Só carregam no play. */}
          <video
            controls
            preload="none"
            playsInline
            poster={`${base}/lp/apresentacao-vertical-capa.jpg`}
            className="mx-auto aspect-[9/16] w-full max-w-[380px] rounded-[28px] bg-lp-verde lg:hidden"
          >
            <source src={`${base}/lp/apresentacao-vertical.mp4`} type="video/mp4" />
          </video>
          <video
            controls
            preload="none"
            playsInline
            poster={`${base}/lp/apresentacao-capa.jpg`}
            className="hidden aspect-video w-full rounded-[28px] bg-lp-verde lg:block"
          >
            <source src={`${base}/lp/apresentacao.mp4`} type="video/mp4" />
          </video>
          <figcaption className="mt-3 text-center text-[14px] text-lp-cinza">Negócio e números de exemplo.</figcaption>
        </figure>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- preço */

function Preco() {
  const verba = [
    ["Teste de 1 semana", "R$ 10 por dia", "7 dias", "70"],
    ["Uma semana forte", "R$ 20 por dia", "7 dias", "140"],
    ["O mês inteiro", "R$ 10 por dia", "30 dias", "300"],
  ];
  const controle = [
    "O anúncio nasce pausado",
    "O gasto nunca passa do que você escolheu",
    "Preço e promoção só se você escreveu",
    "Pausa com um toque",
  ];
  return (
    <section id="preco" aria-labelledby="preco-titulo" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-[1240px] px-5 py-14 sm:px-8 lg:py-20">
        <Titulo id="preco-titulo">Quanto custa, sem letra miúda</Titulo>
        <p className="mx-auto mt-3 max-w-2xl text-center text-[17px] leading-relaxed text-lp-cinza">
          A mensalidade é da ferramenta. A verba dos anúncios não está incluída na mensalidade: você escolhe o valor a
          cada anúncio e paga à parte.
        </p>
        <div className="mt-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:gap-8">
          <CartaoPlano />
          <div>
            <p className="text-center text-[18px] font-bold text-lp-verde lg:text-left">Exemplos de verba</p>
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {verba.map(([t, dia, dias, total]) => (
                <li
                  key={t}
                  className="rounded-[24px] bg-gradient-to-b from-white to-[#eef6e2] p-3 ring-1 ring-lp-linha"
                >
                  <p className="rounded-xl bg-lp-claro px-3 py-2 text-[14px] font-bold text-lp-verde">{t}</p>
                  <p className="mt-4 text-center text-[15px] text-lp-cinza">
                    {dia}
                    <br />
                    por {dias}
                  </p>
                  <p className="mt-2 text-center">
                    <span className="align-top text-[15px] font-bold">R$ </span>
                    <span className="text-[36px] leading-none font-bold tracking-[-0.04em]">{total}</span>
                  </p>
                  <p className="mb-2 text-center text-[13px] text-lp-cinza">no total</p>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-[24px] bg-lp-verde p-6 text-white">
              <p className="text-[22px] font-bold">Nenhum real sai sem o seu ok.</p>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {controle.map((c) => (
                  <li key={c} className="flex gap-2.5 text-[15px]">
                    <Check className="text-lp-vivo" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
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

function Comparacao() {
  const [agencia, sozinho, nos] = COMPARA.colunas;
  return (
    <section aria-labelledby="comparar-titulo" className="bg-lp-menta">
      <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8 lg:py-20">
        <Titulo id="comparar-titulo">Sem agência e sem curso de tráfego</Titulo>
        <table className="mt-10 hidden w-full overflow-hidden rounded-[24px] bg-white text-left ring-1 ring-lp-linha md:table">
          <thead>
            <tr>
              <th scope="col" className="w-[26%] p-4" />
              <th scope="col" className="p-4 text-[15px] font-semibold text-lp-cinza">
                {agencia.nome}
              </th>
              <th scope="col" className="p-4 text-[15px] font-semibold text-lp-cinza">
                {sozinho.nome}
              </th>
              <th scope="col" className="bg-lp-verde p-4 text-[16px] font-bold text-white">
                {nos.nome}
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARA.linhas.map((l, i) => (
              <tr key={l} className="border-t border-lp-linha">
                <th scope="row" className="p-4 text-[15px] font-semibold">
                  {l}
                </th>
                <td className="p-4 text-[15px] text-lp-cinza">{agencia.valores[i]}</td>
                <td className="p-4 text-[15px] text-lp-cinza">{sozinho.valores[i]}</td>
                <td className="bg-lp-claro p-4 text-[15px] font-semibold text-lp-verde">{nos.valores[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-8 grid gap-3 md:hidden">
          {COMPARA.linhas.map((l, i) => (
            <div key={l} className="rounded-[20px] bg-white p-4 ring-1 ring-lp-linha">
              <dt className="text-[15px] font-bold text-lp-verde">{l}</dt>
              <dd className="mt-2 grid gap-1 text-[15px]">
                <span className="text-lp-cinza">
                  {agencia.nome}: {agencia.valores[i]}
                </span>
                <span className="text-lp-cinza">
                  {sozinho.nome}: {sozinho.valores[i]}
                </span>
                <span className="font-semibold text-lp-verde">
                  {nos.nome}: {nos.valores[i]}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- dúvidas */

function Faq() {
  return (
    <section id="duvidas" aria-labelledby="duvidas-titulo" className="scroll-mt-20 bg-white">
      <div className="mx-auto max-w-[860px] px-5 py-14 sm:px-8 lg:py-20">
        <Titulo id="duvidas-titulo">Antes de você perguntar</Titulo>
        <div className="mt-10 grid gap-3">
          {faq.map((f) => (
            <details key={f.q} className="lp-faq group rounded-[20px] bg-lp-menta px-5 ring-1 ring-lp-linha">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-bold text-lp-verde">
                {f.q}
                <span
                  aria-hidden
                  className="lp-faq-icon grid size-8 shrink-0 place-items-center rounded-full bg-white text-xl leading-none text-lp-verde transition-transform"
                >
                  +
                </span>
              </summary>
              <p className="pb-5 text-[16px] leading-relaxed text-lp-cinza">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- fechamento */

function Fechamento() {
  return (
    <section className="relative overflow-hidden bg-lp-claro">
      <div
        aria-hidden
        className="absolute -bottom-1/2 left-1/2 h-[120%] w-[140%] -translate-x-1/2 rounded-[50%] bg-lp-menta"
      />
      <div className="relative mx-auto grid max-w-[1100px] grid-cols-1 items-center gap-6 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:py-20">
        <div className="text-center lg:text-left">
          <h2 className="text-[clamp(2rem,7vw,3.4rem)] leading-[1.04] font-bold tracking-[-0.04em] text-lp-verde">
            O seu cliente já está no Instagram. Falta ele ver você.
          </h2>
          <p className="mt-4 text-[17px] text-lp-cinza">
            Crie a conta, conecte a sua Página e mande a primeira foto. R$ 199 por mês, sem fidelidade.
          </p>
          <Botao className="mt-7 w-full sm:w-auto">Criar meu anúncio</Botao>
        </div>
        <Ilustra nome="sacola" className="mx-auto w-[min(60vw,300px)]" />
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-lp-verde text-white/80">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-8 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo claro />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed">Um produto Gere Vendas para quem vende no bairro.</p>
        </div>
        <nav aria-label="Produto" className="grid content-start gap-2.5 text-[15px]">
          <p className="font-bold text-white">Produto</p>
          <a href="#como-funciona" className="hover:text-white">
            Como funciona
          </a>
          <a href="#preco" className="hover:text-white">
            Preço
          </a>
          <a href="#duvidas" className="hover:text-white">
            Dúvidas
          </a>
        </nav>
        <nav aria-label="Conta" className="grid content-start gap-2.5 text-[15px]">
          <p className="font-bold text-white">Conta</p>
          <Link href="/entrar" className="hover:text-white">
            Entrar
          </Link>
          <Link href="/entrar" className="hover:text-white">
            Criar meu anúncio
          </Link>
          <a href={CRM_URL} className="hover:text-white">
            Conheça o Gere Vendas CRM
          </a>
        </nav>
      </div>
      <div className="mx-auto max-w-[1240px] border-t border-white/15 px-5 py-5 text-[13px] sm:px-8">
        © 2026 GereVendas Ads. Publicação na Meta sujeita à revisão e às políticas da plataforma. Exemplos com negócio
        fictício.
      </div>
    </footer>
  );
}
