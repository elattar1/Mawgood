// POST /api/mobile/driver-location : stable endpoint for the native iOS customer app (additive; the website server function is unchanged).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { assertOrderCustomer, mobileAuth, mobileJson } from "@/lib/mobile-auth.server";

const inputSchema = z.object({ orderId: z.string().uuid() });

export const Route = createFileRoute("/api/mobile/driver-location")({
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
        const parsed = inputSchema.safeParse(body);
        if (!parsed.success) return mobileJson({ error: "بيانات غير صالحة" }, 400);
        if (!(await assertOrderCustomer(auth.supabase, auth.userId, parsed.data.orderId))) {
          return mobileJson({ error: "الطلب غير موجود" }, 404);
        }
        try {
          const { driverLocationCore } = await import("@/lib/mobile-tracking.server");
          const result = await driverLocationCore({
            data: parsed.data,
            supabase: auth.supabase,
            userId: auth.userId,
          });
          return mobileJson(result);
        } catch (e) {
          return mobileJson({ error: e instanceof Error ? e.message : "تعذر تحميل الموقع" }, 400);
        }
      },
    },
  },
});
