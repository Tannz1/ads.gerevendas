"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { HIGHLIGHT_KINDS, HIGHLIGHT_LABELS, type HighlightKind } from "@/contracts/products";
import { cn } from "@/lib/cn";
import { parseBRLToCents } from "@/lib/money";
import { createProduct, uploadProductPhoto } from "@/server/products";
import { ProductThumb } from "./product-card";
import { bigButton, ScreenHeader } from "./shell";

type Step = "produto" | "oferta";

/** Telas 2 (Produto) e 3 (Oferta). Preço e destaques são o que o dono digitou: a IA não inventa. */
export function ProductForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("produto");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<{ file: File; asset_id: string } | null>(null);
  const [rights, setRights] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [noPrice, setNoPrice] = useState(false);
  const [highlights, setHighlights] = useState<Partial<Record<HighlightKind, string>>>({});
  const [details, setDetails] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [requestKey] = useState(() => `prod_${crypto.randomUUID()}`);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setErrors((e) => ({ ...e, file: "" }));
  }

  function goOffer() {
    const next: Record<string, string> = {};
    if (!file) next.file = "Escolha uma foto do produto.";
    else if (!rights) next.rights = "Confirme que você pode usar esta foto.";
    if (name.trim().length < 2) next.name = "Escreva o nome do produto.";
    setErrors(next);
    if (Object.keys(next).length) return;
    if (uploaded?.file === file) return setStep("oferta");

    setMessage(null);
    start(async () => {
      const fd = new FormData();
      fd.set("file", file!);
      fd.set("rights", "on");
      const res = await uploadProductPhoto(fd).catch(() => null);
      if (!res) return setMessage("Não foi possível enviar a foto. Confira sua internet e tente de novo.");
      if (!res.ok) {
        const fe = res.error.field_errors;
        return setErrors({ file: fe?.file?.[0] ?? res.error.message, rights: fe?.rights?.[0] ?? "" });
      }
      setUploaded({ file: file!, asset_id: res.data.asset_id });
      setStep("oferta");
    });
  }

  const priceCents = noPrice ? null : parseBRLToCents(price);

  function submit() {
    const next: Record<string, string> = {};
    if (!noPrice && (priceCents === null || priceCents <= 0)) next.price = "Informe o preço, ex.: 299,90.";
    for (const k of HIGHLIGHT_KINDS) {
      if (k in highlights && (highlights[k] ?? "").trim().length < 3) next[`h_${k}`] = "Escreva o destaque.";
    }
    if (!confirmed) next.confirmed = "Confirme que as informações são verdadeiras.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setMessage(null);
    start(async () => {
      const res = await createProduct({
        name,
        details,
        price_cents: priceCents,
        highlights: HIGHLIGHT_KINDS.filter((k) => k in highlights).map((k) => ({ kind: k, text: highlights[k]! })),
        photo_asset_id: uploaded?.asset_id ?? null,
        facts_confirmed: confirmed,
        request_key: requestKey,
      }).catch(() => null);
      if (!res) return setMessage("Não foi possível confirmar. Abra Anúncios antes de tentar de novo.");
      if (!res.ok) return setMessage(res.error.message);
      router.push(`/app/anuncios/${res.data.brief_id}`);
    });
  }

  if (step === "produto") {
    return (
      <div>
        <ScreenHeader title="O que você quer vender?" back="/app" step="1 de 6" />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          aria-label="Foto do produto"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-describedby={errors.file ? "file-error" : undefined}
          className={cn(
            "relative block aspect-[4/3] w-full overflow-hidden rounded-3xl border-2 border-dashed bg-surface-muted",
            errors.file ? "border-danger" : preview ? "border-transparent" : "border-line-strong",
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local do arquivo escolhido
            <img src={preview} alt="Foto escolhida do produto" className="size-full object-cover" />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-2 text-ink-soft">
              <CameraIcon className="size-10" />
              <span className="text-[15px] font-semibold">Tirar ou escolher uma foto</span>
              <span className="text-sm text-ink-faint">JPG ou PNG, até 5 MB</span>
            </span>
          )}
          {preview && (
            <span className="absolute right-3 bottom-3 grid size-11 place-items-center rounded-full bg-white/95 shadow">
              <CameraIcon className="size-5" />
            </span>
          )}
        </button>
        {errors.file && (
          <p id="file-error" role="alert" className="mt-2 text-sm text-danger">
            {errors.file}
          </p>
        )}
        {preview && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full bg-surface-muted px-5 py-2 text-sm font-semibold"
            >
              Trocar foto
            </button>
          </div>
        )}

        <label className="mt-5 flex items-start gap-3 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={rights}
            onChange={(e) => setRights(e.target.checked)}
            className="mt-0.5 size-5 accent-[var(--brand)]"
          />
          <span>
            A foto é minha ou tenho direito de usá-la em anúncios.
            {errors.rights && (
              <span role="alert" className="block text-danger">
                {errors.rights}
              </span>
            )}
          </span>
        </label>

        <div className="mt-6 flex flex-col gap-1.5">
          <label htmlFor="product-name" className="text-sm font-semibold">
            Nome do produto
          </label>
          <input
            id="product-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Kit de botas femininas"
            aria-invalid={Boolean(errors.name)}
            className="h-13 rounded-2xl border border-line-strong px-4 text-[16px] focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none aria-[invalid=true]:border-danger"
          />
          {errors.name && (
            <p role="alert" className="text-sm text-danger">
              {errors.name}
            </p>
          )}
        </div>

        {message && (
          <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {message}
          </p>
        )}
        <button type="button" className={`${bigButton} mt-8`} onClick={goOffer} disabled={pending}>
          {pending ? "Enviando a foto…" : "Continuar"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Qual é a sua oferta?" back={() => setStep("produto")} step="2 de 6" />
      <div className="flex items-center gap-4">
        <ProductThumb url={preview} name={name} className="size-20" />
        <p className="font-display text-lg font-bold">{name}</p>
      </div>

      <div className="mt-6 flex flex-col gap-1.5">
        <label htmlFor="price" className="text-sm font-semibold">
          Preço
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[17px] font-semibold text-ink-soft">
            R$
          </span>
          <input
            id="price"
            inputMode="decimal"
            value={noPrice ? "" : price}
            disabled={noPrice}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0,00"
            aria-invalid={Boolean(errors.price)}
            className="h-14 w-full rounded-2xl border border-line-strong pr-4 pl-12 text-[19px] font-semibold focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none disabled:bg-surface-muted aria-[invalid=true]:border-danger"
          />
        </div>
        {errors.price && (
          <p role="alert" className="text-sm text-danger">
            {errors.price}
          </p>
        )}
        <label className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={noPrice}
            onChange={(e) => setNoPrice(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          Prefiro não mostrar o preço
        </label>
      </div>

      <fieldset className="mt-7">
        <legend className="text-sm font-semibold">O que você quer destacar?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {HIGHLIGHT_KINDS.map((k) => {
            const on = k in highlights;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setHighlights((h) => {
                    const next = { ...h };
                    if (on) delete next[k];
                    else next[k] = "";
                    return next;
                  })
                }
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-xl border-2 px-3.5 text-sm font-semibold",
                  on ? "border-brand bg-brand-soft text-brand-strong" : "border-line text-ink-soft",
                )}
              >
                {on && <CheckIcon />}
                {HIGHLIGHT_LABELS[k].label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 space-y-2">
          {HIGHLIGHT_KINDS.filter((k) => k in highlights).map((k) => (
            <div key={k}>
              <label htmlFor={`h-${k}`} className="sr-only">
                {HIGHLIGHT_LABELS[k].label}
              </label>
              <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-3">
                <CheckIcon />
                <input
                  id={`h-${k}`}
                  value={highlights[k] ?? ""}
                  maxLength={80}
                  onChange={(e) => setHighlights((h) => ({ ...h, [k]: e.target.value }))}
                  placeholder={HIGHLIGHT_LABELS[k].placeholder}
                  aria-invalid={Boolean(errors[`h_${k}`])}
                  className="h-12 flex-1 bg-transparent text-[16px] font-semibold text-ink placeholder:font-normal placeholder:text-ink-faint focus:outline-none"
                />
              </div>
              {errors[`h_${k}`] && (
                <p role="alert" className="mt-1 text-sm text-danger">
                  {errors[`h_${k}`]}
                </p>
              )}
            </div>
          ))}
        </div>
      </fieldset>

      <div className="mt-6 flex flex-col gap-1.5">
        <label htmlFor="details" className="text-sm font-semibold">
          Quer contar mais? <span className="font-normal text-ink-faint">(opcional)</span>
        </label>
        <textarea
          id="details"
          value={details}
          maxLength={400}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Ex.: Couro legítimo, numeração do 34 ao 39"
          className="min-h-20 rounded-2xl border border-line-strong px-4 py-3 text-[15px] focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none"
        />
      </div>

      <label className="mt-6 flex items-start gap-3 rounded-2xl bg-surface-muted p-4 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 size-5 accent-[var(--brand)]"
        />
        <span>
          O preço e os destaques são verdadeiros e estão valendo. O anúncio só usa o que você escreveu aqui.
          {errors.confirmed && (
            <span role="alert" className="block text-danger">
              {errors.confirmed}
            </span>
          )}
        </span>
      </label>

      {message && (
        <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {message}
        </p>
      )}
      <button type="button" className={`${bigButton} mt-8`} onClick={submit} disabled={pending}>
        {pending ? "Criando…" : "Criar meu anúncio"}
      </button>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 text-brand"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path
        d="M4 8a2 2 0 012-2h1.5l1.5-2h6l1.5 2H18a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
