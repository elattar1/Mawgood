import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ChatMessage {
  id: string;
  order_id: string;
  sender_id: string;
  sender_role: "customer" | "store" | "driver" | "admin";
  sender_name: string;
  message: string;
  created_at: string;
  stage?: "store" | "driver";
  is_read?: boolean;
  read_at?: string | null;
}

export interface OrderChatInfo {
  orderId: string;
  status: string;
  chatStage: "store" | "driver"; // "store" during preparation, "driver" once picked up
  isStoreClosed: boolean; // true if driver claimed/picked up and store chat is finished
  store: {
    id: string;
    name: string;
    phone: string | null;
    category: string | null;
    ownerId: string | null;
  } | null;
  driver: {
    id: string | null;
    phone: string | null;
    name: string | null;
  } | null;
  customer: {
    id: string;
    phone: string;
    name: string;
  };
  total: number;
  deliveryFee: number;
  subtotal?: number;
  address?: string | null;
  notes?: string | null;
  items?: Array<{ name: string; qty: number; price: number }>;
  createdAt?: string | null;
  myRole: "customer" | "store" | "driver" | "admin";
  messages: ChatMessage[];
}

function parseMessagesFromNotes(notes: string | null | undefined): { cleanNotes: string; messages: ChatMessage[] } {
  if (!notes) return { cleanNotes: "", messages: [] };
  const match = notes.match(/<!-- CHAT_V1: ([\s\S]*?) -->/);
  if (!match) return { cleanNotes: notes.trim(), messages: [] };
  try {
    const parsed = JSON.parse(match[1]);
    const cleanNotes = notes.replace(/<!-- CHAT_V1: [\s\S]*? -->/, "").trim();
    const messages: ChatMessage[] = (Array.isArray(parsed) ? parsed : []).map((m: any) => ({
      id: String(m.id),
      order_id: String(m.order_id),
      sender_id: String(m.sender_id),
      sender_role: m.sender_role,
      sender_name: String(m.sender_name),
      message: String(m.message),
      created_at: String(m.created_at),
      stage: m.stage,
      is_read: m.is_read !== undefined ? Boolean(m.is_read) : Boolean(m.read_at),
      read_at: m.read_at || null,
    }));
    return { cleanNotes, messages };
  } catch {
    return { cleanNotes: notes.trim(), messages: [] };
  }
}

function serializeMessagesToNotes(cleanNotes: string, messages: ChatMessage[]): string {
  const json = JSON.stringify(messages);
  return cleanNotes ? `${cleanNotes}\n<!-- CHAT_V1: ${json} -->` : `<!-- CHAT_V1: ${json} -->`;
}

