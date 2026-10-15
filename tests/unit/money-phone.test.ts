import { describe, expect, it } from "vitest";
import { centsToInput, formatCents, parseBRLToCents } from "@/lib/money";
import { formatBrazilWhatsapp, normalizeBrazilWhatsapp } from "@/lib/phone";

describe("parseBRLToCents", () => {
  it.each([
    ["24,90", 2490],
    ["24,9", 2490],
    ["R$ 10", 1000],
    ["1.234,56", 123456],
    ["0,05", 5],
  ])("%s -> %d", (input, cents) => expect(parseBRLToCents(input)).toBe(cents));

  it.each(["", "abc", "24.90.1", "24,999", "-5"])("rejeita %j", (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });

  it("formata e volta para o campo", () => {
    expect(formatCents(2490)).toMatch(/R\$\s?24,90/);
    expect(centsToInput(2490)).toBe("24,90");
    expect(centsToInput(null)).toBe("");
  });
});

describe("WhatsApp", () => {
  it.each([
    ["(19) 99999-0000", "+5519999990000"],
    ["19 3333-4444", "+551933334444"],
    ["5519999990000", "+5519999990000"],
    ["+55 19 99999-0000", "+5519999990000"],
    ["", ""],
  ])("%j -> %j", (input, e164) => expect(normalizeBrazilWhatsapp(input)).toBe(e164));

  it("formata E.164 brasileiro", () => {
    expect(formatBrazilWhatsapp("+5519999990000")).toBe("(19) 99999-0000");
  });
});
