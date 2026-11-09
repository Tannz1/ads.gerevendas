import type { Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { BAKERY, BAKERY_ROUND } from "@/components/marketing/demo-ads";
import { FluidAd } from "@/components/marketing/fluid-ad";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { Storyboard } from "@/components/marketing/storyboard";
import { TEMPLATE_LABELS, type CreativeContent } from "@/contracts/creatives";
import { cn } from "@/lib/cn";

// Sora: fonte da marca Gere Vendas (site do CRM). Arquivo local, OFL, para o build não depender do Google Fonts.
const sora = localFont({
  src: "./fonts/sora-latin.woff2",
  variable: "--font-sora",
  weight: "300 800",
  display: "swap",
});

export const viewport: Viewport = { themeColor: "#06130b" };

const CRM_URL = "https://www.gerevendascrm.com.br/";

/** Peça da padaria FICTÍCIA desenhada pelo renderizador real do editor. */
function BakeryAd({ ad, stories = false }: { ad: CreativeContent; stories?: boolean }) {
  return (
    <FluidAd
      format={stories ? "stories" : "feed"}
      content={ad}
      businessName={BAKERY.businessName}
      priceLabel={BAKERY.priceLabel}
      imageSrc={BAKERY.photo ?? null}
    />
  );
}

const segments = [
  "Padaria",
  "Salão de beleza",
  "Barbearia",
  "Pet shop",
  "Oficina",
  "Lanchonete",
  "Doceria",
  "Açougue",
  "Hortifrúti",
  "Loja de roupas",
  "Ótica",
  "Academia",
  "Assistência técnica",
  "Estúdio de estética",
];

const included = [
  "Cinco versões do anúncio a cada produto, para feed e stories",
  "A foto do seu produto em todas as versões",
  "Editor para ajustar título, texto, preço, cor e foto",
  "Campanha montada no Facebook e no Instagram",
  "Painel com investimento, conversas e custo por conversa",
  "Registro das vendas que vieram das conversas",
];

const faq = [
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
    a: "Não. Ela só usa o que você escreveu: preço, parcelamento, desconto ou entrega entram no anúncio só se você informou. Você revisa cada peça antes de publicar e pode mudar qualquer texto.",
  },
  {
    q: "Quanto vou gastar com os anúncios?",
    a: "Você escolhe o valor por dia e por quantos dias cada campanha roda. Essa verba é cobrada à parte da mensalidade e o gasto nunca passa do total que você confirmou.",
  },
  {
    q: "Posso usar fotos do meu negócio?",
    a: "Deve. O anúncio começa pela foto do seu produto, em JPG ou PNG de até 5 MB. Pode ser do celular mesmo.",
  },
  {
    q: "Quando o anúncio começa a aparecer?",
    a: "A campanha é criada pausada. Depois que você confirma o valor e a verba é paga, ela é ativada e passa pela revisão da Meta, que avalia todo anúncio antes de mostrar.",
  },
];

