// Classifies server-action failures so riders see a specific message
// instead of a generic failure toast.

export type ActionErrorKind = "network" | "auth" | "server";
export type ClassifiedActionError = { kind: ActionErrorKind; message: string };

const NETWORK_MESSAGE = "فشل الاتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.";
const AUTH_MESSAGE = "انتهت الجلسة. سجّل الدخول مرة أخرى ثم أعد المحاولة.";
const SERVER_MESSAGE = "حدث خطأ في الخادم. أعد المحاولة بعد قليل.";

const ARABIC_RE = /[\u0600-\u06FF]/;

export function classifyActionError(error: unknown): ClassifiedActionError {
  const raw = rawMessage(error).trim();
  const text = raw.toLowerCase();
  if (
    !raw ||
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("network request failed") ||
    text.includes("load failed") ||
    text.includes("econnrefused") ||
    text.includes("etimedout") ||
    text.includes("econnreset")
  ) {
    return { kind: "network", message: NETWORK_MESSAGE };
  }
  if (
    text.includes("jwt") ||
    text.includes("401") ||
    text.includes("unauthorized") ||
    text.includes("not authenticated") ||
    text.includes("session")
  ) {
    return { kind: "auth", message: AUTH_MESSAGE };
  }
  if (ARABIC_RE.test(raw)) {
    // Postgres RAISE EXCEPTION messages are already rider-readable Arabic.
    return { kind: "server", message: raw };
  }
  return { kind: "server", message: SERVER_MESSAGE };
}

function rawMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "";
  const candidate = error as { message?: unknown };
  return typeof candidate.message === "string" ? candidate.message : "";
}
