// COPIES of getOrderChat, sendOrderChatMessage (chat.functions.ts) and getDriverLocation (delivery.functions.ts)
// handler bodies, for the native iOS endpoints only. Additive: the website server functions are NOT modified.
// If those handlers change, these copies must be updated to match.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

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

function parseMessagesFromNotes(notes: string | null | undefined): {
  cleanNotes: string;
  messages: ChatMessage[];
} {
  if (!notes) return { cleanNotes: "", messages: [] };
  const match = notes.match(/<!-- CHAT_V1: ([\s\S]*?) -->/);
  if (!match) return { cleanNotes: notes.trim(), messages: [] };
  try {
    const parsed = JSON.parse(match[1] ?? "[]");
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

export async function orderChatInfoCore(params: {
  data: { orderId: string };
  supabase: Db;
  userId: string;
}): Promise<OrderChatInfo> {
  const { data, supabase, userId } = params;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const orderRes = await supabaseAdmin
    .from("orders")
    .select(
      "id, customer_id, driver_id, store_id, status, phone, address, notes, total, subtotal, delivery_fee, picked_up_at, created_at, stores(id, name, owner_id, phone, category), order_items(name, qty, price)",
    )
    .eq("id", data.orderId)
    .maybeSingle();

  if (orderRes.error || !orderRes.data) {
    throw new Error("لم يتم العثور على هذا الطلب");
  }

  const order = orderRes.data;
  const storeRow = order.stores as any;

  // Check authorization: customer, assigned driver, store owner, or platform admin
  const isAdmin = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const isCustomer = userId === order.customer_id;
  const isDriver = userId === order.driver_id;
  const isStoreOwner = storeRow && storeRow.owner_id === userId;

  if (!isCustomer && !isDriver && !isStoreOwner && !isAdmin.data) {
    throw new Error("غير مصرح لك بالاطلاع على محادثة هذا الطلب");
  }

  // Determine current chat stage:
  // If order is with driver (status: "on_the_way" or "delivered" or picked up or driver assigned) -> "driver"
  // Otherwise (placed, confirmed, preparing without driver) -> "store"
  const isDriverStage = Boolean(
    order.driver_id ||
    order.status === "on_the_way" ||
    order.status === "delivered" ||
    order.picked_up_at,
  );
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
          stage:
            m.stage ||
            (m.sender_role === "driver"
              ? "driver"
              : m.sender_role === "store"
                ? "store"
                : undefined),
          is_read: existing
            ? existing.is_read
            : m.is_read !== undefined
              ? Boolean(m.is_read)
              : Boolean(m.read_at),
          read_at: existing ? existing.read_at : m.read_at || null,
        } as ChatMessage);
      }
    }
  } catch (e) {
    console.warn("Could not read order_messages table, relying on order.notes:", e);
  }

  const rawMessages: ChatMessage[] = Array.from(messagesMap.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
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
    } else if (m.sender_id !== userId && m.sender_id !== "system" && !m.is_read) {
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
        .neq("sender_id", userId);
    } catch {}

    try {
      void supabaseAdmin
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .ilike("link", `%chat=${data.orderId}%`);
    } catch {}
  }

  // Separation of chats:
  // 1. Driver gets a fresh chat (only driver-phase messages, no private store/kitchen chat)
  // 2. Store only sees store-phase messages (before delivery takeover)
  // 3. Customer sees continuous thread with transition note
  let visibleMessages: ChatMessage[] = [];
  if (myRole === "driver") {
    visibleMessages = rawMessages.filter((m) => m.stage === "driver" || m.sender_role === "driver");
  } else if (myRole === "store") {
    visibleMessages = rawMessages.filter(
      (m) =>
        (m.stage === "store" ||
          m.sender_role === "store" ||
          (!m.stage && m.sender_role !== "driver")) &&
        m.stage !== "driver" &&
        m.sender_role !== "driver",
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
    subtotal: Number(order.subtotal ?? Number(order.total || 0) - Number(order.delivery_fee || 0)),
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
}

export async function orderChatSendCore(params: {
  data: { orderId: string; message: string };
  supabase: Db;
  userId: string;
}) {
  const { data, supabase, userId } = params;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const orderRes = await supabaseAdmin
    .from("orders")
    .select(
      "id, customer_id, driver_id, store_id, status, notes, picked_up_at, stores(id, name, owner_id, phone)",
    )
    .eq("id", data.orderId)
    .maybeSingle();

  if (orderRes.error || !orderRes.data) {
    throw new Error("الطلب غير موجود");
  }

  const order = orderRes.data;
  const storeRow = order.stores as any;

  // Check authorization
  const isAdmin = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  const isCustomer = userId === order.customer_id;
  const isDriver = userId === order.driver_id;
  const isStoreOwner = storeRow && storeRow.owner_id === userId;

  if (!isCustomer && !isDriver && !isStoreOwner && !isAdmin.data) {
    throw new Error("غير مصرح لك بإرسال رسائل في هذا الطلب");
  }

  // Auto-close chat once order is delivered, completed, or cancelled
  if (
    order.status === "delivered" ||
    order.status === "completed" ||
    order.status === "cancelled"
  ) {
    throw new Error("تم إغلاق المحادثة تلقائياً لاكتمال تسليم الطلب");
  }

  const isDriverStage = Boolean(
    order.driver_id ||
    order.status === "on_the_way" ||
    order.status === "delivered" ||
    order.picked_up_at,
  );
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
    const dr = await supabaseAdmin
      .from("drivers")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();
    senderName = dr.data?.full_name ? `الكابتن ${dr.data.full_name}` : "كابتن التوصيل";
  } else if (senderRole === "customer") {
    const pr = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    senderName = pr.data?.full_name || "العميل";
  } else {
    senderName = "إدارة موجود";
  }

  const newMessage: ChatMessage = {
    id: crypto.randomUUID(),
    order_id: data.orderId,
    sender_id: userId,
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
    const freshOrder = await supabaseAdmin
      .from("orders")
      .select("notes")
      .eq("id", data.orderId)
      .maybeSingle();
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
}

export async function driverLocationCore(params: {
  data: { orderId: string };
  supabase: Db;
  userId: string;
}) {
  const { data, supabase, userId } = params;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const orderRes = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, customer_id, driver_id, notes, address, store_id, stores(name, address, phone)",
    )
    .eq("id", data.orderId)
    .maybeSingle();

  if (!orderRes.data) throw new Error("الطلب غير موجود");

  const isCustomer = orderRes.data.customer_id === userId;
  const isDriver = orderRes.data.driver_id === userId;

  if (!isCustomer && !isDriver) {
    const roleCheck = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!roleCheck.data) {
      throw new Error("غير مصرح لك بتتبع موقع هذا الطلب");
    }
  }

  // Fetch driver details if assigned
  let driverInfo: { name: string; phone: string | null } | null = null;
  if (orderRes.data.driver_id) {
    const dr = await supabaseAdmin
      .from("drivers")
      .select("full_name, phone")
      .eq("user_id", orderRes.data.driver_id)
      .maybeSingle();
    if (dr.data) {
      driverInfo = {
        name: dr.data.full_name,
        phone: dr.data.phone || null,
      };
    }
  }

  const { extractDriverCoordinates, extractCoordinates } = await import("@/lib/map-utils");
  const driverCoords = extractDriverCoordinates(orderRes.data.notes);
  const customerCoords = extractCoordinates(orderRes.data.address);
  const storeAddress = (orderRes.data.stores as any)?.address;
  const storeCoords = extractCoordinates(storeAddress);

  return {
    orderId: data.orderId,
    status: orderRes.data.status,
    driverCoords,
    customerCoords,
    storeCoords,
    customerAddress: orderRes.data.address,
    storeName: (orderRes.data.stores as any)?.name ?? "المتجر",
    storePhone: (orderRes.data.stores as any)?.phone ?? null,
    driverInfo,
  };
}
