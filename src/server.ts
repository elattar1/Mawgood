import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(k)) {
      newHeaders.set(k, v);
    }
  }

  if (response.status < 500) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { ...Object.fromEntries(newHeaders.entries()), "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);

    // 1. Handle CORS Preflight for custom API endpoints
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. Direct REST API for Mobile & Web User Registration (Phone or Email)
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      try {
        const body = await request.json();
        const { fullName, phone, email, password } = body as {
          fullName?: string;
          phone?: string;
          email?: string;
          password?: string;
        };

        if (!password || password.length < 6) {
          return new Response(
            JSON.stringify({ error: "كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام" }),
            { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }

        const { normalizePhone } = await import("@/lib/auth.functions");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const rawInput = (phone || email || "").trim();
        const isEmail = rawInput.includes("@");
        let cleanPhone = "";
        let systemEmail = "";

        if (isEmail) {
          systemEmail = rawInput.toLowerCase();
          cleanPhone = normalizePhone(phone || "");
        } else {
          cleanPhone = normalizePhone(rawInput);
          if (cleanPhone.length < 10) {
            return new Response(
              JSON.stringify({ error: "يرجى كتابة رقم هاتف صحيح (مثال: 01012345678)" }),
              { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
          }
          systemEmail = `${cleanPhone}@phone.mawgood.store`;
        }

        // 1. Check if phone already registered in profiles
        if (cleanPhone.length >= 8) {
          const existingProfile = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, phone")
            .eq("phone", cleanPhone)
            .maybeSingle();

          if (existingProfile.data?.id) {
            return new Response(
              JSON.stringify({
                success: false,
                alreadyExists: true,
                name: existingProfile.data.full_name || "",
                identifier: cleanPhone,
                message: `يوجد حساب بالفعل مسجل برقم الهاتف هذا باسم (${existingProfile.data.full_name || "مستخدم"})، تم تحويلك لتسجيل الدخول.`,
              }),
              { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
          }
        }

        // 2. Check auth users list
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const users = listData?.users || [];
        const conflict = users.find(
          (u) =>
            u.email?.toLowerCase().trim() === systemEmail ||
            u.email?.toLowerCase().trim() === `${cleanPhone}@phone.husayniya.app` ||
            (cleanPhone && (u.user_metadata?.phone === cleanPhone || u.phone === cleanPhone))
        );

        if (conflict) {
          return new Response(
            JSON.stringify({
              success: false,
              alreadyExists: true,
              name: conflict.user_metadata?.full_name || "",
              identifier: isEmail ? systemEmail : cleanPhone,
              message: "يوجد مستخدم بالفعل مسجل بهذه البيانات، يرجى تسجيل الدخول.",
            }),
            { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }

        // 3. Create user with email_confirm: true (Instant auto-activation, no MX / SMTP bounce)
        const e164Phone = cleanPhone ? (cleanPhone.startsWith("0") ? `+20${cleanPhone.slice(1)}` : `+20${cleanPhone}`) : undefined;
        let newUser: any = null;
        let createError: any = null;

        try {
          const res = await supabaseAdmin.auth.admin.createUser({
            email: systemEmail,
            phone: e164Phone,
            password: password.trim(),
            email_confirm: true,
            phone_confirm: true,
            user_metadata: {
              full_name: fullName || "مستخدم موجود",
              phone: cleanPhone,
              recovery_email: isEmail ? systemEmail : (email?.trim().toLowerCase() || null),
            },
          });
          newUser = res.data;
          createError = res.error;
        } catch {
          const res = await supabaseAdmin.auth.admin.createUser({
            email: systemEmail,
            password: password.trim(),
            email_confirm: true,
            user_metadata: {
              full_name: fullName || "مستخدم موجود",
              phone: cleanPhone,
              recovery_email: isEmail ? systemEmail : (email?.trim().toLowerCase() || null),
            },
          });
          newUser = res.data;
          createError = res.error;
        }

        if (createError) {
          const errorMsg = createError.message?.toLowerCase() || "";
          if (errorMsg.includes("already registered") || errorMsg.includes("already exists")) {
            return new Response(
              JSON.stringify({
                success: false,
                alreadyExists: true,
                identifier: isEmail ? systemEmail : cleanPhone,
                message: "هذا الحساب مسجل مسبقاً، يرجى تسجيل الدخول.",
              }),
              { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
          }
          if (errorMsg.includes("weak") || errorMsg.includes("pwned") || errorMsg.includes("easy to guess")) {
            return new Response(
              JSON.stringify({
                error: "كلمة المرور ضعيفة جداً أو شائعة (مثل 123456). يرجى اختيار كلمة مرور أقوى تحتوي على حروف وأرقام.",
              }),
              { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
            );
          }
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        // 4. Save into profiles table
        if (newUser?.user?.id) {
          try {
            await supabaseAdmin.from("profiles").upsert({
              id: newUser.user.id,
              phone: cleanPhone || null,
              full_name: fullName || "مستخدم موجود",
            });
          } catch (_) {}
        }

        return new Response(
          JSON.stringify({
            success: true,
            alreadyExists: false,
            phone: cleanPhone,
            identifier: cleanPhone || systemEmail,
            authEmail: isEmail ? systemEmail : undefined,
          }),
          { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || "تعذر إنشاء الحساب" }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }
    }

    // Default TanStack Start SSR handler
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
