// Fail-closed guard for staging/test runs. Production fallbacks in the app are NOT changed.
// Usage: node scripts/assert-staging-target.mjs [dir-to-scan ...]
// Exits 1 unless SUPABASE_URL / VITE_SUPABASE_URL are explicitly set to a non-production target,
// and no scanned build output contains the production project ref.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const PRODUCTION_REFS = ["ryxfnrozrzkuhobxfcmw", "krjkhgunuibcntfyhexu"];
export const PRODUCTION_HOSTS = ["mawgood.store"];
const REQUIRED = ["SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"];

export function checkEnv(env) {
  const problems = [];
  for (const k of REQUIRED) if (!env[k]) problems.push(`${k} is not set (the app would fall back to production)`);
  for (const k of ["SUPABASE_URL", "VITE_SUPABASE_URL"]) {
    const v = env[k] || "";
    if (PRODUCTION_REFS.some((r) => v.includes(r))) problems.push(`${k} points at a production project`);
    if (PRODUCTION_HOSTS.some((h) => v.includes(h))) problems.push(`${k} points at the production site`);
  }
  if (env.SUPABASE_URL && env.VITE_SUPABASE_URL && env.SUPABASE_URL !== env.VITE_SUPABASE_URL) {
    problems.push("SUPABASE_URL and VITE_SUPABASE_URL differ (server and client would use different backends)");
  }
  return problems;
}

export function scanDir(dir, found = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) scanDir(p, found);
    else if (/\.(m?js|cjs|html|json|css|map)$/.test(name) && s.size < 20_000_000) {
      const t = readFileSync(p, "utf8");
      for (const r of PRODUCTION_REFS) if (t.includes(r)) found.push(`${p} contains production ref`);
    }
  }
  return found;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkEnv(process.env);
  for (const d of process.argv.slice(2)) {
    try { problems.push(...scanDir(d)); } catch (e) { problems.push(`cannot scan ${d}: ${e.message}`); }
  }
  if (problems.length) {
    console.error("STAGING GUARD FAILED:\n- " + problems.join("\n- "));
    process.exit(1);
  }
  console.log("staging guard ok");
}
