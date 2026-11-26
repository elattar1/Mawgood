// COPIES of the account-deletion handler bodies in auth.functions.ts (reactivate; status is a read-only variant). Deletion REQUEST handlers are intentionally not copied,
// additive, for the native iOS endpoints only. The website handlers are NOT modified. Keep them in sync if those change.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { formatRemainingTime } from "@/lib/auth.functions";

type Ctx = { userId: string; supabase: SupabaseClient<Database> };

export async function reactivateCore({ context }: { context: Ctx }) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userRes = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const user = userRes.data?.user;
    if (!user) throw new Error("تعذر تحديد بيانات المستخدم");

    const updatedMetadata = {
      ...(user.user_metadata || {}),
      deletion_status: "active",
      deletion_requested_at: null,
      scheduled_deletion_at: null,
      deletion_code: null,
      deletion_code_expires_at: null,
    };

    const updateRes = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: updatedMetadata,
    });
    if (updateRes.error) throw new Error(updateRes.error.message);

    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: context.userId,
        title: "تم إعادة تنشيط حسابك بنجاح ✅",
        body: "تم إلغاء طلب حذف الحساب بنجاح، ويمكنك الآن مواصلة استخدام تطبيق موجود بشكل طبيعي.",
        is_read: false,
      });
    } catch (nErr) {
      console.warn("Could not insert reactivation notification:", nErr);
    }

    return {
      success: true,
      message: "تم إلغاء طلب الحذف وإعادة تنشيط حسابك بنجاح! يسعدنا استمرارك معنا في تطبيق موجود.",
    };
}

// READ-ONLY status check. The website handler also purges the account here once the 7 days pass; this copy never deletes anything.
// "due" means the grace period is over: a permanent purge is a separate, explicitly authorised action that is NOT implemented here.
export async function purgeCheckCore({ context }: { context: Ctx }) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userRes = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const user = userRes.data?.user;
    if (!user) return { status: "none" };
    const status = user.user_metadata?.["deletion_status"];
    const scheduledAt = user.user_metadata?.["scheduled_deletion_at"];
    if (status === "pending" && scheduledAt) {
      if (Date.now() >= new Date(scheduledAt).getTime()) return { status: "due", scheduledAt };
      return {
        status: "pending",
        requestedAt: user.user_metadata?.["deletion_requested_at"],
        scheduledAt,
        remainingTime: formatRemainingTime(scheduledAt),
      };
    }
    return { status: "active" };
}
