// POST /api/mobile/cancel : stable endpoint for the native iOS customer app (additive; the website server function is unchanged).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requestKinds } from "@/lib/dashboard-rules";

const cancelInput = z.object({ kind: z.enum(requestKinds), id: z.string().uuid() });
import { mobileAuth, mobileJson } from "@/lib/mobile-auth.server";

export const Route = createFileRoute("/api/mobile/cancel")({
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
        const parsed = cancelInput.safeParse(body);
        if (!parsed.success) return mobileJson({ error: "بيانات الإلغاء غير صالحة" }, 400);
        try {
          const { cancelRequestCore } = await import("@/lib/mobile-requests.server");
          const result = await cancelRequestCore({
            data: parsed.data,
            supabase: auth.supabase,
            userId: auth.userId,
          });
          return mobileJson({ id: (result as { id?: unknown } | null | undefined)?.id ?? null });
        } catch (e) {
          return mobileJson({ error: e instanceof Error ? e.message : "تعذر الإلغاء" }, 400);
        }
      },
    },
  },
});
