// POST /api/mobile/driver-application : endpoint for the native iOS customer app (additive; the website server function is unchanged).
import { createFileRoute } from "@tanstack/react-router";
import { mobileAuth, mobileJson } from "@/lib/mobile-auth.server";

export const Route = createFileRoute("/api/mobile/driver-application")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await mobileAuth(request);
        if (auth instanceof Response) return auth;
        const ex = await import("@/lib/mobile-extras.server");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return mobileJson({ error: "طلب غير صالح" }, 400);
        }
        const parsed = ex.driverAppInput.safeParse(body);
        if (!parsed.success) return mobileJson({ error: "البيانات غير صالحة" }, 400);
        try {
          const result = await ex.driverAppCore({ data: parsed.data, context: { userId: auth.userId } });
          return mobileJson(result ?? { success: true });
        } catch (e) {
          return mobileJson({ error: e instanceof Error ? e.message : "تعذر تنفيذ الطلب" }, 400);
        }
      },
    },
  },
});
