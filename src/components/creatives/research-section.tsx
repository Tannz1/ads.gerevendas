import { Badge } from "@/components/ui/badge";
import type { StoredStrategyPlan } from "@/contracts/creatives";

type Research = NonNullable<StoredStrategyPlan["research"]>;

/** Link vindo do modelo ou da busca: só http(s), nunca javascript: e afins. */
const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand hover:underline">
      {children}
    </a>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-5">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-sm text-ink-soft">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Pesquisa feita pela IA na web antes da estratégia, com as fontes clicáveis. */
export function ResearchSection({ research }: { research: Research }) {
  return (
    <section aria-labelledby="research-title" className="mt-6 border-t border-line pt-5">
      <h3 id="research-title" className="font-display text-lg font-bold">
        Pesquisa de mercado
      </h3>
      <p className="mt-1 text-sm text-ink-faint">
        Feita pela IA na web para orientar a estratégia. É contexto: confira antes de tratar como fato.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-semibold">Seu negócio na internet</p>
          <p className="mt-1 text-sm text-ink-soft">{research.business_context}</p>
        </div>
        <div>
          <p className="text-sm font-semibold">Mercado na sua região</p>
          <p className="mt-1 text-sm text-ink-soft">{research.local_market}</p>
        </div>
      </div>

      {research.competitors.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold">Concorrentes ({research.competitors.length})</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {research.competitors.map((c) => {
              const href = safeUrl(c.source_url);
              return (
                <li key={`${c.name}-${c.source_url ?? ""}`} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {href ? <ExternalLink href={href}>{c.name}</ExternalLink> : c.name}
                    {c.client_listed && <Badge>Informado por você</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{c.positioning}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {research.opportunities.length > 0 && (
        <List title="Oportunidades para se diferenciar" items={research.opportunities} />
      )}
      {research.audience_insights.length > 0 && (
        <List title="O que observar no público" items={research.audience_insights} />
      )}

      {research.sources.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-semibold">Fontes</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {research.sources.flatMap((s) => {
              const href = safeUrl(s.url);
              return href
                ? [
                    <li key={href}>
                      <ExternalLink href={href}>{s.title || domain(href)}</ExternalLink>
                    </li>,
                  ]
                : [];
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
