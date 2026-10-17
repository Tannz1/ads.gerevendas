import "server-only";
import {
  creativeContentSchema,
  strategyPlanSchema,
  type CreativeContent,
  type StrategyPlan,
} from "@/contracts/creatives";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Leituras das telas de criativos. Isolamento garantido pelo RLS (sessão do usuário). */

export const ASSETS_BUCKET = "creative-assets";

export type CreativeView = {
  id: string;
  /** Caminho no Storage privado; `image_url` é uma URL assinada temporária para a prévia. */
  image: { path: string; mime: string } | null;
  image_url: string | null;
  angle_key: string;
  status: "draft" | "approved";
  content: CreativeContent;
  simulated: boolean;
  business_name: string;
  price_cents: number | null;
  currency: string;
};

type CreativeRow = {
  id: string;
  angle_key: string;
  status: "draft" | "approved";
  content: unknown;
  assets: { storage_path: string; mime: string } | null;
};

const CREATIVE_COLUMNS = "id, angle_key, status, content, assets(storage_path, mime)";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** URLs assinadas (1 h) para as prévias no navegador. O bucket é privado. */
async function signedUrls(supabase: Supabase, paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await supabase.storage.from(ASSETS_BUCKET).createSignedUrls(paths, 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

/** Bytes da imagem como data URI, para embutir no PNG final (servidor). */
export async function loadImageDataUri(image: { path: string; mime: string }): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.storage.from(ASSETS_BUCKET).download(image.path);
  if (!data) return null;
  return `data:${image.mime};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
}

export async function loadCreative(id: string): Promise<CreativeView | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("creatives")
    .select(`${CREATIVE_COLUMNS}, strategies(simulated, briefs(businesses(name), offers(price_cents, currency)))`)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as CreativeRow & {
    strategies: {
      simulated: boolean;
      briefs: { businesses: { name: string }; offers: { price_cents: number | null; currency: string } };
    };
  };
  const content = creativeContentSchema.safeParse(row.content);
  if (!content.success) return null;
  const image = row.assets ? { path: row.assets.storage_path, mime: row.assets.mime } : null;
  const urls = await signedUrls(supabase, image ? [image.path] : []);
  return {
    id: row.id,
    image,
    image_url: image ? (urls.get(image.path) ?? null) : null,
    angle_key: row.angle_key,
    status: row.status,
    content: content.data,
    simulated: row.strategies.simulated,
    business_name: row.strategies.briefs.businesses.name,
    price_cents: row.strategies.briefs.offers.price_cents,
    currency: row.strategies.briefs.offers.currency,
  };
}

export type CreativesOverview =
  | { state: "no_brief" }
  | {
      state: "ready" | "empty";
      brief_id: string;
      job: { id: string; status: string; error_code: string | null } | null;
      strategy: { id: string; version: number; simulated: boolean; plan: StrategyPlan } | null;
      creatives: CreativeView[];
    };

/** Brief mais recente da empresa, último job de estratégia e a estratégia mais nova com as peças. */
export async function loadCreativesOverview(organizationId: string): Promise<CreativesOverview> {
  const supabase = await createSupabaseServerClient();
  const { data: brief } = await supabase
    .from("briefs")
    .select("id, businesses(name), offers(price_cents, currency)")
    .eq("organization_id", organizationId)
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!brief) return { state: "no_brief" };
  const b = brief as unknown as {
    id: string;
    businesses: { name: string };
    offers: { price_cents: number | null; currency: string };
  };

  const [{ data: job }, { data: strategy }] = await Promise.all([
    supabase
      .from("generation_jobs")
      .select("id, status, error_code, started_at")
      .eq("brief_id", b.id)
      .eq("kind", "strategy")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("strategies")
      .select(`id, version, simulated, plan, creatives(${CREATIVE_COLUMNS})`)
      .eq("brief_id", b.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const stale = job?.status === "running" && Date.now() - new Date(job.started_at).getTime() > 5 * 60_000;
  const jobView = job
    ? { id: job.id, status: stale ? "failed" : job.status, error_code: stale ? "timeout" : job.error_code }
    : null;

  if (!strategy) return { state: "empty", brief_id: b.id, job: jobView, strategy: null, creatives: [] };
  const s = strategy as unknown as {
    id: string;
    version: number;
    simulated: boolean;
    plan: unknown;
    creatives: CreativeRow[];
  };
  const plan = strategyPlanSchema.parse(s.plan);
  const order = plan.angles.map((a) => a.key as string);
  const urls = await signedUrls(
    supabase,
    s.creatives.flatMap((c) => (c.assets ? [c.assets.storage_path] : [])),
  );
  const creatives = s.creatives
    .map((c) => {
      const content = creativeContentSchema.safeParse(c.content);
      return content.success
        ? {
            id: c.id,
            image: c.assets ? { path: c.assets.storage_path, mime: c.assets.mime } : null,
            image_url: c.assets ? (urls.get(c.assets.storage_path) ?? null) : null,
            angle_key: c.angle_key,
            status: c.status,
            content: content.data,
            simulated: s.simulated,
            business_name: b.businesses.name,
            price_cents: b.offers.price_cents,
            currency: b.offers.currency,
          }
        : null;
    })
    .filter((c): c is CreativeView => c !== null)
    .sort((x, y) => order.indexOf(x.angle_key) - order.indexOf(y.angle_key));

  return {
    state: "ready",
    brief_id: b.id,
    job: jobView,
    strategy: { id: s.id, version: s.version, simulated: s.simulated, plan },
    creatives,
  };
}

/** Último job de imagem da peça (para o editor acompanhar a geração). */
export async function loadImageJob(creativeId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("generation_jobs")
    .select("id, status, error_code, started_at")
    .eq("creative_id", creativeId)
    .eq("kind", "image")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const stale = data.status === "running" && Date.now() - new Date(data.started_at).getTime() > 5 * 60_000;
  return {
    id: data.id as string,
    status: stale ? "failed" : (data.status as string),
    error_code: stale ? "timeout" : data.error_code,
  };
}