export const getOrderChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<OrderChatInfo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orderRes = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, driver_id, store_id, status, phone, address, notes, total, subtotal, delivery_fee, picked_up_at, created_at, stores(id, name, owner_id, phone, category), order_items(name, qty, price)")
      .eq("id", data.orderId)
      .maybeSingle();

    if (orderRes.error || !orderRes.data) {
      throw new Error("لم يتم العثور على هذا الطلب");
    }

    const order = orderRes.data;
    const storeRow = order.stores as any;

    // Check authorization: customer, assigned driver, store owner, or platform admin
    const isAdmin = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isCustomer = context.userId === order.customer_id;
    const isDriver = context.userId === order.driver_id;
    const isStoreOwner = storeRow && storeRow.owner_id === context.userId;

    if (!isCustomer && !isDriver && !isStoreOwner && !isAdmin.data) {
      throw new Error("غير مصرح لك بالاطلاع على محادثة هذا الطلب");
    }

    // Determine current chat stage:
    // If order is with driver (status: "on_the_way" or "delivered" or picked up or driver assigned) -> "driver"
    // Otherwise (placed, confirmed, preparing without driver) -> "store"
    const isDriverStage = Boolean(order.driver_id || order.status === "on_the_way" || order.status === "delivered" || order.picked_up_at);
    const chatStage: "store" | "driver" = isDriverStage ? "driver" : "store";

    const myRole: "customer" | "store" | "driver" | "admin" = isDriver
      ? "driver"
      : isStoreOwner
      ? "store"
      : isCustomer
      ? "customer"
      : "admin";

    // Fetch customer details
    let customerName = "العميل";
    const profileRes = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", order.customer_id)
      .maybeSingle();
    if (profileRes.data?.full_name) {
      customerName = profileRes.data.full_name;
    }

    // Fetch driver details if assigned
    let driverData: OrderChatInfo["driver"] = null;
    if (order.driver_id) {
      const driverRes = await supabaseAdmin
        .from("drivers")
        .select("user_id, full_name, phone")
        .eq("user_id", order.driver_id)
        .maybeSingle();

      if (driverRes.data) {
        driverData = {
          id: driverRes.data.user_id,
          name: driverRes.data.full_name ? `الكابتن ${driverRes.data.full_name}` : "كابتن التوصيل",
          phone: driverRes.data.phone || null,
        };
      } else {
        driverData = {
          id: order.driver_id,
          name: "كابتن التوصيل",
          phone: null,
        };
      }
    }

    // Load and merge messages from order.notes and order_messages table
    const notesParsed = parseMessagesFromNotes(order.notes);
    const messagesMap = new Map<string, ChatMessage>();

    for (const m of notesParsed.messages) {
      messagesMap.set(m.id, m);
    }

    try {
      const tblRes = await (supabaseAdmin.from("order_messages" as any) as any)
        .select("*")
        .eq("order_id", data.orderId)
        .order("created_at", { ascending: true });

      if (!tblRes.error && Array.isArray(tblRes.data)) {
        for (const m of tblRes.data) {
          const existing = messagesMap.get(String(m.id));
          messagesMap.set(String(m.id), {
            id: String(m.id),
            order_id: String(m.order_id),
            sender_id: String(m.sender_id),
            sender_role: m.sender_role as "customer" | "store" | "driver" | "admin",
            sender_name: String(m.sender_name),
            message: String(m.message),
            created_at: String(m.created_at),
            stage: m.stage || (m.sender_role === "driver" ? "driver" : m.sender_role === "store" ? "store" : undefined),
            is_read: existing ? existing.is_read : (m.is_read !== undefined ? Boolean(m.is_read) : Boolean(m.read_at)),
            read_at: existing ? existing.read_at : (m.read_at || null),
          });
        }
      }
    } catch (e) {
      console.warn("Could not read order_messages table, relying on order.notes:", e);
    }

    const rawMessages: ChatMessage[] = Array.from(messagesMap.values()).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Auto-mark incoming messages from other parties as read when opening chat
    const isCompleted = order.status === "delivered" || order.status === "completed";
    const nowIso = new Date().toISOString();
    let hasUnreadFromOthers = false;

    for (const m of rawMessages) {
      if (isCompleted && !m.is_read) {
        m.is_read = true;
        m.read_at = m.read_at || nowIso;
        hasUnreadFromOthers = true;
      } else if (m.sender_id !== context.userId && m.sender_id !== "system" && !m.is_read) {
        m.is_read = true;
        m.read_at = nowIso;
        hasUnreadFromOthers = true;
      }
    }

    if (hasUnreadFromOthers) {
      try {
        const { cleanNotes } = parseMessagesFromNotes(order.notes);
        const serialized = serializeMessagesToNotes(cleanNotes, rawMessages);
        void supabaseAdmin.from("orders").update({ notes: serialized }).eq("id", data.orderId);
      } catch {}

      try {
        void (supabaseAdmin.from("order_messages" as any) as any)
          .update({ is_read: true, read_at: nowIso })
          .eq("order_id", data.orderId)
          .neq("sender_id", context.userId);
      } catch {}

      try {
        void supabaseAdmin
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", context.userId)
          .ilike("link", `%chat=${data.orderId}%`);
      } catch {}
    }

    // Separation of chats:
    // 1. Driver gets a fresh chat (only driver-phase messages, no private store/kitchen chat)
    // 2. Store only sees store-phase messages (before delivery takeover)
    // 3. Customer sees continuous thread with transition note
    let visibleMessages: ChatMessage[] = [];
    if (myRole === "driver") {
      visibleMessages = rawMessages.filter(
        (m) => m.stage === "driver" || m.sender_role === "driver"
      );
    } else if (myRole === "store") {
      visibleMessages = rawMessages.filter(
        (m) =>
          (m.stage === "store" || m.sender_role === "store" || (!m.stage && m.sender_role !== "driver")) &&
          m.stage !== "driver" &&
          m.sender_role !== "driver"
      );
    } else {
      visibleMessages = rawMessages;
    }

    const { cleanNotes } = parseMessagesFromNotes(order.notes);

    return {
      orderId: order.id,
      status: order.status,
      chatStage,
      isStoreClosed: isDriverStage,
      store: storeRow
        ? {
            id: storeRow.id,
            name: storeRow.name,
            phone: storeRow.phone ?? null,
            category: storeRow.category ?? null,
            ownerId: storeRow.owner_id ?? null,
          }
        : null,
      driver: driverData,
      customer: {
        id: order.customer_id,
        phone: order.phone,
        name: customerName,
      },
      total: Number(order.total || 0),
      deliveryFee: Number(order.delivery_fee || 0),
      subtotal: Number(order.subtotal ?? (Number(order.total || 0) - Number(order.delivery_fee || 0))),
      address: (order as any).address ?? null,
      notes: cleanNotes || null,
      items: Array.isArray((order as any).order_items)
        ? (order as any).order_items.map((it: any) => ({
            name: it.name,
            qty: Number(it.qty || 1),
            price: Number(it.price || 0),
          }))
        : [],
      createdAt: order.created_at ?? null,
      myRole,
      messages: visibleMessages,
    };
  });

