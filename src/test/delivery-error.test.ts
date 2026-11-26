import { describe, it, expect } from "vitest";
import { classifyActionError } from "@/lib/delivery-error";

describe("classifyActionError", () => {
  it("classifies fetch failures as network errors", () => {
    expect(classifyActionError(new TypeError("Failed to fetch"))).toEqual({
      kind: "network",
      message: "فشل الاتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.",
    });
  });
  it("classifies empty errors as network errors", () => {
    expect(classifyActionError(null).kind).toBe("network");
    expect(classifyActionError(undefined).kind).toBe("network");
  });
  it("classifies session errors as auth errors", () => {
    expect(classifyActionError(new Error("JWT expired"))).toEqual({
      kind: "auth",
      message: "انتهت الجلسة. سجّل الدخول مرة أخرى ثم أعد المحاولة.",
    });
  });
  it("passes Arabic server messages through", () => {
    expect(classifyActionError(new Error("لا يمكن إنهاء هذا الطلب"))).toEqual({
      kind: "server",
      message: "لا يمكن إنهاء هذا الطلب",
    });
  });
  it("uses a generic Arabic message for unknown server errors", () => {
    expect(classifyActionError(new Error("syntax error near foo")).kind).toBe("server");
    expect(classifyActionError(new Error("syntax error near foo")).message).toContain("الخادم");
  });
});
