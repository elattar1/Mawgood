// POST /api/mobile/complaints : the signed-in customer's own complaints and suggestions (additive copy of getCustomerComplaintsList).
import { createFileRoute } from "@tanstack/react-router";
import { mobileAuth, mobileJson } from "@/lib/mobile-auth.server";

export const Route = createFileRoute("/api/mobile/complaints")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await mobileAuth(request);
        if (auth instanceof Response) return auth;
        try {
          const { complaintsListCore } = await import("@/lib/mobile-extras.server");
          const rows = await complaintsListCore({ context: { userId: auth.userId } });
          return mobileJson({ items: rows });
        } catch (e) {
          return mobileJson({ error: e instanceof Error ? e.message : "تعذر التحميل" }, 400);
        }
      },
    },
  },
});
