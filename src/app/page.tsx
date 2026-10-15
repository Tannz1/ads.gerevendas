import { AdPreview } from "@/components/marketing/ad-preview";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const steps = [
  {
    n: "01",
    title: "Conte sobre o seu negócio",
    text: "Seis etapas curtas: o que você vende, para quem, onde atende e como quer ser visto. Dá para parar e continuar depois.",
  },
  {
    n: "02",
    title: "Receba estratégia e peças",
    text: "A IA propõe a abordagem e conceitos de anúncio a partir só do que você informou. Nada de preço ou resultado inventado.",
  },
  {
    n: "03",
    title: "Ajuste do seu jeito",
    text: "Edite título, texto, preço, cor e imagem num editor feito para o formato do feed e dos stories.",
  },
  {
    n: "04",
    title: "Publique quando aprovar",
    text: "As campanhas nascem pausadas. Só vão ao ar depois da sua confirmação do valor da mídia.",
  },
];

const guarantees = [
  "Campanhas sempre criadas pausadas",
  "Nenhum gasto sem a sua confirmação explícita",
  "A IA não inventa preços, depoimentos ou resultados",
  "Seus acessos ficam protegidos no servidor, nunca no navegador",
];

const included = [
  "Cadastro guiado do negócio e da oferta",
  "Estratégia e conceitos de anúncio gerados por IA",
  "Editor de peças 4:5 e 9:16",
  "Acompanhamento dos resultados das campanhas",
];

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav aria-label="Principal" className="flex items-center gap-1 sm:gap-2">
          <a
            href="#como-funciona"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink sm:block"
          >
            Como funciona
          </a>
          <a
            href="#preco"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink sm:block"
          >
            Preço
          </a>
          <ButtonLink href="/entrar" variant="secondary" size="sm">
            Entrar
          </ButtonLink>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16 lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-ink-soft">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Piloto aberto para negócios locais
            </p>
            <h1 className="mt-5 font-display text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em] text-ink sm:text-6xl">
              Anúncios para o seu negócio, prontos em minutos.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
              Conte o que você vende. A inteligência artificial monta a estratégia e as peças; você revisa, edita e só
              publica quando aprovar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/entrar" size="lg">
                Quero participar do piloto
              </ButtonLink>
              <ButtonLink href="#como-funciona" variant="secondary" size="lg">
                Ver como funciona
              </ButtonLink>
            </div>
            <p className="mt-5 text-sm text-ink-faint">
              R$ 199/mês. A verba dos anúncios é paga direto à Meta, na sua conta.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:max-w-none">
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(60%_60%_at_60%_40%,var(--brand-soft),transparent)]"
            />
            <AdPreview />
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-8 border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Do zero ao anúncio, sem precisar entender de tráfego pago.
            </h2>
            <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <li key={s.n} className="bg-surface p-6">
                  <span className="font-display text-sm font-bold text-brand">{s.n}</span>
                  <h3 className="mt-3 font-display text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Você no controle do seu dinheiro.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-soft">
              A IA sugere. Quem decide é você. Cada etapa que envolve gasto passa pela sua confirmação.
            </p>
          </div>
          <ul className="grid gap-3">
            {guarantees.map((g) => (
              <li key={g} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
                <CheckIcon />
                <span className="text-[15px] font-medium">{g}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="preco" className="scroll-mt-8 px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-ink text-white shadow-[var(--shadow-lift)]">
            <div className="grid gap-8 p-8 sm:p-10 md:grid-cols-[1fr_1.1fr]">
              <div>
                <p className="text-sm font-semibold text-white/60">Plano único</p>
                <p className="mt-3 flex items-baseline gap-1">
                  <span className="font-display text-5xl font-extrabold tracking-tight">R$ 199</span>
                  <span className="text-white/60">/mês</span>
                </p>
                <p className="mt-4 text-sm leading-relaxed text-white/70">
                  A verba de mídia não está incluída: ela é paga diretamente à Meta, dentro da sua conta de anúncios, no
                  valor que você definir.
                </p>
                <ButtonLink href="/entrar" variant="inverse" size="lg" className="mt-6 w-full">
                  Começar agora
                </ButtonLink>
              </div>
              <ul className="grid content-start gap-3 text-[15px]">
                {included.map((i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckIcon light />
                    <span className="text-white/90">{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {2026} GereVendas Ads</p>
          <p>Publicação na Meta sujeita à revisão e às políticas da plataforma.</p>
        </div>
      </footer>
    </div>
  );
}

function CheckIcon({ light }: { light?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`mt-0.5 size-5 shrink-0 ${light ? "text-accent" : "text-success"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}
