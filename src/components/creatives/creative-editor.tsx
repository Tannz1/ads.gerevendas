"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { ANGLE_KEYS, LIMITS, TEMPLATE_LABELS, type CreativeContent } from "@/contracts/creatives";
import { approveCreative, updateCreative } from "@/server/creatives";
import { AdPreview, imageUrl } from "./ad-preview";

type Props = {
  id: string;
  initial: CreativeContent;
  status: "draft" | "approved";
  businessName: string;
  priceLabel: string | null;
};

type Errors = Record<string, string[] | undefined>;

export function CreativeEditor({ id, initial, status, businessName, priceLabel }: Props) {
  const router = useRouter();
  const [content, setContent] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(content) !== JSON.stringify(saved);

  const set = <K extends keyof CreativeContent>(key: K, value: CreativeContent[K]) => {
    setContent((c) => ({ ...c, [key]: value }));
    setMessage(null);
  };
  const setColor = (key: keyof CreativeContent["colors"], value: string) =>
    setContent((c) => ({ ...c, colors: { ...c.colors, [key]: value.toUpperCase() } }));

  async function save(): Promise<boolean> {
    const res = await updateCreative(id, content);
    if (!res.ok) {
      setErrors(res.error.field_errors ?? {});
      setMessage({ tone: "danger", text: res.error.message });
      return false;
    }
    setErrors({});
    setSaved(content);
    return true;
  }

  const onSave = () =>
    start(async () => {
      if (await save()) {
        setMessage({ tone: "success", text: "Alterações salvas." });
        router.refresh();
      }
    });

  const onApprove = () =>
    start(async () => {
      if (dirty && !(await save())) return;
      const res = await approveCreative(id);
      setMessage(res.ok ? { tone: "success", text: "Peça aprovada." } : { tone: "danger", text: res.error.message });
      router.refresh();
    });

  const err = (k: string) => errors[k]?.[0];
  const preview = { content, businessName, priceLabel };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_1fr]">
      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Editar peça</h2>
          {status === "approved" && !dirty ? <Badge tone="success">Aprovada</Badge> : <Badge>Rascunho</Badge>}
        </div>

        <Field id="template" label="Modelo">
          <Select
            id="template"
            value={content.template}
            onChange={(e) => set("template", e.target.value as CreativeContent["template"])}
          >
            {ANGLE_KEYS.map((k) => (
              <option key={k} value={k}>
                {TEMPLATE_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="headline"
          label="Título"
          error={err("headline")}
          hint={`${content.headline.length}/${LIMITS.headline}`}
        >
          <Input
            id="headline"
            value={content.headline}
            maxLength={LIMITS.headline}
            onChange={(e) => set("headline", e.target.value)}
            aria-invalid={Boolean(err("headline"))}
            aria-describedby={describedBy("headline", err("headline"), true)}
          />
        </Field>

        <Field id="body" label="Texto de apoio" error={err("body")} hint={`${content.body.length}/${LIMITS.body}`}>
          <Textarea
            id="body"
            value={content.body}
            maxLength={LIMITS.body}
            onChange={(e) => set("body", e.target.value)}
            aria-invalid={Boolean(err("body"))}
            aria-describedby={describedBy("body", err("body"), true)}
          />
        </Field>

        <Field id="cta" label="Botão" error={err("cta")} hint="Ilustrativo: o botão real é definido na publicação.">
          <Input
            id="cta"
            value={content.cta}
            maxLength={LIMITS.cta}
            onChange={(e) => set("cta", e.target.value)}
            aria-invalid={Boolean(err("cta"))}
            aria-describedby={describedBy("cta", err("cta"), true)}
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2.5 text-[15px]">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-brand)]"
              checked={content.show_price}
              disabled={!priceLabel}
              onChange={(e) => set("show_price", e.target.checked)}
            />
            Mostrar preço {priceLabel && <span className="font-semibold">{priceLabel}</span>}
          </label>
          <p className="text-sm text-ink-faint">
            {priceLabel ? "O preço vem do cadastro, confirmado por você." : "Sem preço confirmado no cadastro."}
          </p>
          {err("show_price") && (
            <p role="alert" className="text-sm text-danger">
              {err("show_price")}
            </p>
          )}
        </div>

        <fieldset className="grid grid-cols-3 gap-3">
          <legend className="mb-1.5 text-sm font-semibold">Cores</legend>
          {(
            [
              ["background", "Fundo"],
              ["text", "Texto"],
              ["accent", "Destaque"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-1 text-sm text-ink-soft">
              {label}
              <input
                type="color"
                value={content.colors[k]}
                onChange={(e) => setColor(k, e.target.value)}
                className="h-10 w-full cursor-pointer rounded-lg border border-line-strong bg-surface"
              />
            </label>
          ))}
        </fieldset>

        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        <div className="flex flex-wrap gap-3">
          <Button onClick={onSave} disabled={pending || !dirty}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
          <Button variant="secondary" onClick={onApprove} disabled={pending || (status === "approved" && !dirty)}>
            Aprovar peça
          </Button>
        </div>
        <p className="text-sm text-ink-faint">Aprovar é decisão do dono ou de um administrador da empresa.</p>
      </Card>

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Feed (4:5)</p>
            <AdPreview width={320} label="Prévia no feed" format="feed" {...preview} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Stories (9:16)</p>
            <AdPreview width={220} label="Prévia nos stories" format="stories" {...preview} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
          {dirty ? (
            <span className="text-ink-faint">Salve para baixar a versão editada.</span>
          ) : (
            <>
              <a href={imageUrl(id, "feed")} className="text-brand hover:underline" download>
                Baixar feed (1080×1350)
              </a>
              <a href={imageUrl(id, "stories")} className="text-brand hover:underline" download>
                Baixar stories (1080×1920)
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
