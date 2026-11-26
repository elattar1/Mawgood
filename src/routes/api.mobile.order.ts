// POST /api/mobile/order : stable endpoint for the native iOS customer app.
// The website's placeCustomerOrder server function has a per-deploy hashed URL (/_serverFn/<hash>), so a native app cannot call it
// reliably. This route runs the SAME logic (store open check, active-driver check, place_order RPC, store-owner and customer
// notifications) through placeOrderCore (a copy of that handler, see place-order.server.ts), authenticated with the customer's Supabase access token (Authorization: Bearer <jwt>).
// Request body: { store_id, items: [{ product_id, qty }], address, phone, notes?, area_id? } (same shape as the website checkout).
// Response: 200 { id } on success; 400 { error } for invalid input or business rule failures; 401 { error } for a missing or invalid token.
import { createFileRoute } from "@tanstack/react-router";
import { mobileAuth } from "@/lib/mobile-auth.server";
import { checkoutInput } from "@/lib/customer-rules";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const Route = createFileRoute("/api/mobile/order")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const authed = await mobileAuth(request);
        if (authed instanceof Response) return authed;
        const { supabase, userId } = authed;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "طلب غير صالح" }, 400);
        }
        const parsed = checkoutInput.safeParse(body);
        if (!parsed.success) return json({ error: "بيانات الطلب غير صالحة" }, 400);

        try {
          const { placeOrderCore } = await import("@/lib/place-order.server");
          const result = await placeOrderCore({ data: parsed.data, supabase, userId });
          return json({ id: result.id });
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "تعذر إرسال الطلب" }, 400);
        }
      },
    },
  },
});
