import { describe, expect, it } from "vitest";
import { matchesPage, parsePageLink } from "@/lib/meta-page-link";

describe("parsePageLink", () => {
  it.each([
    ["https://www.facebook.com/padariadojoao", { kind: "username", username: "padariadojoao" }],
    ["facebook.com/PadariaDoJoao/", { kind: "username", username: "padariadojoao" }],
    ["https://m.facebook.com/padaria.do.joao?ref=bookmarks", { kind: "username", username: "padaria.do.joao" }],
    ["https://web.facebook.com/padaria-do-joao", { kind: "username", username: "padaria-do-joao" }],
    ["https://www.facebook.com/profile.php?id=100089123456789", { kind: "id", id: "100089123456789" }],
    ["https://www.facebook.com/pages/Padaria/123456789012", { kind: "id", id: "123456789012" }],
    ["https://fb.com/123456789012", { kind: "id", id: "123456789012" }],
  ])("reconhece %s", (link, expected) => {
    expect(parsePageLink(link)).toEqual(expected);
  });

  it.each([
    "",
    "padariadojoao",
    "https://instagram.com/padariadojoao",
    "https://facebook.com.golpe.com/padaria",
    "https://www.facebook.com/share/1AbCdEf/",
    "https://www.facebook.com/groups/123456",
    "https://www.facebook.com/profile.php",
    "javascript:alert(1)",
  ])("recusa %s", (link) => {
    expect(parsePageLink(link)).toBeNull();
  });
});

describe("matchesPage", () => {
  const page = { id: "123456789012", username: "PadariaDoJoao", link: "https://www.facebook.com/PadariaDoJoao" };

  it("casa por ID, por nome de usuário e pelo link da Página", () => {
    expect(matchesPage({ kind: "id", id: "123456789012" }, page)).toBe(true);
    expect(matchesPage({ kind: "username", username: "padariadojoao" }, page)).toBe(true);
    expect(matchesPage({ kind: "username", username: "padariadojoao" }, { ...page, username: null })).toBe(true);
  });

  it("não casa com outra Página", () => {
    expect(matchesPage({ kind: "id", id: "999" }, page)).toBe(false);
    expect(matchesPage({ kind: "username", username: "outra" }, page)).toBe(false);
  });
});
