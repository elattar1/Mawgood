// Bearer-token auth for the native iOS endpoints (same checks as the website middleware). Additive; used only by /api/mobile/* routes.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const mobileJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function mobileAuth(
  request: Request,
): Promise<{ supabase: SupabaseClient<Database>; userId: string } | Response> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return mobileJson({ error: "تعذر الاتصال بالخدمات" }, 500);
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return mobileJson({ error: "Unauthorized" }, 401);
  const token = auth.slice("Bearer ".length);
  if (token.split(".").length !== 3) return mobileJson({ error: "Unauthorized" }, 401);
  const supabase = createClient<Database>(url, key, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  let userId: string | undefined;
  try {
    const claims = await supabase.auth.getClaims(token);
    if (claims.error) return mobileJson({ error: "Unauthorized" }, 401);
    userId = claims.data?.claims?.sub;
  } catch {
    // A malformed or unverifiable token must be a 401, never a server error.
    return mobileJson({ error: "Unauthorized" }, 401);
  }
  if (!userId) return mobileJson({ error: "Unauthorized" }, 401);
  return { supabase, userId };
}

/**
 * The native app is customer-only. Before any privileged (service-role) lookup for an order, require that the signed-in user
 * is the order's customer, using the user's own token (row-level security) plus an explicit customer_id match.
 */
export async function assertOrderCustomer(
  supabase: SupabaseClient<Database>,
  userId: string,
  orderId: string,
): Promise<boolean> {
  const res = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("customer_id", userId)
    .maybeSingle();
  return !res.error && !!res.data;
}
