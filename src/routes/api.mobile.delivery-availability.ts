// POST /api/mobile/delivery-availability : native iOS endpoint (additive). Same rule as getDeliveryAvailability (active drivers > 0); returns only a boolean.
import { createFileRoute } from "@tanstack/react-router";
import { mobileJson } from "@/lib/mobile-auth.server";

export const Route = createFileRoute("/api/mobile/delivery-availability")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { count } = await supabaseAdmin.from("drivers").select("user_id", { count: "exact", head: true }).eq("is_active", true);
          return mobileJson({ available: (count ?? 0) > 0 });
        } catch {
          return mobileJson({ error: "تعذر التحقق" }, 500);
        }
      },
    },
  },
});
