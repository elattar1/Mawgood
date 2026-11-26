import { describe, it, expect } from "vitest";
import { normalizeDigits, telHref } from "@/lib/phone";

describe("normalizeDigits", () => {
  it("converts Arabic-Indic digits to ASCII", () => {
    expect(normalizeDigits("٠١٠١٢٣٤٥٦٧")).toBe("0101234567");
  });
  it("converts Extended Arabic-Indic digits to ASCII", () => {
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });
  it("leaves ASCII untouched", () => {
    expect(normalizeDigits("01012345678")).toBe("01012345678");
  });
});

describe("telHref", () => {
  it("builds a tel link from an Arabic-typed number", () => {
    expect(telHref("٠١٠١٢٣٤٥٦٧٨")).toBe("tel:01012345678");
  });
  it("keeps a leading + and strips separators", () => {
    expect(telHref("+20 101-234-5678")).toBe("tel:+201012345678");
  });
  it("handles null and undefined", () => {
    expect(telHref(null)).toBe("tel:");
    expect(telHref(undefined)).toBe("tel:");
  });
});
