"use client";

import type { ReactNode } from "react";
import { BACKGROUND_OPTIONS, CreativeCanvas, TEMPLATE_OPTIONS, type DesignOfferFacts } from "@/components/creative";
import { Input, Select, Textarea } from "@/components/ui/field";
import type { BackgroundStyle, CreativeDesign } from "@/contracts/creative";
import type { TemplateKey } from "@/contracts/strategy";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";

/** Ids dos controles, usados pelos links do painel de ajustes. */
export const FIELD_IDS = {
  headline: "creative-headline",
  body: "creative-body",
  business_name: "creative-business-name",
  cta: "creative-cta",
  price: "creative-price",
  brand_color: "creative-color-hex",
  background: (key: BackgroundStyle) => `creative-background-${key}`,
  template: (key: TemplateKey) => `creative-template-${key}`,
  format: (key: CreativeDesign["format"]) => `creative-format-${key}`,
} as const;

export function EditorSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-line px-5 py-6 first:border-t-0 sm:px-7">
      <h2 id={id} className="font-display text-base font-bold">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} className="text-sm text-danger">
      {message}
    </p>
  );
}

const describe = (...ids: Array<string | false | undefined>) => ids.filter(Boolean).join(" ") || undefined;

/** Campo de texto com contador (o limite também é imposto pelo `maxLength`). */
export function CountedField({
  id,
  label,
  value,
  max,
  multiline,
  hint,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  multiline?: boolean;
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const length = value.length;
  const props = {
    id,
    value,
    maxLength: max,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    "aria-invalid": Boolean(error),
    "aria-describedby": describe(`${id}-count`, hint && `${id}-hint`, error && `${id}-error`),
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        <span
          aria-hidden
          className={cn("text-xs tabular-nums", length >= max ? "font-semibold text-warning" : "text-ink-faint")}
        >
          {length}/{max}
        </span>
        <span id={`${id}-count`} className="sr-only">
          {length} de {max} caracteres
        </span>
      </div>
      {multiline ? <Textarea {...props} rows={3} className="min-h-20 resize-y" /> : <Input {...props} />}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-ink-faint">
          {hint}
        </p>
      )}
      <FieldError id={id} message={error} />
    </div>
  );
}

export function CtaSelect({
  value,
  options,
  error,
  onChange,
}: {
  value: string;
  options: string[];
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = FIELD_IDS.cta;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        Botão
      </label>
      <Select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describe(`${id}-hint`, error && `${id}-error`)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
      {!error && (
        <p id={`${id}-hint`} className="text-sm text-ink-faint">
          Opções que combinam com o objetivo escolhido no cadastro.
        </p>
      )}
      <FieldError id={id} message={error} />
    </div>
  );
}

