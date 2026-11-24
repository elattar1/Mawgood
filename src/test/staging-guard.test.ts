import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM script
import { checkEnv } from "../../scripts/assert-staging-target.mjs";

const ok = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: "k",
  VITE_SUPABASE_PUBLISHABLE_KEY: "k",
};

describe("staging guard (fails closed on production targets)", () => {
  it("accepts an explicit non-production target", () => {
    expect(checkEnv(ok)).toEqual([]);
  });
  it("rejects missing variables because the app would fall back to production", () => {
    expect(checkEnv({}).length).toBeGreaterThanOrEqual(4);
    const { SUPABASE_URL, ...rest } = ok;
    expect(checkEnv(rest).some((p: string) => p.includes("SUPABASE_URL"))).toBe(true);
  });
  it("rejects a production project ref or host", () => {
    const prod = { ...ok, SUPABASE_URL: "https://ryxfnrozrzkuhobxfcmw.supabase.co", VITE_SUPABASE_URL: "https://ryxfnrozrzkuhobxfcmw.supabase.co" };
    expect(checkEnv(prod).length).toBeGreaterThan(0);
    expect(checkEnv({ ...ok, VITE_SUPABASE_URL: "https://www.mawgood.store", SUPABASE_URL: "https://www.mawgood.store" }).length).toBeGreaterThan(0);
  });
  it("rejects a server/client mismatch", () => {
    expect(checkEnv({ ...ok, VITE_SUPABASE_URL: "http://127.0.0.1:1" }).some((p: string) => p.includes("differ"))).toBe(true);
  });
});
