"use client";

import Link from "next/link";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  RENDER_FALLBACK_MESSAGE,
  RenderError,
  creativeFilename,
  downloadBlob,
  renderCreativePng,
  validateDesign,
  type DesignOfferFacts,
} from "@/components/creative";
import { errorRef, formatDateTime } from "@/components/strategy/messages";
import { FormatGlyph } from "@/components/strategy/strategy-overview";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FORMAT_SPECS, type CreativeDesign, type DesignIssue } from "@/contracts/creative";
import { COPY_LIMITS, CREATIVE_FORMATS } from "@/contracts/strategy";
import { cn } from "@/lib/cn";
import {
  BackgroundPicker,
  ColorPicker,
  CountedField,
  CtaSelect,
  EditorSection,
  FIELD_IDS,
  PriceToggle,
  TemplatePicker,
} from "./editor-fields";
import { FittedCanvas } from "./fitted-canvas";

export type EditorCreative = {
  id: string;
  status: "draft" | "approved";
  version: number;
  design: CreativeDesign;
  updated_at: string;
  approved_at: string | null;
};

export type BackendError = {
  code: string;
  message: string;
  correlation_id?: string | null;
  field_errors?: Record<string, string[]>;
};
export type BackendResult<T> = { ok: true; data: T } | { ok: false; error: BackendError };

/** Onde a peça é salva: server actions (Supabase) ou o navegador (demonstração). */
export type EditorBackend = {
  save: (design: CreativeDesign, version: number) => Promise<BackendResult<{ version: number }>>;
  approve: (version: number) => Promise<BackendResult<{ approved_at: string }>>;
  reload: () => void;
};

type SaveState = "idle" | "pending" | "saving" | "saved" | "error" | "conflict";

const AUTOSAVE_MS = 800;
const OFFLINE: BackendError = {
  code: "internal",
  message: "Sem conexão com o servidor. Verifique a internet e tente de novo.",
};
const DESIGN_FIELDS = new Set<string>([
  "format",
  "template_key",
  "business_name",
  "headline",
  "body",
  "cta",
  "show_price",
  "price_cents",
  "currency",
  "brand_color",
  "background",
]);
const FIELD_LABELS: Record<DesignIssue["field"], string> = {
  format: "Formato",
  template_key: "Modelo",
  business_name: "Nome na peça",
  headline: "Título",
  body: "Texto",
  cta: "Botão",
  show_price: "Preço",
  price_cents: "Preço",
  currency: "Preço",
  brand_color: "Cor da marca",
  background: "Fundo",
  layout: "Peça",
};

function fieldErrorsToIssues(fieldErrors: Record<string, string[]> | undefined): DesignIssue[] {
  return Object.entries(fieldErrors ?? {}).flatMap(([key, messages]) =>
    messages.slice(0, 1).map((message) => ({
      field: (DESIGN_FIELDS.has(key) ? key : "layout") as DesignIssue["field"],
      message,
    })),
  );
}

