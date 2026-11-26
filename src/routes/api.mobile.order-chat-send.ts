// POST /api/mobile/order-chat-send : stable endpoint for the native iOS customer app (additive; the website server function is unchanged).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { assertOrderCustomer, mobileAuth, mobileJson } from "@/lib/mobile-auth.server";

const inputSchema = z.object({
  orderId: z.string().uuid(),
  message: z.string().trim().min(1, "الرسالة لا يمكن أن تكون فارغة").max(1000, "الرسالة طويلة جداً"),
});

export const Route = createFileRoute("/api/mobile/order-chat-send")({
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
        if (!parsed.success) return mobileJson({ error: "الرسالة غير صالحة" }, 400);
        if (!(await assertOrderCustomer(auth.supabase, auth.userId, parsed.data.orderId))) {
          return mobileJson({ error: "الطلب غير موجود" }, 404);
        }
        try {
          const { orderChatSendCore } = await import("@/lib/mobile-tracking.server");
          const result = await orderChatSendCore({
            data: parsed.data,
            supabase: auth.supabase,
            userId: auth.userId,
          });
          return mobileJson(result);
        } catch (e) {
          return mobileJson({ error: e instanceof Error ? e.message : "تعذر إرسال الرسالة" }, 400);
        }
      },
    },
  },
});
