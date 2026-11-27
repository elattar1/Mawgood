// Phone helpers for numbers typed in Arabic.
// Arabic-Indic digits (٠-٩) and Extended Arabic-Indic digits (۰-۹) break
// tel: links on some Android WebViews, so normalize before dialing.

const ARABIC_INDIC_START = 0x0660;
const EXTENDED_ARABIC_INDIC_START = 0x06f0;

export function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= ARABIC_INDIC_START && code <= ARABIC_INDIC_START + 9) {
      return String(code - ARABIC_INDIC_START);
    }
    return String(code - EXTENDED_ARABIC_INDIC_START);
  });
}

export function telHref(phone: string | null | undefined): string {
  const normalized = normalizeDigits(phone ?? "");
  const hasPlus = normalized.trim().startsWith("+");
  const digits = normalized.replace(/[^0-9]/g, "");
  return `tel:${hasPlus ? "+" : ""}${digits}`;
}