function mergeIssues(...groups: DesignIssue[][]): DesignIssue[] {
  const seen = new Set<string>();
  const out: DesignIssue[] = [];
  for (const issue of groups.flat()) {
    const key = `${issue.field}:${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

const sameIssues = (a: DesignIssue[], b: DesignIssue[]) =>
  a.length === b.length && a.every((issue, i) => issue.field === b[i]?.field && issue.message === b[i]?.message);

function subscribeResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}

/** Altura da janela (para a prévia caber na tela sem rolar). */
function useViewportHeight(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight,
    () => 900,
  );
}

export function CreativeEditor({
  creative,
  offer,
  ctaOptions,
  backend,
  simulation = false,
}: {
  creative: EditorCreative;
  offer: DesignOfferFacts;
  ctaOptions: string[];
  backend: EditorBackend;
  simulation?: boolean;
}) {
  const [form, setForm] = useState({ draft: creative.design, preview: creative.design });
  const [status, setStatus] = useState(creative.status);
  const [approvedAt, setApprovedAt] = useState(creative.approved_at);
  const [updatedAt, setUpdatedAt] = useState(creative.updated_at);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<BackendError | null>(null);
  const [serverIssues, setServerIssues] = useState<DesignIssue[]>([]);
  const [fitIssues, setFitIssues] = useState<DesignIssue[]>([]);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<BackendError | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<BackendError | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const versionRef = useRef(creative.version);
  const dirty = useRef(false);
  const editSeq = useRef(0);
  const blocked = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pendingSave = useRef<{ design: CreativeDesign; seq: number } | null>(null);
  const lastQueued = useRef<string | null>(null);

  const viewportHeight = useViewportHeight();
  const { draft, preview } = form;
  const validation = useMemo(() => validateDesign(draft, offer), [draft, offer]);
  const valid = validation.design;
  const issues = useMemo(
    // Medidas de encaixe só valem quando a prévia mostra o rascunho atual.
    () => mergeIssues(validation.issues, valid ? fitIssues : [], serverIssues),
    [validation.issues, valid, fitIssues, serverIssues],
  );
  const issueFor = (...fields: DesignIssue["field"][]) => issues.find((i) => fields.includes(i.field))?.message;

  const handleFitIssues = useCallback((list: DesignIssue[]) => {
    setFitIssues((prev) => (sameIssues(prev, list) ? prev : list));
  }, []);

  function update(patch: Partial<CreativeDesign>) {
    dirty.current = true;
    editSeq.current += 1;
    setForm((prev) => {
      const next = { ...prev.draft, ...patch };
      const checked = validateDesign(next, offer).design;
      return { draft: next, preview: checked ?? prev.preview };
    });
    setServerIssues((prev) => prev.filter((issue) => !(issue.field in patch)));
    setApproveError(null);
    if (!blocked.current) setSaveState("pending");
  }

  async function persist(design: CreativeDesign, seq: number) {
    if (blocked.current) return;
    setSaveState("saving");
    let res: BackendResult<{ version: number }>;
    try {
      res = await backend.save(design, versionRef.current);
    } catch {
      res = { ok: false, error: OFFLINE };
    }
    if (res.ok) {
      versionRef.current = res.data.version;
      if (status === "approved") setAnnouncement("Alteração salva. A peça voltou para rascunho.");
      setStatus("draft");
      setApprovedAt(null);
      setUpdatedAt(new Date().toISOString());
      setSaveError(null);
      setServerIssues([]);
      setSaveState(editSeq.current === seq ? "saved" : "pending");
      return;
    }
    if (res.error.code === "conflict") {
      blocked.current = true;
      setSaveError(res.error);
      setSaveState("conflict");
      return;
    }
    // Permite tentar de novo o mesmo design na próxima alteração.
    lastQueued.current = null;
    setServerIssues(fieldErrorsToIssues(res.error.field_errors));
    setSaveError(res.error);
    setSaveState("error");
  }

  /** Um salvamento por vez: o próximo usa a versão devolvida pelo anterior. */
  function enqueueSave(design: CreativeDesign, seq: number) {
    queue.current = queue.current.then(() => persist(design, seq)).catch(() => undefined);
  }
  const autosave = useEffectEvent((design: CreativeDesign, seq: number) => enqueueSave(design, seq));

  const settle = useEffectEvent(() => setSaveState((s) => (s === "pending" ? "saved" : s)));

  // Salvamento automático: só peças válidas pelo contrato e só o que mudou desde o último envio.
  // Com cacheComponents a rota fica oculta (Activity) e os efeitos rodam de novo ao voltar:
  // por isso a comparação com o último design enviado (`lastQueued`).
  useEffect(() => {
    if (!valid) {
      pendingSave.current = null;
      return;
    }
    const key = JSON.stringify(valid);
    if (!dirty.current) {
      lastQueued.current = key;
      return;
    }
    if (blocked.current) return;
    const seq = editSeq.current;
    const changed = key !== lastQueued.current;
    pendingSave.current = changed ? { design: valid, seq } : null;
    const timer = setTimeout(() => {
      pendingSave.current = null;
      if (!changed) {
        // Alteração desfeita (ou rota exibida de novo): nada novo para salvar.
        settle();
        return;
      }
      lastQueued.current = key;
      autosave(valid, seq);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [valid]);

  // Ao sair do editor (ou a rota ficar oculta) antes do debounce, salva o que ficou pendente.
  useEffect(
    () => () => {
      const pending = pendingSave.current;
      pendingSave.current = null;
      if (!pending) return;
      lastQueued.current = JSON.stringify(pending.design);
      autosave(pending.design, pending.seq);
    },
    [],
  );

  // Aviso do navegador ao fechar a aba com alterações ainda não salvas.
  const unsaved = saveState === "pending" || saveState === "saving";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  async function download() {
    if (!valid) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = await renderCreativePng(valid);
      downloadBlob(blob, creativeFilename(valid));
      setAnnouncement("Download da imagem iniciado.");
    } catch (error) {
      setDownloadError(
        error instanceof RenderError
          ? { code: error.code ?? "internal", message: error.message, correlation_id: error.correlationId }
          : { code: "internal", message: RENDER_FALLBACK_MESSAGE },
      );
    } finally {
      setDownloading(false);
    }
  }

  async function approve() {
    setApproving(true);
    setApproveError(null);
    try {
      const res = await backend.approve(versionRef.current);
      if (res.ok) {
        setStatus("approved");
        setApprovedAt(res.data.approved_at);
        setAnnouncement("Peça aprovada. Nada foi publicado.");
      } else if (res.error.code === "conflict") {
        blocked.current = true;
        setSaveError(res.error);
        setSaveState("conflict");
      } else {
        setServerIssues(fieldErrorsToIssues(res.error.field_errors));
        setApproveError(res.error);
      }
    } catch {
      setApproveError(OFFLINE);
    } finally {
      setApproving(false);
    }
  }

  function focusField(issue: DesignIssue) {
    const id =
      issue.field === "headline"
        ? FIELD_IDS.headline
        : issue.field === "body"
          ? FIELD_IDS.body
          : issue.field === "business_name"
            ? FIELD_IDS.business_name
            : issue.field === "cta"
              ? FIELD_IDS.cta
              : issue.field === "brand_color"
                ? FIELD_IDS.brand_color
                : issue.field === "background"
                  ? FIELD_IDS.background(draft.background)
                  : issue.field === "format"
                    ? FIELD_IDS.format(draft.format)
                    : issue.field === "show_price" || issue.field === "price_cents" || issue.field === "currency"
                      ? FIELD_IDS.price
                      : FIELD_IDS.template(draft.template_key);
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  }

  const saving = saveState === "pending" || saveState === "saving";
  const approved = status === "approved";
  const canApprove =
    !approved && !approving && valid !== null && issues.length === 0 && (saveState === "idle" || saveState === "saved");
  const approveHint = approved
    ? approvedAt
      ? `Aprovada em ${formatDateTime(approvedAt)}.`
      : "Peça aprovada."
    : saveState === "conflict"
      ? "Recarregue a peça para continuar."
      : issues.length > 0
        ? `Corrija ${issues.length === 1 ? "o ajuste indicado" : `os ${issues.length} ajustes indicados`} para aprovar.`
        : saving
          ? "Aguarde salvar para aprovar."
          : saveState === "error"
            ? "Salve as alterações para aprovar."
            : null;

  const spec = FORMAT_SPECS[preview.format];
  const stories = preview.format === "stories_9x16";
  const previewMaxHeight = Math.max(360, Math.min(stories ? 640 : 560, viewportHeight - 240));
  const brand = /^#[0-9A-Fa-f]{6}$/.test(preview.brand_color) ? preview.brand_color : "#2A45E8";

  return (
    <div className="@container mx-auto max-w-6xl">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="flex flex-col gap-5 @3xl:flex-row @3xl:items-start @3xl:justify-between">
        <div className="min-w-0">
          <Link
            href="/app/criativos"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-ink-soft hover:text-ink"
          >
            <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.5 4.5L7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Criativos
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-3xl font-bold tracking-tight">Editar peça</h1>
            {approved ? <Badge tone="success">Aprovada</Badge> : <Badge>Rascunho</Badge>}
            {simulation && <Badge tone="demo">Simulação</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-faint">
            <SaveIndicator state={saveState} valid={valid !== null} />
            <span aria-hidden className="hidden sm:inline">
              ·
            </span>
            <span>Atualizada em {formatDateTime(updatedAt)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 @3xl:max-w-xs @3xl:items-end">
          <div className="grid grid-cols-2 gap-2.5 @3xl:flex">
            <Button
              variant="secondary"
              onClick={download}
              disabled={downloading || !valid || issues.length > 0}
              aria-busy={downloading}
            >
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="size-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {downloading ? "Gerando PNG…" : "Baixar PNG"}
            </Button>
            <Button onClick={approve} disabled={!canApprove} aria-busy={approving} aria-describedby="approve-note">
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="size-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {approving ? "Aprovando…" : approved ? "Aprovada" : "Aprovar peça"}
            </Button>
          </div>
          <p id="approve-note" className="text-xs leading-relaxed text-ink-faint @3xl:text-right">
            {approveHint && (
              <span className="block font-medium text-ink-soft">
                {approveHint}
                {issues.length > 0 && !approved && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => {
                        const panel = document.getElementById("editor-issues");
                        panel?.scrollIntoView({ block: "start", behavior: "smooth" });
                        panel?.querySelector("button")?.focus({ preventScroll: true });
                      }}
                      className="font-semibold text-brand underline underline-offset-2"
                    >
                      Ver ajustes
                    </button>
                  </>
                )}
              </span>
            )}
            Aprovar não publica nada. A publicação na Meta chega numa próxima fase.
          </p>
        </div>
      </div>

      {saveState === "conflict" && (
        <Alert tone="danger" title="Conflito ao salvar" className="mt-5">
          <p>Esta peça foi alterada em outra aba ou dispositivo. Recarregue para ver a versão mais recente.</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={backend.reload}>
            Recarregar
          </Button>
        </Alert>
      )}
      {saveState === "error" && saveError && (
        <Alert tone="danger" title="Erro ao salvar" className="mt-5">
          <p>
            {saveError.message}
            {errorRef(saveError.correlation_id) && (
              <span className="text-ink-faint"> (código {errorRef(saveError.correlation_id)})</span>
            )}
          </p>
          {valid && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => {
                setSaveState("pending");
                lastQueued.current = JSON.stringify(valid);
                enqueueSave(valid, editSeq.current);
              }}
            >
              Tentar salvar de novo
            </Button>
          )}
        </Alert>
      )}
      {downloadError && (
        <Alert tone="danger" title="Não foi possível baixar a imagem" className="mt-5">
          {downloadError.message}
          {errorRef(downloadError.correlation_id) && (
            <span className="text-ink-faint"> (código {errorRef(downloadError.correlation_id)})</span>
          )}
        </Alert>
      )}
      {approveError && (
        <Alert tone="danger" title="Não foi possível aprovar" className="mt-5">
          {approveError.message}
          {errorRef(approveError.correlation_id) && (
            <span className="text-ink-faint"> (código {errorRef(approveError.correlation_id)})</span>
          )}
        </Alert>
      )}

      <div className="mt-7 grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)] @4xl:items-start">
        {/* Prévia: primeiro no celular, à direita (fixa) no desktop. */}
        <div className="flex flex-col gap-4 @4xl:sticky @4xl:top-24 @4xl:order-2">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <fieldset>
                <legend className="sr-only">Formato</legend>
                <div className="inline-flex rounded-xl bg-surface-muted p-1">
                  {CREATIVE_FORMATS.map((format) => {
                    const selected = draft.format === format;
                    return (
                      <label
                        key={format}
                        className={cn(
                          "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand",
                          selected ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink",
                        )}
                      >
                        <input
                          type="radio"
                          name="format"
                          id={FIELD_IDS.format(format)}
                          value={format}
                          checked={selected}
                          onChange={() => update({ format })}
                          className="sr-only"
                        />
                        <FormatGlyph format={format} />
                        {FORMAT_SPECS[format].label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-soft">
                <input
                  type="checkbox"
                  checked={showSafeArea}
                  onChange={(e) => setShowSafeArea(e.target.checked)}
                  className="size-4 accent-[var(--brand)]"
                />
                Mostrar área segura
              </label>
            </div>
            <div
              className="relative px-4 py-6 sm:px-6"
              style={{
                background: `linear-gradient(165deg, color-mix(in srgb, ${brand} 14%, var(--canvas)) 0%, var(--surface-muted) 100%)`,
              }}
            >
              <FittedCanvas
                design={preview}
                maxWidth={stories ? 380 : 440}
                maxHeight={previewMaxHeight}
                showSafeArea={showSafeArea}
                onIssues={handleFitIssues}
                canvasClassName="rounded-lg shadow-[0_24px_48px_-20px_rgb(16_24_40/0.5)] ring-1 ring-black/5"
              />
              {!valid && (
                <p className="mt-3 text-center text-xs font-medium text-ink-soft">
                  Mostrando a última versão válida. Corrija os campos para atualizar a prévia.
                </p>
              )}
            </div>
            <p className="border-t border-line px-4 py-2.5 text-xs text-ink-faint">
              {spec.width} × {spec.height} px. A imagem baixada sai igual à prévia.
              {showSafeArea &&
                (stories
                  ? " Nos stories, o topo e a base ficam cobertos pela interface do app: mantenha os textos dentro do tracejado."
                  : " Mantenha os textos dentro do tracejado.")}
            </p>
          </Card>
        </div>

        <Card className="@4xl:order-1">
          <IssuesPanel issues={issues} onSelect={focusField} />

          <EditorSection id="section-template" title="Modelo">
            <TemplatePicker
              design={preview}
              error={issueFor("template_key")}
              onChange={(template_key) => update({ template_key })}
            />
          </EditorSection>

          <EditorSection id="section-background" title="Fundo">
            <BackgroundPicker
              value={draft.background}
              brandColor={preview.brand_color}
              error={issueFor("background")}
              onChange={(background) => update({ background })}
            />
          </EditorSection>

          <EditorSection id="section-texts" title="Textos">
            <div className="grid gap-5">
              <CountedField
                id={FIELD_IDS.headline}
                label="Título"
                value={draft.headline}
                max={COPY_LIMITS.headline}
                error={issueFor("headline")}
                onChange={(headline) => update({ headline })}
              />
              <CountedField
                id={FIELD_IDS.body}
                label="Texto"
                value={draft.body}
                max={COPY_LIMITS.body}
                multiline
                hint="Opcional. Uma frase curta que complementa o título."
                error={issueFor("body")}
                onChange={(body) => update({ body })}
              />
              <CtaSelect
                value={draft.cta}
                options={ctaOptions.includes(draft.cta) ? ctaOptions : [...ctaOptions, draft.cta]}
                error={issueFor("cta")}
                onChange={(cta) => update({ cta })}
              />
              <CountedField
                id={FIELD_IDS.business_name}
                label="Nome na peça"
                value={draft.business_name}
                max={60}
                hint="Como o nome do negócio aparece na arte. Use uma versão curta se precisar."
                error={issueFor("business_name")}
                onChange={(business_name) => update({ business_name })}
              />
            </div>
          </EditorSection>

          <EditorSection id="section-price" title="Preço">
            <PriceToggle
              offer={offer}
              checked={draft.show_price}
              error={issueFor("show_price", "price_cents", "currency")}
              onChange={(show) =>
                update(
                  show && offer.price_cents !== null
                    ? { show_price: true, price_cents: offer.price_cents, currency: offer.currency }
                    : { show_price: false, price_cents: null },
                )
              }
            />
          </EditorSection>

          <EditorSection id="section-color" title="Cor da marca">
            <ColorPicker
              value={draft.brand_color}
              initial={creative.design.brand_color}
              error={issueFor("brand_color")}
              onChange={(brand_color) => update({ brand_color })}
            />
          </EditorSection>
        </Card>
      </div>
    </div>
  );
}

function SaveIndicator({ state, valid }: { state: SaveState; valid: boolean }) {
  const view =
    state === "saving"
      ? { label: "Salvando…", tone: "text-ink-soft", dot: "bg-brand animate-pulse" }
      : state === "pending"
        ? valid
          ? { label: "Alterações pendentes", tone: "text-ink-soft", dot: "bg-accent" }
          : { label: "Não salvo: corrija os campos", tone: "text-warning", dot: "bg-accent" }
        : state === "error"
          ? { label: "Erro ao salvar", tone: "text-danger", dot: "bg-danger" }
          : state === "conflict"
            ? { label: "Conflito", tone: "text-danger", dot: "bg-danger" }
            : { label: "Salvo", tone: "text-success", dot: "bg-success" };
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 font-medium", view.tone)}>
      <span aria-hidden className={cn("size-2 rounded-full", view.dot)} />
      {view.label}
    </span>
  );
}

function IssuesPanel({ issues, onSelect }: { issues: DesignIssue[]; onSelect: (issue: DesignIssue) => void }) {
  return (
    <div id="editor-issues" role="status" aria-live="polite" className="scroll-mt-24 px-5 pt-5 sm:px-7">
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm font-medium text-success">
          <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Nenhum ajuste necessário na peça.
        </p>
      ) : (
        <div className="rounded-xl border border-accent/60 bg-accent-soft px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            {issues.length === 1 ? "1 ajuste necessário" : `${issues.length} ajustes necessários`}
          </p>
          <ul className="mt-1.5 grid gap-1">
            {issues.map((issue) => (
              <li key={`${issue.field}:${issue.message}`}>
                <button
                  type="button"
                  onClick={() => onSelect(issue)}
                  className="text-left text-sm text-ink-soft underline decoration-accent underline-offset-2 hover:text-ink"
                >
                  <span className="font-semibold text-ink">{FIELD_LABELS[issue.field]}:</span> {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
