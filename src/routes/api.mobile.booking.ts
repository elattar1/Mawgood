// POST /api/mobile/booking : stable endpoint for the native iOS customer app (additive; the website server function is unchanged).
import { createFileRoute } from "@tanstack/react-router";
import { bookingInput } from "@/lib/customer-rules";
import { mobileAuth, mobileJson } from "@/lib/mobile-auth.server";

export const Route = createFileRoute("/api/mobile/booking")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await mobileAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return mobileJson({ error: "طلب غير صالح" }, 400);
        }
        const parsed = bookingInput.safeParse(body);
        if (!parsed.success) return mobileJson({ error: "بيانات الحجز غير صالحة" }, 400);
        try {
          const { bookingCore } = await import("@/lib/mobile-requests.server");
          const result = await bookingCore({
            data: parsed.data,
            supabase: auth.supabase,
            userId: auth.userId,
          });
          return mobileJson({ id: result.id });
        } catch (e) {
          return mobileJson({ error: e instanceof Error ? e.message : "تعذر الحجز" }, 400);
        }
      },
    },
  },
});
