import { LiveDemo } from "@/components/marketing/live-demo";
import { LegalLinks } from "@/components/marketing/legal-page";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const steps = [
  {
    title: "Conte sobre o seu negócio",
    text: "O que você vende, para quem, onde atende e quanto custa. Dá para parar e continuar depois.",
  },
  {
    title: "Receba as peças prontas",
    text: "A IA monta a estratégia e cinco anúncios para feed e stories, usando só o que você informou.",
  },
  {
    title: "Ajuste o que quiser",
    text: "Troque título, texto, preço, cor e foto. Use uma foto sua ou peça uma imagem nova.",
  },
  {
    title: "Publique quando aprovar",
    text: "A campanha é criada pausada na sua conta da Meta e só vai ao ar quando você confirmar o valor por dia.",
  },
];

const included = [
  "Estratégia e cinco peças por rodada, para feed e stories",
  "Editor para ajustar texto, preço, cor e foto",
  "Imagem gerada por IA ou foto do seu negócio",
  "Campanha montada na sua conta de anúncios da Meta",
];

export default function Home() {
  return (
    <div className="overflow-x-clip bg-white">
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
        <section className="mx-auto max-w-6xl px-4 pt-10 pb-14 sm:px-6 lg:pt-16 lg:pb-20">
          <h1 className="sign-wide max-w-5xl text-[clamp(2.6rem,7.4vw,6.5rem)] leading-[0.95] font-extrabold tracking-[-0.025em] text-ink">
            Você diz o que vende. A gente faz o anúncio.
          </h1>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,34rem)_auto] lg:items-end lg:justify-between">
            <p className="text-lg leading-relaxed text-ink-soft sm:text-xl">
              Anúncios para Instagram e Facebook feitos para padaria, salão, pet shop, oficina e todo comércio de
              bairro. Você revisa, ajusta e decide quando publicar.
            </p>
            <div className="flex flex-col gap-2 sm:items-start">
              <ButtonLink href="/entrar" size="lg">
                Criar meus anúncios
              </ButtonLink>
              <p className="text-sm text-ink-faint">R$ 199 por mês durante o piloto</p>
            </div>
          </div>
        </section>

        <section aria-label="Demonstração" className="bg-[#ffd23f]">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
            <LiveDemo />
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-8">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <h2 className="sign-wide max-w-3xl text-4xl leading-none font-extrabold tracking-[-0.02em] sm:text-5xl">
              Sem agência e sem curso de tráfego.
            </h2>
            <ol className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.title} className="border-t-2 border-ink pt-5">
                  <span className="sign-wide text-5xl leading-none font-extrabold text-brand">{i + 1}</span>
                  <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-[#eef0f5]">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
            <div>
              <h2 className="sign-wide text-4xl leading-none font-extrabold tracking-[-0.02em] sm:text-5xl">
                Nenhum real sai sem você confirmar.
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-soft">
                Toda campanha nasce pausada. Para colocar no ar, você confirma o valor por dia duas vezes. A IA também
                não inventa preço, depoimento ou resultado: ela só usa o que você contou.
              </p>
            </div>

            <div aria-hidden className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-[var(--shadow-lift)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">Café da manhã completo</p>
                  <p className="text-sm text-ink-faint">Campanha no Instagram e Facebook</p>
                </div>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-warning">
                  Pausada
                </span>
              </div>
              <div className="mt-6 rounded-xl border-2 border-ink p-5">
                <p className="font-semibold">Ativar campanha com R$ 20 por dia?</p>
                <p className="mt-1 text-sm text-ink-soft">
                  O valor é cobrado pela Meta, na sua conta de anúncios. Dá para pausar quando quiser.
                </p>
                <div className="mt-5 flex gap-3">
                  <span className="rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold">Cancelar</span>
                  <span className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
                    Confirmar R$ 20 por dia
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="preco" className="scroll-mt-8">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-20 lg:py-28">
            <div className="price-tag -rotate-2 justify-self-start px-8 py-7 text-white">
              <p className="text-sm font-semibold text-white/80">Plano do piloto</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="sign-wide text-5xl leading-none font-extrabold whitespace-nowrap sm:text-7xl">
                  R$ 199
                </span>
                <span className="text-lg font-semibold whitespace-nowrap">por mês</span>
              </p>
            </div>
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">O que entra na mensalidade</h2>
              <ul className="mt-5 grid gap-3 text-[17px]">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckIcon />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-ink-soft">
                A verba dos anúncios não está incluída: ela é paga diretamente à Meta, na sua conta de anúncios, no
                valor que você definir.
              </p>
              <ButtonLink href="/entrar" size="lg" className="mt-8">
                Criar meus anúncios
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 GereVendas Ads</p>
          <p>Publicação na Meta sujeita à revisão e às políticas da plataforma.</p>
          <LegalLinks className="flex gap-4" />
        </div>
      </footer>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="mt-1 size-5 shrink-0 text-success"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}