export const sendOrderChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      orderId: z.string().uuid(),
      message: z.string().trim().min(1, "الرسالة لا يمكن أن تكون فارغة").max(1000, "الرسالة طويلة جداً"),
    })
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orderRes = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, driver_id, store_id, status, notes, picked_up_at, stores(id, name, owner_id, phone)")
      .eq("id", data.orderId)
      .maybeSingle();

    if (orderRes.error || !orderRes.data) {
      throw new Error("الطلب غير موجود");
    }

    const order = orderRes.data;
    const storeRow = order.stores as any;

    // Check authorization
    const isAdmin = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isCustomer = context.userId === order.customer_id;
    const isDriver = context.userId === order.driver_id;
    const isStoreOwner = storeRow && storeRow.owner_id === context.userId;

    if (!isCustomer && !isDriver && !isStoreOwner && !isAdmin.data) {
      throw new Error("غير مصرح لك بإرسال رسائل في هذا الطلب");
    }

    // Auto-close chat once order is delivered, completed, or cancelled
    if (order.status === "delivered" || order.status === "completed" || order.status === "cancelled") {
      throw new Error("تم إغلاق المحادثة تلقائياً لاكتمال تسليم الطلب");
    }

    const isDriverStage = Boolean(order.driver_id || order.status === "on_the_way" || order.status === "delivered" || order.picked_up_at);
    const chatStage: "store" | "driver" = isDriverStage ? "driver" : "store";

    const senderRole: "customer" | "store" | "driver" | "admin" = isDriver
      ? "driver"
      : isStoreOwner
      ? "store"
      : isCustomer
      ? "customer"
      : "admin";

    // Strict stage enforcement: store cannot send messages once driver has claimed the order
    if (senderRole === "store" && isDriverStage) {
      throw new Error("تم تسليم الطلب لكابتن التوصيل؛ أُغلقت محادثة المتجر لهذا الطلب.");
    }

    // Determine sender display name
    let senderName = "مستخدم";
    if (senderRole === "store") {
      senderName = storeRow?.name ? `إدارة ${storeRow.name}` : "إدارة المتجر";
    } else if (senderRole === "driver") {
      const dr = await supabaseAdmin.from("drivers").select("full_name").eq("user_id", context.userId).maybeSingle();
      senderName = dr.data?.full_name ? `الكابتن ${dr.data.full_name}` : "كابتن التوصيل";
    } else if (senderRole === "customer") {
      const pr = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
      senderName = pr.data?.full_name || "العميل";
    } else {
      senderName = "إدارة موجود";
    }

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      order_id: data.orderId,
      sender_id: context.userId,
      sender_role: senderRole,
      sender_name: senderName,
      message: data.message,
      created_at: new Date().toISOString(),
      stage: chatStage,
      is_read: false,
      read_at: null,
    };

    // 1. Try to insert into order_messages table
    try {
      await (supabaseAdmin.from("order_messages" as any) as any).insert({
        id: newMessage.id,
        order_id: newMessage.order_id,
        sender_id: newMessage.sender_id,
        sender_role: newMessage.sender_role,
        sender_name: newMessage.sender_name,
        message: newMessage.message,
        created_at: newMessage.created_at,
        stage: newMessage.stage,
      });
    } catch (e) {
      console.warn("Failed to insert into order_messages table, fallback to notes:", e);
    }

    // 2. Always guarantee persistence in order notes for cross-platform reliability
    try {
      const freshOrder = await supabaseAdmin.from("orders").select("notes").eq("id", data.orderId).maybeSingle();
      const currentNotes = freshOrder.data?.notes ?? order.notes;
      const { cleanNotes, messages } = parseMessagesFromNotes(currentNotes);
      if (!messages.some((m) => m.id === newMessage.id)) {
        const updatedMessages = [...messages, newMessage];
        const serialized = serializeMessagesToNotes(cleanNotes, updatedMessages);
        await supabaseAdmin.from("orders").update({ notes: serialized }).eq("id", data.orderId);
      }
    } catch (e) {
      console.error("Failed to update order notes with new message:", e);
    }

    // Intelligent notification routing based on chat stage (both in-app and web push)
    try {
      const { sendPushToUser } = await import("@/lib/push.functions");

      if (senderRole === "customer") {
        if (chatStage === "store" && storeRow?.owner_id) {
          const title = `💬 رسالة من العميل (${storeRow.name})`;
          const body = data.message.length > 70 ? data.message.slice(0, 67) + "..." : data.message;
          const link = `/provider?tab=orders&chat=${data.orderId}`;
          await supabaseAdmin.from("notifications").insert({
            user_id: storeRow.owner_id,
            title,
            body,
            link,
          });
          await sendPushToUser(storeRow.owner_id, {
            title,
            body,
            path: link,
            tag: `husayniya-chat-${data.orderId}`,
          });
        } else if (chatStage === "driver" && order.driver_id) {
          const title = "💬 رسالة جديدة من العميل";
          const body = data.message.length > 70 ? data.message.slice(0, 67) + "..." : data.message;
          const link = `/delivery?tab=current&chat=${data.orderId}`;
          await supabaseAdmin.from("notifications").insert({
            user_id: order.driver_id,
            title,
            body,
            link,
          });
          await sendPushToUser(order.driver_id, {
            title,
            body,
            path: link,
            tag: `husayniya-chat-${data.orderId}`,
          });
        }
      } else if (senderRole === "store" || senderRole === "driver" || senderRole === "admin") {
        const title =
          senderRole === "store"
            ? `🏪 رسالة من ${storeRow?.name ?? "المتجر"}`
            : senderRole === "driver"
            ? "🛵 رسالة من كابتن التوصيل"
            : "رسالة من إدارة المنصة";
        const body = data.message.length > 70 ? data.message.slice(0, 67) + "..." : data.message;
        const link = `/orders?filter=active&chat=${data.orderId}`;

        await supabaseAdmin.from("notifications").insert({
          user_id: order.customer_id,
          title,
          body,
          link,
        });
        await sendPushToUser(order.customer_id, {
          title,
          body,
          path: link,
          tag: `husayniya-chat-${data.orderId}`,
        });
      }
    } catch (err) {
      console.error("Failed to send notification / push:", err);
    }

    return { ok: true, message: newMessage };
  });