/** Modelos como cartões com miniatura real da peça em cada modelo. */
export function TemplatePicker({
  design,
  error,
  onChange,
}: {
  design: CreativeDesign;
  error?: string;
  onChange: (key: TemplateKey) => void;
}) {
  const stories = design.format === "stories_9x16";
  return (
    <fieldset aria-describedby={error ? "creative-template-error" : undefined}>
      <legend className="sr-only">Modelo</legend>
      <div className="grid grid-cols-2 gap-3">
        {TEMPLATE_OPTIONS.map((option) => {
          const selected = design.template_key === option.key;
          return (
            <label
              key={option.key}
              className={cn(
                "flex cursor-pointer flex-col gap-3 rounded-xl border p-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2 sm:flex-row sm:items-center",
                selected ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line-strong hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name="template"
                id={FIELD_IDS.template(option.key)}
                value={option.key}
                checked={selected}
                onChange={() => onChange(option.key)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "flex shrink-0 items-center justify-center self-center rounded-lg bg-surface-muted",
                  stories ? "h-[124px] w-[84px]" : "h-[108px] w-[96px]",
                )}
              >
                <CreativeCanvas
                  design={{ ...design, template_key: option.key }}
                  displayWidth={stories ? 64 : 80}
                  className="rounded-[5px] shadow-sm"
                />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {option.label}
                  {selected && (
                    <svg aria-hidden viewBox="0 0 20 20" className="size-4 text-brand" fill="currentColor">
                      <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.7l-4.2 4.2a1 1 0 01-1.4 0l-2-2 1.4-1.4 1.3 1.3 3.5-3.5 1.4 1.4z" />
                    </svg>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-ink-soft">{option.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id="creative-template" message={error} />
    </fieldset>
  );
}

function backgroundSwatch(key: BackgroundStyle, brand: string): string {
  if (key === "solido") return brand;
  if (key === "claro") return "#F7F5F0";
  return `linear-gradient(135deg, ${brand} 0%, color-mix(in srgb, ${brand} 55%, #000) 100%)`;
}

export function BackgroundPicker({
  value,
  brandColor,
  error,
  onChange,
}: {
  value: BackgroundStyle;
  brandColor: string;
  error?: string;
  onChange: (key: BackgroundStyle) => void;
}) {
  const brand = /^#[0-9A-Fa-f]{6}$/.test(brandColor) ? brandColor : "#2A45E8";
  return (
    <fieldset aria-describedby={error ? "creative-background-error" : undefined}>
      <legend className="sr-only">Fundo</legend>
      <div className="grid grid-cols-3 gap-2">
        {BACKGROUND_OPTIONS.map((option) => {
          const selected = value === option.key;
          return (
            <label
              key={option.key}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2",
                selected ? "border-ink bg-ink text-white" : "border-line-strong hover:bg-surface-muted",
              )}
            >
              <input
                type="radio"
                name="background"
                id={FIELD_IDS.background(option.key)}
                value={option.key}
                checked={selected}
                onChange={() => onChange(option.key)}
                className="sr-only"
              />
              <span
                aria-hidden
                className="size-4 shrink-0 rounded-full ring-1 ring-black/15"
                style={{ background: backgroundSwatch(option.key, brand) }}
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <FieldError id="creative-background" message={error} />
    </fieldset>
  );
}

/** Preço só da oferta confirmada: o valor nunca é digitado aqui. */
export function PriceToggle({
  offer,
  checked,
  error,
  onChange,
}: {
  offer: DesignOfferFacts;
  checked: boolean;
  error?: string;
  onChange: (show: boolean) => void;
}) {
  const id = FIELD_IDS.price;
  const available = offer.price_confirmed_by_client && offer.price_cents !== null;
  const price = available && offer.price_cents !== null ? formatCents(offer.price_cents, offer.currency) : null;
  // Sem preço confirmado o controle só serve para desligar um preço que já esteja na peça.
  const disabled = !available && !checked;
  return (
    <div className="flex flex-col gap-2">
      <label
        className={cn(
          "flex items-center justify-between gap-4 rounded-xl border border-line-strong px-4 py-3",
          disabled ? "cursor-not-allowed bg-surface-muted/60" : "cursor-pointer hover:bg-surface-muted/60",
        )}
      >
        <span className={cn("text-[15px] font-semibold", disabled && "text-ink-faint")}>
          {price ? `Mostrar preço (${price})` : "Mostrar preço"}
        </span>
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={Boolean(error)}
          aria-describedby={describe(`${id}-hint`, error && `${id}-error`)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className="relative h-6 w-11 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-disabled:opacity-60 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5"
        />
      </label>
      <p id={`${id}-hint`} className="text-sm text-ink-faint">
        {available
          ? "O valor vem do preço confirmado no cadastro e não pode ser digitado aqui."
          : "A oferta não tem preço confirmado no cadastro, então a peça não pode mostrar preço."}
      </p>
      <FieldError id={id} message={error} />
    </div>
  );
}

const SWATCHES = ["#2A45E8", "#C2410C", "#0F766E", "#7C3AED", "#BE123C", "#111827"];
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function ColorPicker({
  value,
  initial,
  error,
  onChange,
}: {
  value: string;
  initial: string;
  error?: string;
  onChange: (hex: string) => void;
}) {
  const valid = HEX.test(value);
  const swatches = [...new Set([initial.toUpperCase(), ...SWATCHES])];
  const current = value.toUpperCase();
  const id = FIELD_IDS.brand_color;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Cores sugeridas">
        {swatches.map((color, i) => (
          <button
            key={color}
            type="button"
            aria-label={i === 0 ? `Usar a cor original ${color}` : `Usar a cor ${color}`}
            aria-pressed={current === color}
            onClick={() => onChange(color)}
            className={cn(
              "size-9 rounded-full ring-offset-2 ring-offset-surface transition",
              current === color ? "ring-2 ring-ink" : "ring-1 ring-black/10 hover:scale-105",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="color"
            value={valid ? value.toLowerCase() : "#000000"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="size-9 cursor-pointer appearance-none rounded-full border border-line-strong bg-transparent p-0.5 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
            aria-label="Escolher outra cor"
          />
          Outra
        </label>
      </div>
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          Código
        </label>
        <Input
          id={id}
          value={value}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="characters"
          onChange={(e) => onChange(e.target.value.trim())}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="max-w-36 font-mono uppercase"
        />
      </div>
      <FieldError id={id} message={error} />
    </div>
  );
}
