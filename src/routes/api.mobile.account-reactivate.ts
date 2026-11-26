// POST /api/mobile/account-reactivate : native iOS endpoint (additive; the website server functions are unchanged).
import { createFileRoute } from "@tanstack/react-router";
import { mobileAuth, mobileJson } from "@/lib/mobile-auth.server";

export const Route = createFileRoute("/api/mobile/account-reactivate")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await mobileAuth(request);
        if (auth instanceof Response) return auth;
        const ex = await import("@/lib/mobile-account.server");
        try {
          const result = await ex.reactivateCore({ context: { userId: auth.userId, supabase: auth.supabase } } as never);
          return mobileJson(result ?? { success: true });
        } catch (e) {
          return mobileJson({ error: e instanceof Error ? e.message : "تعذر تنفيذ الطلب" }, 400);
        }
      },
    },
  },
});
