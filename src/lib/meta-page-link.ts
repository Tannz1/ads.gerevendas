/** Referência a uma Página do Facebook extraída do link que o cliente colou. */
export type PageRef = { kind: "id"; id: string } | { kind: "username"; username: string };

const HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "business.facebook.com",
  "fb.com",
  "www.fb.com",
]);
// Primeiro trecho do caminho que nunca é nome de Página.
const RESERVED = new Set([
  "share",
  "sharer",
  "sharer.php",
  "groups",
  "events",
  "watch",
  "marketplace",
  "people",
  "login",
  "home.php",
  "photo",
  "photo.php",
  "story.php",
  "permalink.php",
  "reel",
  "settings",
]);
const NUMERIC_ID = /^\d{5,20}$/;

export function parsePageLink(raw: string): PageRef | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (!first) return null;

  if (first === "profile.php") {
    const id = url.searchParams.get("id");
    return id && NUMERIC_ID.test(id) ? { kind: "id", id } : null;
  }
  // Formato antigo: facebook.com/pages/Nome/123456789
  if (first === "pages") {
    const last = segments.at(-1);
    return last && NUMERIC_ID.test(last) ? { kind: "id", id: last } : null;
  }
  if (RESERVED.has(first.toLowerCase())) return null;
  if (NUMERIC_ID.test(first)) return { kind: "id", id: first };
  if (/^[A-Za-z0-9.\-]{2,80}$/.test(first)) return { kind: "username", username: first.toLowerCase() };
  return null;
}

export function matchesPage(
  ref: PageRef,
  page: { id: string; username?: string | null; link?: string | null },
): boolean {
  if (ref.kind === "id") return page.id === ref.id;
  if (page.username && page.username.toLowerCase() === ref.username) return true;
  const fromLink = page.link ? parsePageLink(page.link) : null;
  return fromLink?.kind === "username" && fromLink.username === ref.username;
}
