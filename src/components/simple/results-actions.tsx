"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatCents, parseBRLToCents } from "@/lib/money";
import { activatePausedCampaign, pauseActiveCampaign } from "@/server/campaigns";
import { deleteSale, recordSale } from "@/server/products";
import type { SalesSummary } from "@/server/products-data";
import { bigButton, outlineButton } from "./shell";

/** "Alguma conversa virou venda?": o dono anota as vendas. Não é dado da Meta. */
export function SalesBox({ campaignId, sales }: { campaignId: string; sales: SalesSummary }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    const amountCents = amount.trim() ? parseBRLToCents(amount) : null;
    if (amount.trim() && amountCents === null) return setError("Valor inválido. Ex.: 599,80");
    setError(null);
    start(async () => {
      const res = await recordSale({ campaign_id: campaignId, quantity, amount_cents: amountCents }).catch(() => null);
      if (!res) return setError("Não foi possível confirmar. Recarregue a página antes de tentar de novo.");
      if (!res.ok) return setError(res.error.message);
      setOpen(false);
      setQuantity(1);
      setAmount("");
      router.refresh();
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteSale(id).catch(() => null);
      if (res && !res.ok) setError(res.error.message);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="vendas" className="mt-6">
      <h2 id="vendas" className="flex items-center gap-2 font-display text-[17px] font-bold">
        <CartIcon />
        Alguma conversa virou venda?
      </h2>
      {sales.quantity > 0 && (
        <p className="mt-2 text-sm text-ink-soft">
          Você registrou <strong className="text-ink">{sales.quantity}</strong>{" "}
          {sales.quantity === 1 ? "venda" : "vendas"}
          {sales.amount_cents > 0 && (
            <>
              {" "}
              somando <strong className="text-ink">{formatCents(sales.amount_cents)}</strong>
            </>
          )}
          .
        </p>
      )}

      {open ? (
        <div className="mt-3 space-y-4 rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <span id="qtd-label" className="text-sm font-semibold">
              Quantas vendas?
            </span>
            <div className="flex items-center gap-2" role="group" aria-labelledby="qtd-label">
              <button
                type="button"
                aria-label="Menos uma"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="grid size-10 place-items-center rounded-full border border-line-strong text-lg font-bold disabled:opacity-40"
              >
                −
              </button>
              <output aria-live="polite" className="w-8 text-center font-display text-xl font-bold">
                {quantity}
              </output>
              <button
                type="button"
                aria-label="Mais uma"
                disabled={quantity >= 1000}
                onClick={() => setQuantity((q) => Math.min(1000, q + 1))}
                className="grid size-10 place-items-center rounded-full border border-line-strong text-lg font-bold disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sale-amount" className="text-sm font-semibold">
              Valor total <span className="font-normal text-ink-faint">(opcional)</span>
            </label>
            <input
              id="sale-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex.: 599,80"
              className="h-12 rounded-xl border border-line-strong px-4 text-[16px] focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className={outlineButton} onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </button>
            <button type="button" className={`${bigButton} h-12 text-[15px]`} onClick={save} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={`${bigButton} mt-3 h-12 text-[16px]`} onClick={() => setOpen(true)}>
          Registrar vendas
        </button>
      )}

      {sales.records.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink-soft">Ver registros</summary>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {sales.records.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  {new Date(`${r.sold_on}T12:00:00`).toLocaleDateString("pt-BR")} · {r.quantity}{" "}
                  {r.quantity === 1 ? "venda" : "vendas"}
                  {r.amount_cents !== null && ` · ${formatCents(r.amount_cents)}`}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(r.id)}
                  className="text-xs font-semibold text-danger hover:underline"
                >
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!open && error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-faint">Vendas registradas por você. A Meta não informa vendas.</p>
    </section>
  );
}

/** Pausar (sempre disponível com o anúncio rodando) e ativar (segunda confirmação do dono). */
export function CampaignControls({
  campaignId,
  status,
  dailyBudgetCents,
  durationDays,
  currency,
  simulated,
  canPause,
  canActivate,
  awaitingPayment,
}: {
  campaignId: string;
  status: "draft" | "paused" | "active" | "ended";
  dailyBudgetCents: number;
  durationDays: number;
  currency: string;
  simulated: boolean;
  canPause: boolean;
  canActivate: boolean;
  /** Conta compartilhada (ADR 0009): quem ativa é a GereVendas depois do pagamento da verba. */
  awaitingPayment: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [key, setKey] = useState(() => `act_${crypto.randomUUID()}`);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const total = dailyBudgetCents * durationDays;

  function pause() {
    setMessage(null);
    start(async () => {
      const res = await pauseActiveCampaign(campaignId).catch(() => null);
      if (!res) {
        return setMessage({
          ok: false,
          text: "Não foi possível confirmar a pausa. Se precisar parar agora, pause no Gerenciador de Anúncios da Meta.",
        });
      }
      if (!res.ok) return setMessage({ ok: false, text: res.error.message });
      setKey(`act_${crypto.randomUUID()}`);
      router.refresh();
    });
  }

  function activate() {
    setMessage(null);
    start(async () => {
      const res = await activatePausedCampaign({
        campaign_id: campaignId,
        confirmed_daily_budget_cents: dailyBudgetCents,
        confirmed_duration_days: durationDays,
        owner_activation_confirmed: confirm,
        idempotency_key: key,
      }).catch(() => null);
      if (!res) return setMessage({ ok: false, text: "Não foi possível confirmar a ativação. Recarregue a página." });
      if (!res.ok) return setMessage({ ok: false, text: res.error.message });
      setConfirm(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      {status === "active" && canPause && (
        <button type="button" className={outlineButton} onClick={pause} disabled={pending}>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
          {pending ? "Pausando…" : "Pausar anúncio"}
        </button>
      )}

      {status === "paused" && awaitingPayment && (
        <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          Seu anúncio está pronto e pausado. Assim que o pagamento de {formatCents(total, currency)} de verba for
          confirmado, a GereVendas coloca ele no ar e avisa você.
        </p>
      )}

      {status === "paused" && !awaitingPayment && canActivate && (
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-2xl bg-surface-muted p-4 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={confirm}
              disabled={pending}
              onChange={(e) => setConfirm(e.target.checked)}
              className="mt-0.5 size-5 accent-[var(--brand)]"
            />
            <span>
              Quero colocar no ar agora: {formatCents(dailyBudgetCents, currency)} por dia durante {durationDays} dias
              (até {formatCents(total, currency)}).
            </span>
          </label>
          <button type="button" className={bigButton} onClick={activate} disabled={!confirm || pending}>
            {pending ? "Ativando…" : simulated ? "Colocar no ar (Simulação)" : "Colocar no ar"}
          </button>
        </div>
      )}

      {status === "paused" && !awaitingPayment && !canActivate && (
        <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-soft">
          O anúncio está pausado. Só o dono da empresa pode colocar no ar.
        </p>
      )}

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 4h2l2.4 11.2a1 1 0 001 .8h9.2a1 1 0 001-.8L20 8H6.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  );
}