export default function Home() {
  return (
    <div className={cn(sora.variable, "overflow-x-clip bg-white font-lp text-gv-ink")}>
      <Header />

      <main>
        <Hero />
        <Segments />
        <PhotoStart />
        <Compare />
        <Storyboard />
        <Showcase />
        <Control />
        <Results />
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
    <header className="sticky top-0 z-30 border-b border-white/8 bg-gv-night/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-4 px-4 sm:h-[72px] sm:px-8">
        <BrandLogo tone="light" />
        <nav aria-label="Principal" className="hidden items-center gap-7 text-[14.5px] text-[#d6e6dc] lg:flex">
          <a href="#como-funciona" className="hover:text-white">
            Como funciona
          </a>
          <a href="#exemplos" className="hover:text-white">
            Exemplos
          </a>
          <a href="#preco" className="hover:text-white">
            Preço
          </a>
          <a href="#duvidas" className="hover:text-white">
            Dúvidas
          </a>
        </nav>
        <div className="flex items-center gap-1 sm:gap-3">
          <Link
            href="/entrar"
            className="hidden px-3 py-2 text-[14.5px] font-semibold text-[#d6e6dc] hover:text-white sm:block"
          >
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
    <section className="lp-dark">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-4 pt-14 pb-20 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-14 lg:pt-20 lg:pb-28">
        <div>
          <p className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[13px] font-semibold text-[#d6e6dc]">
            <span aria-hidden className="size-2 rounded-full bg-gv-glow" />
            Anúncios simples para negócios locais
          </p>
          <h1 className="mt-6 text-[clamp(2.5rem,5.2vw,4.25rem)] leading-[1.03] font-bold tracking-[-0.045em] text-balance">
            Da foto ao cliente no WhatsApp.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-[#b6c8bc] sm:text-xl">
            Tire a foto do que você quer vender, diga o preço e escolha quanto investir. O anúncio vai para o Instagram
            e o Facebook e os clientes chamam você direto no WhatsApp.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <CtaLink size="lg">Criar meu anúncio</CtaLink>
            <a
              href="#como-funciona"
              className="inline-flex h-13 items-center rounded-xl border border-white/20 bg-white/5 px-6 font-semibold text-white transition-colors hover:border-white/35 hover:bg-white/10"
            >
              Ver como funciona
            </a>
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-[#9fb3a6]">
            <Tick>R$ 199 por mês no piloto</Tick>
            <Tick>Pronto em poucos minutos</Tick>
            <Tick>Só roda com o seu ok</Tick>
          </ul>
        </div>

        <HeroDemo />
      </div>
    </section>
  );
}

function Segments() {
  return (
    <section aria-labelledby="para-quem" className="border-b border-gv-line bg-gv-paper">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-8 sm:px-8 lg:flex-row lg:items-center lg:gap-8">
        <h2 id="para-quem" className="shrink-0 text-[15px] font-semibold text-gv-mute">
          Feito para o comércio do bairro
        </h2>
        <ul className="flex flex-wrap gap-2">
          {segments.map((s) => (
            <li key={s} className="rounded-full border border-gv-line bg-white px-3.5 py-1.5 text-sm font-medium">
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- começa pela foto */

function PhotoStart() {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return (
    <section aria-labelledby="foto-titulo" className="mx-auto max-w-[1240px] px-4 pt-24 sm:px-8 lg:pt-32">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
        <figure className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática da LP, já otimizada */}
          <img
            src={`${base}/lp/foto-do-produto.jpg`}
            alt="Dona de padaria fotografando um bolo com o celular no balcão da loja"
            width={1536}
            height={1024}
            loading="lazy"
            className="aspect-[3/2] w-full rounded-[28px] object-cover shadow-[0_40px_80px_-40px_rgb(6_40_20/0.6)]"
          />
          <figcaption className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold shadow-lg">
            <span className="size-2 rounded-full bg-gv-glow" />
            Foto do celular serve
          </figcaption>
        </figure>
        <div>
          <p className="font-semibold text-gv-green">Sem designer, sem agência</p>
          <h2
            id="foto-titulo"
            className="mt-3 text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.06] font-bold tracking-[-0.04em]"
          >
            Tudo começa com uma foto do seu produto
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-gv-mute">
            Você fotografa o que quer vender, diz o preço e o que destacar. A gente transforma em cinco versões de
            anúncio com a sua foto e coloca no Instagram e no Facebook, levando as pessoas direto para o seu WhatsApp.
          </p>
          <ul className="mt-8 grid gap-3 text-[17px]">
            {["Foto e preço do produto", "Cinco versões prontas para aprovar", "Clientes chamando no WhatsApp"].map(
              (t, i) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gv-green text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ),
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- comparação */

function Compare() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-24 sm:px-8 lg:py-32">
      <h2 className="max-w-3xl text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.06] font-bold tracking-[-0.04em]">
        Anunciar no Instagram não precisa de agência nem de curso de tráfego.
      </h2>
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        <CompareCard title="Contratar agência" verdict="Caro para um negócio pequeno">
          Reunião, briefing, espera pela arte e um contrato mensal que pesa no caixa. Cada ajuste é um novo pedido.
        </CompareCard>
        <CompareCard title="Fazer sozinho" verdict="Horas de trabalho e medo de errar">
          Arte no Canva, texto do zero e o Gerenciador de Anúncios cheio de opções. Um erro no orçamento sai do seu
          bolso.
        </CompareCard>
        <div className="relative rounded-3xl bg-gv-night p-8 text-white shadow-[0_30px_60px_-30px_rgb(6_40_20/0.7)]">
          <span className="absolute -top-3 left-8 rounded-full bg-gv-green px-3 py-1 text-xs font-bold">
            Com o GereVendas Ads
          </span>
          <h3 className="text-xl font-bold">Você manda a foto, a IA monta</h3>
          <p className="mt-3 leading-relaxed text-[#b6c8bc]">
            A foto do produto, o preço e o que você quer destacar viram cinco anúncios e a campanha pronta no Facebook e
            no Instagram, esperando o seu ok para gastar qualquer real.
          </p>
          <p className="mt-6 flex items-center gap-2 font-semibold text-gv-mint">
            <CheckIcon />
            R$ 199 por mês, sem fazer arte nem configurar campanha
          </p>
        </div>
      </div>
    </section>
  );
}

function CompareCard({ title, verdict, children }: { title: string; verdict: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-gv-line bg-gv-paper p-8">
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="mt-3 leading-relaxed text-gv-mute">{children}</p>
      <p className="mt-6 flex items-center gap-2 font-semibold text-gv-ink/70">
        <CrossIcon />
        {verdict}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- vitrine */

function Showcase() {
  return (
    <section id="exemplos" className="scroll-mt-20">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-end">
          <h2 className="text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.06] font-bold tracking-[-0.04em]">
            Uma rodada, cinco anúncios diferentes
          </h2>
          <p className="text-lg leading-relaxed text-gv-mute">
            Você testa jeitos diferentes de chamar o cliente e descobre qual traz mais conversa. Todas saem no tamanho
            do feed e dos stories.
          </p>
        </div>

        <ul className="mt-14 grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-5 lg:items-center">
          {BAKERY_ROUND.map(({ ad, stories }) => (
            <li key={ad.template} className={cn(stories && "md:row-span-2 lg:row-span-1")}>
              <div className="overflow-hidden rounded-2xl shadow-[0_24px_40px_-24px_rgb(6_40_20/0.55)]">
                <BakeryAd ad={ad} stories={stories} />
              </div>
              <p className="mt-3 text-sm font-semibold">
                {TEMPLATE_LABELS[ad.template]}
                <span className="font-normal text-gv-mute">{stories ? ", formato stories" : ", formato feed"}</span>
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-gv-mute">
          Peças de uma padaria fictícia, para mostrar o formato. As suas usam os seus dados.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- controle do dinheiro */

function Control() {
  const points = [
    {
      title: "Toda campanha nasce pausada",
      text: "Criamos a campanha no Facebook e no Instagram sem veicular. Nada é gasto até a ativação.",
    },
    {
      title: "Teto de gasto fechado",
      text: "Você define quanto por dia e por quantos dias. O gasto não passa do total que você confirmou.",
    },
    {
      title: "A IA não inventa",
      text: "Preço, promoção, depoimento e resultado só entram no anúncio se você informou.",
    },
    {
      title: "Você pausa quando quiser",
      text: "Um botão no painel interrompe a campanha. Sem ligar para ninguém.",
    },
  ];

  return (
    <section className="lp-dark">
      <div className="mx-auto grid max-w-[1240px] gap-14 px-4 py-24 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-32">
        <div>
          <h2 className="text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.06] font-bold tracking-[-0.04em]">
            Nenhum real sai sem o seu ok.
          </h2>
          <ul className="mt-10 grid gap-7 sm:grid-cols-2">
            {points.map((p) => (
              <li key={p.title}>
                <p className="flex items-center gap-2 font-bold text-white">
                  <span className="text-gv-mint">
                    <CheckIcon />
                  </span>
                  {p.title}
                </p>
                <p className="mt-2 leading-relaxed text-[#b6c8bc]">{p.text}</p>
              </li>
            ))}
          </ul>
        </div>

        <div aria-hidden className="mx-auto w-full max-w-md">
          <div className="rounded-3xl bg-white p-7 text-gv-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8)]">
            <div className="flex items-center gap-4">
              <div className="w-14 shrink-0 overflow-hidden rounded-lg">
                <BakeryAd ad={BAKERY.ad} />
              </div>
              <div className="min-w-0">
                <p className="font-bold">Ativar &quot;Café da manhã completo&quot;?</p>
                <p className="text-sm text-gv-mute">Facebook e Instagram</p>
              </div>
            </div>
            <dl className="mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-gv-paper p-4 text-sm">
              <div>
                <dt className="text-gv-mute">Por dia</dt>
                <dd className="mt-0.5 text-lg font-bold">R$ 20</dd>
              </div>
              <div>
                <dt className="text-gv-mute">Duração</dt>
                <dd className="mt-0.5 text-lg font-bold">7 dias</dd>
              </div>
              <div>
                <dt className="text-gv-mute">Máximo</dt>
                <dd className="mt-0.5 text-lg font-bold text-gv-green">R$ 140</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm leading-relaxed text-gv-mute">
              A verba é cobrada à parte da mensalidade. Dá para pausar a qualquer momento.
            </p>
            <div className="mt-6 flex gap-3">
              <span className="flex-1 rounded-xl border border-gv-line py-3 text-center text-sm font-semibold">
                Voltar
              </span>
              <span className="flex-[1.6] rounded-xl bg-gv-green py-3 text-center text-sm font-bold text-white">
                Confirmar R$ 20 por dia
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- resultados */

function Results() {
  return (
    <section className="bg-gv-paper">
      <div className="mx-auto grid max-w-[1240px] gap-14 px-4 py-24 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:py-32">
        <div aria-hidden className="order-last lg:order-first">
          <div className="rounded-3xl border border-gv-line bg-white p-6 shadow-[0_30px_60px_-34px_rgb(6_40_20/0.5)] sm:p-7">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 rounded-2xl bg-gv-night p-5 text-white sm:col-span-1">
                <p className="text-sm text-white/70">Investido</p>
                <p className="mt-1 text-2xl font-bold">R$ 86,40</p>
              </div>
              <Metric label="Conversas" value="27" />
              <Metric label="Por conversa" value="R$ 3,20" />
            </div>
            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-gv-line p-4">
              <div className="w-16 shrink-0 overflow-hidden rounded-lg">
                <BakeryAd ad={BAKERY.ad} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">Café da manhã completo</p>
                <p className="mt-0.5 text-sm text-gv-mute">R$ 20 por dia, 7 dias</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3f4ec] px-2.5 py-1 text-xs font-bold text-[#12795a]">
                <span className="size-1.5 rounded-full bg-[#12795a]" />
                Rodando
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm text-gv-mute">Números fictícios, só para mostrar o painel.</p>
        </div>

        <div>
          <h2 className="text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.06] font-bold tracking-[-0.04em]">
            Veja o que cada anúncio trouxe
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-gv-mute">
            No app, cada anúncio mostra quanto já foi investido, quantas conversas começou no WhatsApp e quanto custou
            cada uma. Se uma conversa virou venda, você registra ali mesmo.
          </p>
          <CtaLink size="lg" className="mt-9">
            Criar meu anúncio
          </CtaLink>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-span-3 rounded-2xl border border-gv-line p-5 sm:col-span-1">
      <p className="text-sm text-gv-mute">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- preço */

function Pricing() {
  return (
    <section id="preco" className="scroll-mt-20">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-8 lg:py-32">
        <div className="grid overflow-hidden rounded-[32px] border border-gv-line lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="lp-dark p-8 sm:p-12">
            <p className="font-semibold text-gv-mint">Plano do piloto</p>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="text-[clamp(3.4rem,8vw,5.5rem)] leading-none font-bold tracking-[-0.05em]">R$ 199</span>
              <span className="text-lg font-semibold text-[#b6c8bc]">por mês</span>
            </p>
            <p className="mt-5 max-w-sm leading-relaxed text-[#b6c8bc]">
              Valor fixo pela ferramenta, sem contrato de agência e sem precisar de designer.
            </p>
            <CtaLink size="lg" className="mt-9 w-full sm:w-auto">
              Criar meu anúncio
            </CtaLink>
          </div>
          <div className="bg-white p-8 sm:p-12">
            <h2 className="text-2xl font-bold tracking-[-0.02em] sm:text-3xl">O que entra na mensalidade</h2>
            <ul className="mt-7 grid gap-4 text-[17px]">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 text-gv-green">
                    <CheckIcon />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 rounded-2xl bg-gv-paper p-5 text-[15px] leading-relaxed text-gv-mute">
              A verba dos anúncios não está incluída: você define o valor por dia de cada campanha e paga à parte.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- dúvidas */

function Faq() {
  return (
    <section id="duvidas" className="scroll-mt-20 bg-gv-paper">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-4 py-24 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-32">
        <h2 className="text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.06] font-bold tracking-[-0.04em]">Dúvidas comuns</h2>
        <div className="divide-y divide-gv-line border-y border-gv-line">
          {faq.map((f) => (
            <details key={f.q} className="lp-faq group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg font-semibold">
                {f.q}
                <span
                  aria-hidden
                  className="lp-faq-icon grid size-8 shrink-0 place-items-center rounded-full border border-gv-line text-xl leading-none text-gv-green transition-transform"
                >
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-6 leading-relaxed text-gv-mute">{f.a}</p>
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
      <div className="mx-auto max-w-[1240px] px-4 py-28 text-center sm:px-8 lg:py-36">
        <h2 className="mx-auto max-w-3xl text-[clamp(2.2rem,5vw,4.2rem)] leading-[1.04] font-bold tracking-[-0.045em]">
          Mande a foto. O anúncio fica com a gente.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#b6c8bc]">
          R$ 199 por mês no piloto. A campanha só vai ao ar com a sua confirmação.
        </p>
        <CtaLink size="lg" className="mt-10">
          Criar meu anúncio
        </CtaLink>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/6 bg-[#040c07] text-[#9fb3a6]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div>
          <BrandLogo tone="light" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">Um produto Gere Vendas para quem vende no bairro.</p>
        </div>
        <nav aria-label="Rodapé" className="flex flex-col gap-3 text-sm">
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
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2 border-t border-white/6 px-4 py-6 text-[13px] sm:flex-row sm:justify-between sm:px-8">
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
        "lp-btn-primary inline-flex items-center justify-center rounded-xl bg-gv-green font-bold whitespace-nowrap text-white transition-colors hover:bg-gv-green-strong",
        size === "sm" ? "h-10 px-4 text-sm" : "h-13 px-7 text-base",
        className,
      )}
    >
      {children}
    </Link>
  );
}

function Tick({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="text-gv-mint">
        <CheckIcon />
      </span>
      {children}
    </li>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-[18px] shrink-0"
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
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
