"use client";

import type { ReactNode } from "react";
import { UFS } from "@/contracts/common";
import { OBJECTIVES, OBJECTIVE_LABELS, TONES, TONE_LABELS, type Objective } from "@/contracts/onboarding";
import { Badge } from "@/components/ui/badge";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { formatCents, parseBRLToCents } from "@/lib/money";
import { formatBrazilWhatsapp, normalizeBrazilWhatsapp } from "@/lib/phone";
import type { Errors, FormState } from "./form-state";

type StepProps = {
  form: FormState;
  errors: Errors;
  update: <K extends keyof FormState>(section: K, patch: Partial<FormState[K]>) => void;
};

const SEGMENTS = [
  "Alimentação",
  "Beleza e estética",
  "Saúde",
  "Moda",
  "Casa e construção",
  "Serviços automotivos",
  "Educação",
  "Pets",
  "Serviços profissionais",
];

function Lead({ children }: { children: ReactNode }) {
  return <p className="-mt-3 mb-6 text-[15px] text-ink-soft">{children}</p>;
}

function invalid(errors: Errors, id: string) {
  return { "aria-invalid": Boolean(errors[id]), "aria-describedby": describedBy(id, errors[id]) };
}

export function BusinessStep({ form, errors, update }: StepProps) {
  const b = form.business;
  return (
    <>
      <Lead>O básico para a IA entender quem você é e onde atende.</Lead>
      <div className="grid gap-5">
        <Field id="business.name" label="Nome do negócio" error={errors["business.name"]}>
          <Input
            id="business.name"
            value={b.name}
            onChange={(e) => update("business", { name: e.target.value })}
            autoComplete="organization"
            {...invalid(errors, "business.name")}
          />
        </Field>
        <fieldset>
          <legend className="mb-2.5 text-sm font-semibold">Segmento</legend>
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={b.segment === s}
                onClick={() => update("business", { segment: s })}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                  b.segment === s ? "border-ink bg-ink text-white" : "border-line-strong hover:bg-surface-muted",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Field id="business.segment" label="Outro segmento" error={errors["business.segment"]}>
              <Input
                id="business.segment"
                value={SEGMENTS.includes(b.segment) ? "" : b.segment}
                placeholder="Ex.: Floricultura"
                onChange={(e) => update("business", { segment: e.target.value })}
                {...invalid(errors, "business.segment")}
              />
            </Field>
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
          <Field id="business.city" label="Cidade" error={errors["business.city"]}>
            <Input
              id="business.city"
              value={b.city}
              onChange={(e) => update("business", { city: e.target.value })}
              autoComplete="address-level2"
              {...invalid(errors, "business.city")}
            />
          </Field>
          <Field id="business.state" label="Estado" error={errors["business.state"]}>
            <Select
              id="business.state"
              value={b.state}
              onChange={(e) => update("business", { state: e.target.value })}
              {...invalid(errors, "business.state")}
            >
              <option value="">UF</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          id="business.whatsapp"
          label="WhatsApp"
          optional
          error={errors["business.whatsapp"]}
          hint="Ex.: (19) 99999-0000"
        >
          <Input
            id="business.whatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={b.whatsapp}
            onChange={(e) => update("business", { whatsapp: e.target.value })}
            onBlur={() => {
              const e164 = normalizeBrazilWhatsapp(b.whatsapp);
              if (/^\+55\d{10,11}$/.test(e164)) update("business", { whatsapp: formatBrazilWhatsapp(e164) });
            }}
            {...invalid(errors, "business.whatsapp")}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="business.instagram_handle"
            label="Instagram"
            optional
            error={errors["business.instagram_handle"]}
            hint="Só o usuário, ex.: padaria.dobairro"
          >
            <Input
              id="business.instagram_handle"
              value={b.instagram_handle}
              onChange={(e) => update("business", { instagram_handle: e.target.value })}
              autoCapitalize="none"
              {...invalid(errors, "business.instagram_handle")}
            />
          </Field>
          <Field
            id="business.website_url"
            label="Site"
            optional
            error={errors["business.website_url"]}
            hint="Começando com https://"
          >
            <Input
              id="business.website_url"
              type="url"
              inputMode="url"
              value={b.website_url}
              onChange={(e) => update("business", { website_url: e.target.value })}
              autoCapitalize="none"
              placeholder="https://"
              {...invalid(errors, "business.website_url")}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">
            Concorrentes <span className="font-normal text-ink-faint">(opcional, até 3)</span>
          </legend>
          <p className="mt-1 mb-3 text-sm text-ink-faint">
            Quem disputa clientes com você. Nome e, se souber, o @ do Instagram ou o site. A IA também procura outros na
            sua região.
          </p>
          <div className="grid gap-2.5">
            {b.competitors.slice(0, 3).map((c, i) => (
              <Input
                key={i}
                aria-label={`Concorrente ${i + 1}`}
                value={c}
                maxLength={120}
                onChange={(e) => {
                  const list = [...b.competitors];
                  list[i] = e.target.value;
                  update("business", { competitors: list });
                }}
                placeholder={
                  ["Ex.: Pet Shop Amigo (@petshopamigo)", "Ex.: Clínica Bicho Feliz", "Ex.: petcenter.com.br"][i]
                }
                aria-invalid={Boolean(errors[`business.competitors.${i}`])}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </>
  );
}

export function OfferStep({ form, errors, update }: StepProps) {
  const o = form.offer;
  return (
    <>
      <Lead>Escolha um produto ou serviço para anunciar primeiro. Dá para adicionar outros depois.</Lead>
      <div className="grid gap-5">
        <Field id="offer.name" label="Produto ou serviço" error={errors["offer.name"]}>
          <Input
            id="offer.name"
            value={o.name}
            onChange={(e) => update("offer", { name: e.target.value })}
            {...invalid(errors, "offer.name")}
          />
        </Field>
        <Field
          id="offer.description"
          label="Descreva em poucas linhas"
          error={errors["offer.description"]}
          hint={`${o.description.trim().length}/600 caracteres`}
        >
          <Textarea
            id="offer.description"
            value={o.description}
            maxLength={600}
            onChange={(e) => update("offer", { description: e.target.value })}
            {...invalid(errors, "offer.description")}
          />
        </Field>

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 text-sm font-semibold">Mostrar preço no anúncio?</legend>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: false, label: "Não mostrar" },
              { v: true, label: "Mostrar preço" },
            ].map((opt) => (
              <label
                key={String(opt.v)}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
                  o.show_price === opt.v
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-line-strong hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="show_price"
                  className="accent-[var(--brand)]"
                  checked={o.show_price === opt.v}
                  onChange={() => update("offer", { show_price: opt.v })}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        {o.show_price && (
          <div className="grid gap-4 rounded-xl border border-line bg-canvas p-4">
            <Field
              id="offer.price"
              label="Preço"
              error={errors["offer.price"]}
              hint={
                parseBRLToCents(o.price) != null
                  ? `Aparece como ${formatCents(parseBRLToCents(o.price)!)}`
                  : "Ex.: 24,90"
              }
            >
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-ink-faint">
                  R$
                </span>
                <Input
                  id="offer.price"
                  inputMode="decimal"
                  className="pl-10"
                  value={o.price}
                  onChange={(e) => update("offer", { price: e.target.value })}
                  {...invalid(errors, "offer.price")}
                />
              </div>
            </Field>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--brand)]"
                checked={o.price_confirmed_by_client}
                onChange={(e) => update("offer", { price_confirmed_by_client: e.target.checked })}
                aria-invalid={Boolean(errors["offer.price_confirmed_by_client"])}
                aria-describedby={describedBy(
                  "offer.price_confirmed_by_client",
                  errors["offer.price_confirmed_by_client"],
                )}
              />
              <span>Confirmo que este preço é real e está valendo hoje.</span>
            </label>
            {errors["offer.price_confirmed_by_client"] && (
              <p id="offer.price_confirmed_by_client-error" role="alert" className="-mt-2 text-sm text-danger">
                {errors["offer.price_confirmed_by_client"]}
              </p>
            )}
          </div>
        )}

        <fieldset>
          <legend className="text-sm font-semibold">
            Diferenciais <span className="font-normal text-ink-faint">(opcional, até 3)</span>
          </legend>
          <p className="mt-1 mb-3 text-sm text-ink-faint">Só o que for verdade e você puder cumprir.</p>
          <div className="grid gap-2.5">
            {o.differentiators.slice(0, 3).map((d, i) => (
              <Input
                key={i}
                aria-label={`Diferencial ${i + 1}`}
                value={d}
                onChange={(e) => {
                  const list = [...o.differentiators];
                  list[i] = e.target.value;
                  update("offer", { differentiators: list });
                }}
                placeholder={
                  ["Ex.: Entrega em até 30 minutos", "Ex.: Atendimento aos domingos", "Ex.: Estacionamento próprio"][i]
                }
                aria-invalid={Boolean(errors[`offer.differentiators.${i}`])}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </>
  );
}

export function AudienceStep({ form, errors, update }: StepProps) {
  const a = form.audience;
  return (
    <>
      <Lead>Quem costuma comprar de você? Use as suas palavras.</Lead>
      <div className="grid gap-5">
        <Field
          id="audience.description"
          label="Quem são seus clientes"
          error={errors["audience.description"]}
          hint="Ex.: famílias do bairro, trabalhadores da região no café da manhã."
        >
          <Textarea
            id="audience.description"
            value={a.description}
            maxLength={600}
            onChange={(e) => update("audience", { description: e.target.value })}
            {...invalid(errors, "audience.description")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-5">
          <Field id="audience.age_min" label="Idade mínima" error={errors["audience.age_min"]}>
            <Input
              id="audience.age_min"
              type="number"
              inputMode="numeric"
              min={18}
              max={65}
              value={a.age_min}
              onChange={(e) => update("audience", { age_min: e.target.value })}
              {...invalid(errors, "audience.age_min")}
            />
          </Field>
          <Field id="audience.age_max" label="Idade máxima" error={errors["audience.age_max"]}>
            <Input
              id="audience.age_max"
              type="number"
              inputMode="numeric"
              min={18}
              max={65}
              value={a.age_max}
              onChange={(e) => update("audience", { age_max: e.target.value })}
              {...invalid(errors, "audience.age_max")}
            />
          </Field>
        </div>
        <Field
          id="audience.service_radius_km"
          label="Raio de atendimento (km)"
          optional
          error={errors["audience.service_radius_km"]}
          hint="Até onde você entrega ou de onde vêm seus clientes."
        >
          <Input
            id="audience.service_radius_km"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={a.service_radius_km}
            onChange={(e) => update("audience", { service_radius_km: e.target.value })}
            {...invalid(errors, "audience.service_radius_km")}
          />
        </Field>
      </div>
    </>
  );
}

export function GoalStep({ form, errors, update }: StepProps) {
  const error = errors["goal.objective"];
  return (
    <>
      <Lead>O que você quer que as pessoas façam ao ver o anúncio?</Lead>
      <fieldset aria-describedby={error ? "goal.objective-error" : undefined}>
        <legend className="sr-only">Objetivo</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {OBJECTIVES.map((key: Objective) => {
            const selected = form.goal.objective === key;
            return (
              <label
                key={key}
                className={cn(
                  "flex cursor-pointer gap-4 rounded-2xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                  selected ? "border-brand bg-brand-soft" : "border-line-strong hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="objective"
                  value={key}
                  className="sr-only"
                  checked={selected}
                  onChange={() => update("goal", { objective: key })}
                />
                <span
                  aria-hidden
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-xl",
                    selected ? "bg-brand text-white" : "bg-surface-muted text-ink-soft",
                  )}
                >
                  <ObjectiveIcon objective={key} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{OBJECTIVE_LABELS[key].title}</span>
                  <span className="text-sm text-ink-soft">{OBJECTIVE_LABELS[key].description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {error && (
        <p id="goal.objective-error" role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}

const TONE_EXAMPLES: Record<(typeof TONES)[number], string> = {
  acolhedor: "Passa aqui que a gente te atende com carinho.",
  direto: "Pediu, chegou. Simples assim.",
  premium: "Feito com cuidado, para quem exige o melhor.",
  divertido: "Bateu a fome? Chama a gente!",
  tecnico: "Diagnóstico completo, com laudo e garantia.",
};

function ObjectiveIcon({ objective }: { objective: Objective }) {
  const paths: Record<Objective, ReactNode> = {
    mensagens_whatsapp: <path d="M4 18l1.4-4A7.5 7.5 0 1 1 9 17.4L4 18z" />,
    visitas_perfil: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="5" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="16.8" cy="7.2" r="0.6" fill="currentColor" />
      </>
    ),
    trafego_site: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4c2.5 2.6 2.5 13.4 0 16M12 4c-2.5 2.6-2.5 13.4 0 16" />
      </>
    ),
    reconhecimento_local: (
      <>
        <path d="M12 21s-6-5.3-6-10.5a6 6 0 1 1 12 0C18 15.7 12 21 12 21z" />
        <circle cx="12" cy="10.5" r="2.2" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[objective]}
    </svg>
  );
}

const SWATCHES = ["#2A45E8", "#C2410C", "#0F766E", "#7C3AED", "#BE123C", "#111827"];

export function IdentityStep({ form, errors, update }: StepProps) {
  const i = form.identity;
  const valid = /^#[0-9A-Fa-f]{6}$/.test(i.brand_primary_color);
  return (
    <>
      <Lead>Como seus anúncios devem parecer e soar.</Lead>
      <div className="grid gap-6">
        <fieldset>
          <legend className="mb-3 text-sm font-semibold">Cor principal da marca</legend>
          <div className="flex flex-wrap items-center gap-3">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Usar a cor ${c}`}
                aria-pressed={i.brand_primary_color.toUpperCase() === c}
                onClick={() => update("identity", { brand_primary_color: c })}
                className={cn(
                  "size-9 rounded-full ring-offset-2 transition",
                  i.brand_primary_color.toUpperCase() === c && "ring-2 ring-ink",
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input
                type="color"
                value={valid ? i.brand_primary_color : "#000000"}
                onChange={(e) => update("identity", { brand_primary_color: e.target.value.toUpperCase() })}
                className="size-9 cursor-pointer rounded-full border border-line-strong bg-transparent"
                aria-label="Escolher outra cor"
              />
              Outra
            </label>
          </div>
          <div className="mt-3 max-w-40">
            <Input
              aria-label="Código da cor"
              value={i.brand_primary_color}
              onChange={(e) => update("identity", { brand_primary_color: e.target.value })}
              {...invalid(errors, "identity.brand_primary_color")}
            />
          </div>
          {errors["identity.brand_primary_color"] && (
            <p id="identity.brand_primary_color-error" role="alert" className="mt-1.5 text-sm text-danger">
              {errors["identity.brand_primary_color"]}
            </p>
          )}
        </fieldset>

        <fieldset aria-describedby={errors["identity.tone_of_voice"] ? "identity.tone_of_voice-error" : undefined}>
          <legend className="mb-3 text-sm font-semibold">Tom de voz</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {TONES.map((t) => (
              <label
                key={t}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                  i.tone_of_voice === t ? "border-ink bg-ink text-white" : "border-line-strong hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="tone"
                  value={t}
                  className="sr-only"
                  checked={i.tone_of_voice === t}
                  onChange={() => update("identity", { tone_of_voice: t })}
                />
                <span className="text-sm font-semibold">{TONE_LABELS[t]}</span>
                <span className={cn("text-sm", i.tone_of_voice === t ? "text-white/80" : "text-ink-soft")}>
                  “{TONE_EXAMPLES[t]}”
                </span>
              </label>
            ))}
          </div>
          {errors["identity.tone_of_voice"] && (
            <p id="identity.tone_of_voice-error" role="alert" className="mt-2 text-sm text-danger">
              {errors["identity.tone_of_voice"]}
            </p>
          )}
        </fieldset>
      </div>
    </>
  );
}

export function ReviewStep({
  form,
  errors,
  update,
  onEdit,
  demo,
}: StepProps & { onEdit: (step: number) => void; demo: boolean }) {
  const { business: b, offer: o, audience: a } = form;
  const price = o.show_price ? parseBRLToCents(o.price) : null;
  const stepErrors = Object.entries(errors).filter(([k]) => !k.startsWith("review."));
  return (
    <>
      <Lead>Confira o resumo. É a partir dele que a IA vai trabalhar.</Lead>
      {stepErrors.length > 0 && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          <p className="font-semibold">Faltam alguns ajustes:</p>
          <ul className="mt-1 list-disc pl-5">
            {stepErrors.map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
        </div>
      )}
      <dl className="grid gap-3">
        <Summary title="Negócio" onEdit={() => onEdit(1)}>
          {b.name || "—"} · {b.segment || "—"} · {b.city || "—"}
          {b.state && `/${b.state}`}
          <br />
          {[
            b.whatsapp && `WhatsApp ${b.whatsapp}`,
            b.instagram_handle && `@${b.instagram_handle.replace(/^@/, "")}`,
            b.website_url,
          ]
            .filter(Boolean)
            .join(" · ") || "Sem canais informados"}
          {b.competitors.some((c) => c.trim()) && (
            <>
              <br />
              Concorrentes: {b.competitors.filter((c) => c.trim()).join("; ")}
            </>
          )}
        </Summary>
        <Summary title="Oferta" onEdit={() => onEdit(2)}>
          <span className="font-medium text-ink">{o.name || "—"}</span>
          {price != null && <> · {formatCents(price)}</>}
          <br />
          {o.description || "—"}
          {o.differentiators.some((d) => d.trim()) && (
            <>
              <br />
              Diferenciais: {o.differentiators.filter((d) => d.trim()).join("; ")}
            </>
          )}
        </Summary>
        <Summary title="Público" onEdit={() => onEdit(3)}>
          {a.description || "—"}
          <br />
          {a.age_min}–{a.age_max} anos{a.service_radius_km && ` · até ${a.service_radius_km} km`}
        </Summary>
        <Summary title="Objetivo" onEdit={() => onEdit(4)}>
          {form.goal.objective ? OBJECTIVE_LABELS[form.goal.objective as Objective].title : "—"}
        </Summary>
        <Summary title="Identidade" onEdit={() => onEdit(5)}>
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="size-3.5 rounded-full"
              style={{ backgroundColor: form.identity.brand_primary_color }}
            />
            {form.identity.brand_primary_color}
            {form.identity.tone_of_voice &&
              ` · Tom ${TONE_LABELS[form.identity.tone_of_voice as (typeof TONES)[number]].toLowerCase()}`}
          </span>
        </Summary>
      </dl>

      <label className="mt-6 flex items-start gap-3 rounded-xl border border-line-strong bg-canvas p-4 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--brand)]"
          checked={form.review.facts_confirmed}
          onChange={(e) => update("review", { facts_confirmed: e.target.checked })}
          aria-invalid={Boolean(errors["review.facts_confirmed"])}
          aria-describedby={describedBy("review.facts_confirmed", errors["review.facts_confirmed"])}
        />
        <span>
          Confirmo que as informações acima são verdadeiras. A IA vai usá-las como base e não deve inventar preços,
          resultados ou depoimentos.
        </span>
      </label>
      {errors["review.facts_confirmed"] && (
        <p id="review.facts_confirmed-error" role="alert" className="mt-2 text-sm text-danger">
          {errors["review.facts_confirmed"]}
        </p>
      )}
      {demo && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-faint">
          <Badge tone="demo">Simulação</Badge> Concluir não envia nada a servidores.
        </p>
      )}
    </>
  );
}

function Summary({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-4">
      <div className="min-w-0">
        <dt className="text-xs font-semibold tracking-wider text-ink-faint uppercase">{title}</dt>
        <dd className="mt-1 text-[15px] leading-relaxed break-words text-ink-soft">{children}</dd>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-brand hover:bg-brand-soft"
      >
        Editar<span className="sr-only"> {title.toLowerCase()}</span>
      </button>
    </div>
  );
}
