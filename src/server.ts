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

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
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
          systemEmail = `${cleanPhone}@phone.husayniya.app`;
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
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: systemEmail,
          password: password.trim(),
          email_confirm: true,
          user_metadata: {
            full_name: fullName || "مستخدم خدمات الحسينية",
            phone: cleanPhone,
            recovery_email: isEmail ? systemEmail : (email?.trim().toLowerCase() || null),
          },
        });

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
              full_name: fullName || "مستخدم خدمات الحسينية",
            });
          } catch (_) {}
        }

        return new Response(
          JSON.stringify({
            success: true,
            alreadyExists: false,
            authEmail: systemEmail,
            phone: cleanPhone,
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

    // 3. Direct REST API for Order Live Chat (Mobile & Web Interoperability)
    if (url.pathname === "/api/chat/send" && request.method === "POST") {
      try {
        const body = await request.json();
        const { orderId, message, senderId, senderName, senderRole, stage } = body;

        if (!orderId || !message || typeof message !== "string" || !message.trim()) {
          return new Response(JSON.stringify({ error: "معرف الطلب والرسالة مطلوبان" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Fetch Order
        const orderRes = await supabaseAdmin
          .from("orders")
          .select("id, status, notes, customer_id, driver_id, store_id, stores(id, name, owner_id)")
          .eq("id", orderId)
          .maybeSingle();

        if (orderRes.error || !orderRes.data) {
          return new Response(JSON.stringify({ error: "الطلب غير موجود" }), {
            status: 404,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const order = orderRes.data;
        const storeRow = order.stores as any;

        const isDriverStage = order.status === "on_the_way" || order.status === "delivered" || order.driver_id != null;
        const chatStage = stage || (isDriverStage ? "driver" : "store");

        const newMessage = {
          id: crypto.randomUUID(),
          order_id: orderId,
          sender_id: senderId || order.customer_id,
          sender_role: senderRole || "customer",
          sender_name: senderName || "مستخدم",
          message: message.trim(),
          stage: chatStage,
          created_at: new Date().toISOString(),
        };

        // Try insert into order_messages table
        try {
          await (supabaseAdmin.from("order_messages" as any) as any).insert({
            id: newMessage.id,
            order_id: newMessage.order_id,
            sender_id: newMessage.sender_id,
            sender_role: newMessage.sender_role,
            sender_name: newMessage.sender_name,
            message: newMessage.message,
            stage: newMessage.stage,
            created_at: newMessage.created_at,
          });
        } catch (_) {}

        // Guarantee persistence in orders.notes <!-- CHAT_V1: [...] -->
        const notes = order.notes || "";
        const match = notes.match(/<!-- CHAT_V1: ([\s\S]*?) -->/);
        let existingMessages: any[] = [];
        let cleanNotes = notes;

        if (match) {
          try {
            existingMessages = JSON.parse(match[1]);
          } catch (_) {}
          cleanNotes = notes.replace(/<!-- CHAT_V1: [\s\S]*? -->/, "").trim();
        }

        existingMessages.push(newMessage);
        const serialized = cleanNotes
          ? `${cleanNotes}\n<!-- CHAT_V1: ${JSON.stringify(existingMessages)} -->`
          : `<!-- CHAT_V1: ${JSON.stringify(existingMessages)} -->`;

        await supabaseAdmin.from("orders").update({ notes: serialized }).eq("id", orderId);

        // Send notifications & web push asynchronously
        try {
          const { sendPushToUser } = await import("@/lib/push.functions");

          if (newMessage.sender_role === "customer") {
            if (chatStage === "store" && storeRow?.owner_id) {
              const title = `💬 رسالة من العميل (${storeRow.name || "المتجر"})`;
              const bodyText = message.length > 70 ? message.slice(0, 67) + "..." : message;
              const link = `/provider?tab=orders&chat=${orderId}`;
              await supabaseAdmin.from("notifications").insert({
                user_id: storeRow.owner_id,
                title,
                body: bodyText,
                link,
              });
              await sendPushToUser(storeRow.owner_id, {
                title,
                body: bodyText,
                path: link,
                tag: `husayniya-chat-${orderId}`,
              });
            } else if (chatStage === "driver" && order.driver_id) {
              const title = "💬 رسالة جديدة من العميل";
              const bodyText = message.length > 70 ? message.slice(0, 67) + "..." : message;
              const link = `/delivery?tab=current&chat=${orderId}`;
              await supabaseAdmin.from("notifications").insert({
                user_id: order.driver_id,
                title,
                body: bodyText,
                link,
              });
              await sendPushToUser(order.driver_id, {
                title,
                body: bodyText,
                path: link,
                tag: `husayniya-chat-${orderId}`,
              });
            }
          } else {
            // Sender is store or driver -> notify customer
            if (order.customer_id) {
              const title =
                newMessage.sender_role === "driver"
                  ? "🛵 رسالة جديدة من كابتن التوصيل"
                  : `🏪 رسالة جديدة من ${storeRow?.name || "المتجر"}`;
              const bodyText = message.length > 70 ? message.slice(0, 67) + "..." : message;
              const link = `/orders?chat=${orderId}`;
              await supabaseAdmin.from("notifications").insert({
                user_id: order.customer_id,
                title,
                body: bodyText,
                link,
              });
              await sendPushToUser(order.customer_id, {
                title,
                body: bodyText,
                path: link,
                tag: `husayniya-chat-${orderId}`,
              });
            }
          }
        } catch (_) {}

        return new Response(JSON.stringify({ success: true, message: newMessage }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || "حدث خطأ غير متوقع" }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    // 3. Direct REST API to read order chat messages
    if (url.pathname === "/api/chat/messages" && request.method === "GET") {
      try {
        const orderId = url.searchParams.get("orderId");
        if (!orderId) {
          return new Response(JSON.stringify({ error: "معرف الطلب مطلوب" }), {
            status: 400,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Try order_messages table first
        try {
          const tblRes = await (supabaseAdmin.from("order_messages" as any) as any)
            .select("*")
            .eq("order_id", orderId)
            .order("created_at", { ascending: true });

          if (!tblRes.error && Array.isArray(tblRes.data) && tblRes.data.length > 0) {
            return new Response(JSON.stringify({ success: true, messages: tblRes.data }), {
              status: 200,
              headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            });
          }
        } catch (_) {}

        // Fallback to orders.notes
        const orderRes = await supabaseAdmin
          .from("orders")
          .select("notes")
          .eq("id", orderId)
          .maybeSingle();

        const notes = orderRes.data?.notes || "";
        const match = notes.match(/<!-- CHAT_V1: ([\s\S]*?) -->/);
        let messages: any[] = [];
        if (match) {
          try {
            messages = JSON.parse(match[1]);
          } catch (_) {}
        }

        return new Response(JSON.stringify({ success: true, messages }), {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message || "حدث خطأ أثناء تحميل الرسائل" }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
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