/**
 * Helper to post an automatic order status update message in the chat
 * and deliver an on-screen alert + Web Push notification to the customer.
 */
export async function notifyOrderStatusUpdate(
  orderId: string,
  newStatus: string,
  extra?: { driverName?: string; note?: string; cancelledBy?: "customer" | "store" | "admin" }
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendPushToUser } = await import("@/lib/push.functions");

    const orderRes = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, store_id, driver_id, status, notes, stores(name, owner_id)")
      .eq("id", orderId)
      .maybeSingle();

    if (!orderRes.data) return;
    const order = orderRes.data;
    const storeName = (order.stores as any)?.name ?? "المتجر";
    const storeOwnerId = (order.stores as any)?.owner_id;
    const shortId = orderId.slice(0, 8);
    const cancelledBy = extra?.cancelledBy ?? "store";

    let title = "تحديث في طلبك";
    let message = "";

    switch (newStatus) {
      case "confirmed":
      case "accepted":
        title = `✅ تم قبول وتأكيد طلبك من ${storeName}`;
        message = `قام ${storeName} بتأكيد وقبول طلبك، وبدأ الاستعداد لتجهيزه.`;
        break;
      case "preparing":
        title = `🍳 تم تحضير وتجهيز طلبك في ${storeName}`;
        message = `قام ${storeName} بالانتهاء من تحضير وتجهيز طلبك بعناية، وهو جاهز لاستلام كابتن التوصيل.`;
        break;
      case "on_the_way":
        const drName = extra?.driverName ? `الكابتن ${extra.driverName}` : "كابتن التوصيل";
        title = `🛵 استلم ${drName} طلبك وهو في الطريق إليك`;
        message = `تم تسليم الطلب من ${storeName} إلى ${drName} وهو الآن في الطريق إليك! تم تحويل المحادثة إلى الكابتن.`;
        break;
      case "delivered":
        title = `🎉 تم تسليم طلبك بنجاح من ${storeName}`;
        message = `تم تسليم الطلب وتحصيله بنجاح. شكراً لطلبك من ${storeName} عبر تطبيق موجود! نرجو منك تقييم تجربتك ⭐`;
        break;
      case "cancelled":
        if (cancelledBy === "customer") {
          title = `❌ تم إلغاء الطلب #${shortId} من قِبل العميل`;
          message = extra?.note || `قام العميل بإلغاء هذا الطلب.`;
        } else if (cancelledBy === "admin") {
          title = `❌ تنبيه: تم إلغاء طلبك من قِبل إدارة المنصة`;
          message = extra?.note ? `قامت إدارة المنصة بإلغاء طلبك: ${extra.note}` : `قامت إدارة المنصة بإلغاء هذا الطلب.`;
        } else {
          title = `❌ اعتذار: تم إلغاء طلبك من قِبل ${storeName}`;
          message = extra?.note ? `قام ${storeName} بإلغاء هذا الطلب: ${extra.note}` : `نعتذر منك، قام ${storeName} بإلغاء طلبك لعدم إمكانية توفيره حالياً.`;
        }
        break;
      default:
        title = `تحديث الطلب: ${newStatus}`;
        message = `تم تحديث حالة طلبك إلى: ${newStatus}`;
        break;
    }

    const stage: "store" | "driver" = (newStatus === "on_the_way" || newStatus === "delivered") ? "driver" : "store";

    const sysMessage: ChatMessage = {
      id: crypto.randomUUID(),
      order_id: orderId,
      sender_id: "system",
      sender_role: cancelledBy === "customer" && newStatus === "cancelled" ? "customer" : "admin",
      sender_name: cancelledBy === "customer" && newStatus === "cancelled" ? "العميل" : "موجود (تحديث تلقائي)",
      message,
      created_at: new Date().toISOString(),
      stage,
    };

    // 1. Insert chat message into table
    try {
      await (supabaseAdmin.from("order_messages" as any) as any).insert({
        id: sysMessage.id,
        order_id: sysMessage.order_id,
        sender_id: sysMessage.sender_id,
        sender_role: sysMessage.sender_role,
        sender_name: sysMessage.sender_name,
        message: sysMessage.message,
        created_at: sysMessage.created_at,
        stage: sysMessage.stage,
      });
    } catch {}

    // 2. Persist in notes
    try {
      const { cleanNotes, messages } = parseMessagesFromNotes(order.notes);
      const updatedMessages = [...messages, sysMessage];
      const serialized = serializeMessagesToNotes(cleanNotes, updatedMessages);
      await supabaseAdmin.from("orders").update({ notes: serialized }).eq("id", orderId);
    } catch {}

    // 3. Routing notifications & push:
    if (newStatus === "cancelled") {
      if (cancelledBy === "customer") {
        // Customer cancelled -> Notify STORE OWNER
        if (storeOwnerId) {
          const cancelTitle = `❌ تم إلغاء الطلب #${shortId} من قِبل العميل`;
          const cancelBody = `قام العميل بإلغاء طلبه رقم #${shortId} من ${storeName}. يرجى التوقف عن تحضيره.`;
          const providerLink = `/provider?tab=orders`;

          try {
            await supabaseAdmin.from("notifications").insert({
              user_id: storeOwnerId,
              title: cancelTitle,
              body: cancelBody,
              link: providerLink,
            });
            await sendPushToUser(storeOwnerId, {
              title: cancelTitle,
              body: cancelBody,
              path: providerLink,
              tag: `husayniya-order-cancel-${orderId}`,
              requireInteraction: true,
            });
          } catch {}
        }

        // Notify assigned driver if order had a driver
        if (order.driver_id) {
          try {
            const drTitle = `❌ تم إلغاء الطلب #${shortId}`;
            const drBody = `قام العميل بإلغاء الطلب رقم #${shortId}. تم إلغاء مهمة التوصيل.`;
            const drLink = `/delivery?tab=available`;
            await supabaseAdmin.from("notifications").insert({
              user_id: order.driver_id,
              title: drTitle,
              body: drBody,
              link: drLink,
            });
            await sendPushToUser(order.driver_id, {
              title: drTitle,
              body: drBody,
              path: drLink,
              tag: `husayniya-order-cancel-dr-${orderId}`,
              requireInteraction: true,
            });
          } catch {}
        }
      } else {
        // Store or admin cancelled -> Notify CUSTOMER
        const customerCancelTitle =
          cancelledBy === "admin"
            ? "❌ تنبيه: تم إلغاء طلبك من قِبل إدارة المنصة"
            : `❌ اعتذار: تم إلغاء طلبك من قِبل ${storeName}`;
        const customerCancelBody = extra?.note
          ? (cancelledBy === "admin"
              ? `قامت إدارة المنصة بإلغاء طلبك رقم #${shortId}: ${extra.note}`
              : `نعتذر منك، قام ${storeName} بإلغاء طلبك رقم #${shortId}: ${extra.note}`)
          : (cancelledBy === "admin"
              ? `قامت إدارة المنصة بإلغاء طلبك رقم #${shortId}.`
              : `نعتذر منك، قام ${storeName} بإلغاء طلبك رقم #${shortId} لعدم إمكانية توفيره حالياً.`);
        const customerLink = `/orders?filter=cancelled&chat=${orderId}`;

        try {
          await supabaseAdmin.from("notifications").insert({
            user_id: order.customer_id,
            title: customerCancelTitle,
            body: customerCancelBody,
            link: customerLink,
          });
          await sendPushToUser(order.customer_id, {
            title: customerCancelTitle,
            body: customerCancelBody,
            path: customerLink,
            tag: `husayniya-order-cancel-cust-${orderId}`,
            requireInteraction: true,
          });
        } catch {}

        // If cancelled by admin, ALSO notify store owner to stop preparing
        if (cancelledBy === "admin" && storeOwnerId) {
          try {
            const adminCancelTitle = `❌ تم إلغاء الطلب #${shortId} من قِبل الإدارة`;
            const adminCancelBody = extra?.note
              ? `قامت إدارة المنصة بإلغاء الطلب رقم #${shortId}: ${extra.note}. يرجى التوقف عن تحضير الطلب.`
              : `قامت إدارة المنصة بإلغاء الطلب رقم #${shortId}. يرجى التوقف عن تحضير الطلب.`;
            const storePath = `/provider?tab=orders`;

            await supabaseAdmin.from("notifications").insert({
              user_id: storeOwnerId,
              title: adminCancelTitle,
              body: adminCancelBody,
              link: storePath,
            });
            await sendPushToUser(storeOwnerId, {
              title: adminCancelTitle,
              body: adminCancelBody,
              path: storePath,
              tag: `husayniya-order-cancel-admin-${orderId}`,
              requireInteraction: true,
            });
          } catch {}
        }

        if (order.driver_id) {
          try {
            const drTitle = `❌ تم إلغاء الطلب #${shortId}`;
            const drBody =
              cancelledBy === "admin"
                ? `قامت إدارة المنصة بإلغاء الطلب رقم #${shortId}. تم إلغاء مهمة التوصيل.`
                : `قام ${storeName} بإلغاء الطلب رقم #${shortId}. تم إلغاء مهمة التوصيل.`;
            const drLink = `/delivery?tab=available`;
            await supabaseAdmin.from("notifications").insert({
              user_id: order.driver_id,
              title: drTitle,
              body: drBody,
              link: drLink,
            });
            await sendPushToUser(order.driver_id, {
              title: drTitle,
              body: drBody,
              path: drLink,
              tag: `husayniya-order-cancel-dr-${orderId}`,
              requireInteraction: true,
            });
          } catch {}
        }
      }
    } else {
      // Normal progression (accepted, preparing, on_the_way, delivered) -> Notify CUSTOMER
      const link = `/orders?filter=active&chat=${orderId}`;
      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: order.customer_id,
          title,
          body: message,
          link,
        });
      } catch {}

      try {
        await sendPushToUser(order.customer_id, {
          title,
          body: message,
          path: link,
          tag: `husayniya-order-${orderId}`,
          requireInteraction: true,
        });
      } catch {}

      // If order is picked up / with driver, also notify the STORE OWNER
      if (newStatus === "on_the_way" && storeOwnerId) {
        try {
          const drLabel = extra?.driverName ? `الكابتن ${extra.driverName}` : "كابتن التوصيل";
          const stTitle = `🛵 تم استلام طلبك (#${shortId}) بواسطة ${drLabel}`;
          const stBody = `بدأ ${drLabel} توصيل الطلب رقم #${shortId} وهو الآن في الطريق للعميل.`;
          const stPath = `/provider?tab=orders&order=${orderId}`;

          await supabaseAdmin.from("notifications").insert({
            user_id: storeOwnerId,
            title: stTitle,
            body: stBody,
            link: stPath,
          });
          await sendPushToUser(storeOwnerId, {
            title: stTitle,
            body: stBody,
            path: stPath,
            tag: `husayniya-order-dr-pickup-${orderId}`,
          });
        } catch {}
      }

      // If order is delivered, also notify the STORE OWNER
      if (newStatus === "delivered" && storeOwnerId) {
        try {
          const stTitle = `🎉 تم تسليم الطلب (#${shortId}) للعميل بنجاح`;
          const stBody = `قام كابتن التوصيل بتسليم الطلب (#${shortId}) للعميل وتحصيل المبلغ بنجاح.`;
          const stPath = `/provider?tab=orders&order=${orderId}`;

          await supabaseAdmin.from("notifications").insert({
            user_id: storeOwnerId,
            title: stTitle,
            body: stBody,
            link: stPath,
          });
          await sendPushToUser(storeOwnerId, {
            title: stTitle,
            body: stBody,
            path: stPath,
            tag: `husayniya-order-delivered-${orderId}`,
          });
        } catch {}
      }

      // 1. When store accepts the order (accepted), notify active drivers that a new order is being prepared
      if (newStatus === "accepted" && !order.driver_id) {
        try {
          const activeDrivers = await supabaseAdmin
            .from("drivers")
            .select("user_id")
            .eq("is_active", true);

          if (activeDrivers.data && activeDrivers.data.length > 0) {
            const driverTitle = `🛵 طلب جديد قيد التنفيذ والتجهيز (${storeName})`;
            const driverBody = `قام ${storeName} بقبول طلب جديد وبدأ تحضيره وتجهيزه. استعد لاستلامه قريباً عبر رادار التوصيل.`;
            const driverPath = `/delivery?tab=available`;

            for (const driver of activeDrivers.data) {
              await supabaseAdmin.from("notifications").insert({
                user_id: driver.user_id,
                title: driverTitle,
                body: driverBody,
                link: driverPath,
              });
              await sendPushToUser(driver.user_id, {
                title: driverTitle,
                body: driverBody,
                path: driverPath,
                tag: `husayniya-driver-accepted-${orderId}`,
              });
            }
          }
        } catch {}
      }

      // 2. When store marks order ready (preparing), notify active drivers for instant pickup + call ringtone
      if (newStatus === "preparing" && !order.driver_id) {
        try {
          const activeDrivers = await supabaseAdmin
            .from("drivers")
            .select("user_id")
            .eq("is_active", true);

          if (activeDrivers.data && activeDrivers.data.length > 0) {
            const driverTitle = `🚨 أوردر جاهز للاستلام الآن من ${storeName}!`;
            const driverBody = `تم تجهيز الأوردر #${shortId} بالكامل في ${storeName} وهو بانتظار استلامك الآن للتوصيل.`;
            const driverPath = `/delivery?tab=available&call=${orderId}`;

            for (const driver of activeDrivers.data) {
              await supabaseAdmin.from("notifications").insert({
                user_id: driver.user_id,
                title: driverTitle,
                body: driverBody,
                link: driverPath,
              });
              await sendPushToUser(driver.user_id, {
                title: driverTitle,
                body: driverBody,
                path: driverPath,
                tag: `husayniya-driver-ready-${orderId}`,
                requireInteraction: true,
              });
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    console.error("notifyOrderStatusUpdate failed:", e);
  }
}

export const readOrderChatNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Mark in-app notifications as read
    await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", context.userId)
      .ilike("link", `%chat=${data.orderId}%`);

    // 2. Mark incoming messages in order notes as read
    try {
      const orderRes = await supabaseAdmin
        .from("orders")
        .select("notes")
        .eq("id", data.orderId)
        .maybeSingle();

      if (orderRes.data?.notes) {
        const { cleanNotes, messages } = parseMessagesFromNotes(orderRes.data.notes);
        let changed = false;
        const nowIso = new Date().toISOString();
        const updated = messages.map((m) => {
          if (m.sender_id !== context.userId && !m.is_read) {
            changed = true;
            return { ...m, is_read: true, read_at: nowIso };
          }
          return m;
        });

        if (changed) {
          const serialized = serializeMessagesToNotes(cleanNotes, updated);
          await supabaseAdmin.from("orders").update({ notes: serialized }).eq("id", data.orderId);
        }
      }
    } catch (e) {
      console.error("Failed to mark notes messages as read:", e);
    }

    // 3. Mark in order_messages table if exists
    try {
      await (supabaseAdmin.from("order_messages" as any) as any)
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("order_id", data.orderId)
        .neq("sender_id", context.userId);
    } catch {}

    return { success: true };
  });
