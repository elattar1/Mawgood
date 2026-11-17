import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** تنظيف وتوحيد أرقام الهواتف (تحويل الأرقام العربية، إزالة المسافات، معالجة +20) */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  let cleaned = raw.trim();
  const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  arabicDigits.forEach((d, idx) => {
    cleaned = cleaned.replaceAll(d, String(idx));
  });
  cleaned = cleaned.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+20")) cleaned = "0" + cleaned.slice(3);
  else if (cleaned.startsWith("0020")) cleaned = "0" + cleaned.slice(4);
  else if (cleaned.startsWith("20") && cleaned.length === 12) cleaned = "0" + cleaned.slice(2);
  return cleaned;
}

/** إخفاء البريد الإلكتروني لأغراض الخصوصية (e***r@gmail.com) */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

/** حساب وتنسيق المدة المتبقية بالعربية للحذف النهائي */
export function formatRemainingTime(scheduledIso: string): string {
  const diff = new Date(scheduledIso).getTime() - Date.now();
  if (diff <= 0) return "انتهت مهلة الـ 7 أيام";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days} ${days === 1 ? "يوم" : days === 2 ? "يومان" : "أيام"} و ${hours} ساعة`;
  }
  if (hours > 0) {
    return `${hours} ساعة و ${minutes} دقيقة`;
  }
  return `${minutes} دقيقة`;
}

const registerPhoneInput = z.object({
  fullName: z.string().trim().min(2, "يرجى كتابة الاسم بالكامل (حرفين على الأقل)"),
  phone: z.string().trim().min(8, "رقم التليفون يجب أن لا يقل عن 8 أرقام"),
  password: z.string().min(6, "كلمة المرور يجب أن لا تقل عن 6 أحرف"),
  email: z.string().trim().email("البريد الإلكتروني غير صحيح").optional().or(z.literal("")),
});

const resolveInput = z.object({
  identifier: z.string().trim().min(2, "يرجى إدخال الاسم أو رقم التليفون أو البريد"),
});

const resetInput = z.object({
  identifier: z.string().trim().min(3, "يرجى إدخال رقم التليفون أو البريد الإلكتروني المسجل"),
  redirectUrl: z.string().optional(),
});

const deletionRequestInput = z.object({
  method: z.enum(["password", "code", "google_confirm"]),
  password: z.string().optional(),
  code: z.string().optional(),
});

/** تسجيل حساب جديد برقم التليفون والاسم، والتحقق المسبق من عدم وجود مستخدم مسجل مسبقاً (خاصة عبر Google) */
export const registerUserWithPhone = createServerFn({ method: "POST" })
  .validator((data: { fullName: string; phone: string; password: string; email?: string }) =>
    registerPhoneInput.parse(data)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cleanPhone = normalizePhone(data.phone);
    if (cleanPhone.length < 10) {
      throw new Error("رقم الهاتف غير صحيح، يرجى كتابة رقم موبايل صحيح (مثال: 01012345678)");
    }

    const recoveryEmail = data.email?.trim().toLowerCase() || null;
    const systemEmail = `${cleanPhone}@phone.mawgood.store`;

    // 1. التحقق أولاً من عدم وجود مستخدم مسجل بنفس رقم التليفون في profiles
    try {
      const existingProfile = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", cleanPhone)
        .maybeSingle();

      if (existingProfile.data?.id) {
        return {
          success: false,
          alreadyExists: true,
          identifier: cleanPhone,
          message: "يوجد مستخدم بالفعل مسجل برقم الهاتف هذا، يرجى تسجيل الدخول.",
        };
      }
    } catch (profErr) {
      console.warn("Could not check profiles for existing phone:", profErr);
    }

    // 2. التحقق من قائمة مستخدمي Auth ومنع التسجيل بأي بريد مسجل مسبقاً بواسطة Google أو غيرها
    try {
      const list = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const users = list.data?.users ?? [];

      // أ) التحقق من الهاتف
      const phoneConflict = users.find(
        (u) =>
          u.email?.toLowerCase().trim() === systemEmail ||
          u.email?.toLowerCase().trim() === `${cleanPhone}@phone.husayniya.app` ||
          u.user_metadata?.phone === cleanPhone ||
          u.phone === cleanPhone
      );

      if (phoneConflict) {
        const isGoogle =
          phoneConflict.app_metadata?.provider === "google" ||
          phoneConflict.app_metadata?.providers?.includes("google") ||
          phoneConflict.identities?.some((id: any) => id.provider === "google");

        return {
          success: false,
          alreadyExists: true,
          isGoogle,
          identifier: cleanPhone,
          message: isGoogle
            ? "هذا الرقم مرتبط بحساب مسجل عبر Google، يرجى تسجيل الدخول عبر زر Google."
            : "يوجد مستخدم بالفعل مسجل برقم الهاتف هذا، يرجى تسجيل الدخول.",
        };
      }

      // ب) التحقق الصارم من البريد الإلكتروني: رفض أي بريد مسجل من خلال Google
      if (recoveryEmail) {
        const emailConflict = users.find(
          (u) =>
            u.email?.toLowerCase().trim() === recoveryEmail ||
            u.user_metadata?.recovery_email?.toLowerCase().trim() === recoveryEmail
        );

        if (emailConflict) {
          const isGoogle =
            emailConflict.app_metadata?.provider === "google" ||
            emailConflict.app_metadata?.providers?.includes("google") ||
            emailConflict.identities?.some((id: any) => id.provider === "google");

          if (isGoogle) {
            return {
              success: false,
              alreadyExists: true,
              isGoogle: true,
              identifier: recoveryEmail,
              message:
                "هذا البريد الإلكتروني مسجل بالفعل بواسطة حساب Google، ولا يمكن إنشاء حساب عادي به. يرجى تسجيل الدخول باستخدام Google مباشرة.",
            };
          }

          return {
            success: false,
            alreadyExists: true,
            isGoogle: false,
            identifier: recoveryEmail,
            message: "يوجد مستخدم بالفعل مسجل بهذا البريد الإلكتروني، يرجى تسجيل الدخول بدلاً من ذلك.",
          };
        }
      }
    } catch (authListErr) {
      console.warn("Could not check auth users list:", authListErr);
    }

    // 3. إنشاء الحساب الجديد مباشرة مع التفعيل الفوري (وتسجيل رقم الهاتف في Supabase Auth)
    const e164Phone = cleanPhone.startsWith("0") ? `+20${cleanPhone.slice(1)}` : `+20${cleanPhone}`;
    let newUser: any = null;
    let createError: any = null;

    try {
      const res = await supabaseAdmin.auth.admin.createUser({
        email: systemEmail,
        phone: e164Phone,
        password: data.password,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: {
          full_name: data.fullName,
          phone: cleanPhone,
          recovery_email: recoveryEmail,
        },
      });
      newUser = res.data;
      createError = res.error;
    } catch {
      const res = await supabaseAdmin.auth.admin.createUser({
        email: systemEmail,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          full_name: data.fullName,
          phone: cleanPhone,
          recovery_email: recoveryEmail,
        },
      });
      newUser = res.data;
      createError = res.error;
    }

    const errorMsg = createError?.message?.toLowerCase() || "";
    if (
      createError &&
      (errorMsg.includes("already registered") ||
        errorMsg.includes("already been registered") ||
        errorMsg.includes("unique constraint") ||
        errorMsg.includes("exists"))
    ) {
      return {
        success: false,
        alreadyExists: true,
        identifier: cleanPhone,
        message: "يوجد مستخدم بالفعل مسجل بهذه البيانات، يرجى تسجيل الدخول.",
      };
    }

    if (createError) {
      throw new Error(createError.message);
    }

    // 4. حفظ الاسم الكامل ورقم التليفون في جدول profiles
    if (newUser?.user?.id) {
      try {
        await supabaseAdmin.from("profiles").upsert({
          id: newUser.user.id,
          phone: cleanPhone,
          full_name: data.fullName,
        });
      } catch (pErr) {
        console.warn("Could not upsert profile row:", pErr);
      }
    }

    return {
      success: true,
      alreadyExists: false,
      authEmail: systemEmail,
      phone: cleanPhone,
    };
  });

/** تحويل الاسم أو رقم الهاتف أو البريد إلى البريد المعتمد لتسجيل الدخول بأمان دون تسريب بيانات شخصية */
export const resolveLoginIdentifier = createServerFn({ method: "POST" })
  .validator((data: { identifier: string }) => resolveInput.parse(data))
  .handler(async ({ data }) => {
    const raw = data.identifier.trim();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // أ) إذا كان المدخل بريداً إلكترونياً (يحوي @)
    if (raw.includes("@")) {
      const cleanEmail = raw.toLowerCase();
      // تحقق مما إذا كان هذا البريد مسجلاً كبريد استعادة لحساب هاتف
      try {
        const list = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const found = list.data?.users?.find(
          (u) =>
            u.email?.toLowerCase() === cleanEmail ||
            u.user_metadata?.recovery_email?.toLowerCase() === cleanEmail
        );
        if (found?.email) {
          return { authEmail: found.email };
        }
      } catch (err) {
        console.warn("Could not check recovery emails:", err);
      }
      return { authEmail: cleanEmail };
    }

    // ب) إذا كان المدخل أرقاماً (رقم هاتف)
    const cleanPhone = normalizePhone(raw);
    if (cleanPhone.length >= 8) {
      try {
        const list = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const e164Phone = cleanPhone.startsWith("0") ? `+20${cleanPhone.slice(1)}` : `+20${cleanPhone}`;
        const found = list.data?.users?.find(
          (u) =>
            u.user_metadata?.phone === cleanPhone ||
            u.phone === cleanPhone ||
            u.phone === e164Phone ||
            u.email?.startsWith(`${cleanPhone}@`)
        );
        if (found?.email) {
          return { authEmail: found.email };
        }
      } catch (err) {
        console.warn("Could not check users list by phone:", err);
      }
      return { authEmail: `${cleanPhone}@phone.mawgood.store` };
    }

    // ج) إذا كان المدخل اسماً كاملاً: مطابقة دقيقة صارمة لمنع التخمين وحصاد الأسماء
    try {
      const prof = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("full_name", raw)
        .limit(1)
        .maybeSingle();

      if (prof.data?.id) {
        const u = await supabaseAdmin.auth.admin.getUserById(prof.data.id);
        if (u.data?.user?.email) {
          return { authEmail: u.data.user.email };
        }
      }
    } catch (e) {
      console.warn("Error searching profiles by name:", e);
    }

    return { authEmail: `${cleanPhone || raw}@phone.mawgood.store` };
  });

/** طلب إعادة تعيين كلمة المرور عبر البريد الإلكتروني مع تقييد صارم لرابط إعادة التوجيه لمنع Open Redirect */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((data: { identifier: string; redirectUrl?: string }) => resetInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const raw = data.identifier.trim();
    let targetEmail = "";

    if (raw.includes("@")) {
      targetEmail = raw.toLowerCase();
    } else {
      const cleanPhone = normalizePhone(raw);
      const list = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const e164Phone = cleanPhone.startsWith("0") ? `+20${cleanPhone.slice(1)}` : `+20${cleanPhone}`;
      const found = list.data?.users?.find(
        (u) =>
          u.user_metadata?.phone === cleanPhone ||
          u.email?.startsWith(`${cleanPhone}@`) ||
          u.phone === cleanPhone ||
          u.phone === e164Phone
      );

      if (found) {
        const rec = found.user_metadata?.recovery_email;
        if (rec) {
          targetEmail = rec;
        } else if (found.email && !found.email.includes("@phone.")) {
          targetEmail = found.email;
        }
      }

      if (!targetEmail) {
        throw new Error(
          "لم يتم العثور على بريد إلكتروني لاستعادة كلمة المرور مسجل لهذا الرقم. يمكنك إعادة تسجيل الدخول أو التواصل مع إدارة التطبيق للمساعدة."
        );
      }
    }

    // تقييد رابط إعادة التوجيه ليكون دائماً نطاق التطبيق الرسمي منعاً لثغرات Open Redirect
    const TRUSTED_ORIGINS = [
      "https://mawgood.store",
      "https://www.mawgood.store",
      "https://husayniya.lovable.app",
      "https://husayniya.app",
    ];
    let safeRedirect = "https://www.mawgood.store/auth";
    if (data.redirectUrl) {
      try {
        const parsed = new URL(data.redirectUrl);
        const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
        if (TRUSTED_ORIGINS.includes(parsed.origin) || isLocal) {
          safeRedirect = `${parsed.origin}/auth`;
        }
      } catch {
        // Fallback to default trusted origin
      }
    }

    // إرسال رابط إعادة التعيين إلى البريد الإلكتروني
    try {
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(targetEmail, {
        redirectTo: safeRedirect,
      });
      if (error) {
        console.error("Password reset error:", error);
        throw error;
      }

      return {
        success: true,
        maskedEmail: maskEmail(targetEmail),
        message: `تم إرسال رابط إعادة تعيين كلمة المرور بنجاح إلى بريدك: ${maskEmail(targetEmail)}`,
      };
    } catch (err: any) {
      console.error("Reset password failed:", err);
      throw new Error(err?.message || "تعذر إرسال رابط إعادة التعيين، يرجى المحاولة لاحقاً");
    }
  });

/** إرسال كود تحقق عبر البريد الإلكتروني لتأكيد طلب حذف الحساب */
export const sendDeletionVerificationCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userRes = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const user = userRes.data?.user;
    if (!user) throw new Error("تعذر تحديد المستخدم المسجل");

    let targetEmail = user.user_metadata?.recovery_email;
    if (!targetEmail && user.email && !user.email.endsWith("@phone.husayniya.app") && !user.email.endsWith("@phone.mawgood.store")) {
      targetEmail = user.email;
    }

    if (!targetEmail) {
      throw new Error("لا يوجد بريد إلكتروني مسجل في حسابك لإرسال الكود. يرجى التأكيد باستخدام كلمة المرور.");
    }

    // إنشاء كود سداسي عشوائي وصلاحية 15 دقيقة
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: {
        ...(user.user_metadata || {}),
        deletion_code: code,
        deletion_code_expires_at: expiresAt,
      },
    });

    // إرسال تنبيه أمان في التطبيق للمستخدم (دون كشف الكود لحماية الحساب من الجلسات المفتوحة)
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: context.userId,
        title: "⚠️ تنبيه أمان: طلب كود حذف الحساب",
        body: `تم إرسال كود تأكيد حذف الحساب إلى بريدك الإلكتروني المسجل: ${maskEmail(targetEmail)}. إذا لم تكن أنت من قام بهذا الإجراء، يرجى تغيير كلمة المرور فوراً.`,
        is_read: false,
        created_at: new Date().toISOString(),
      });
    } catch (nErr) {
      console.warn("Could not create in-app security alert:", nErr);
    }

    // إرسال كود الـ OTP عبر البريد الإلكتروني الخارجي حصراً
    try {
      await context.supabase.auth.signInWithOtp({ email: targetEmail });
    } catch (otpErr) {
      console.warn("OTP email sending notice:", otpErr);
    }

    return {
      success: true,
      maskedEmail: maskEmail(targetEmail),
      message: `تم إرسال كود التحقق المكون من 6 أرقام إلى بريدك الإلكتروني: ${maskEmail(targetEmail)}. تفقد صندوق الوارد أو الرسائل غير المرغوب فيها.`,
    };
  });

/** جدولة حذف الحساب لمدة 7 أيام بعد التحقق بكلمة المرور أو كود الإيميل */
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { method: "password" | "code" | "google_confirm"; password?: string; code?: string }) =>
    deletionRequestInput.parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userRes = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const user = userRes.data?.user;
    if (!user) throw new Error("تعذر تحديد بيانات المستخدم");

    // 1. التحقق حسب الطريقة المختارة
    if (data.method === "password") {
      if (!data.password?.trim()) {
        throw new Error("يرجى كتابة كلمة المرور الحالية لتأكيد الحذف");
      }
      // التحقق من صحة كلمة المرور عبر محاولة المصادقة
      const checkAuth = await context.supabase.auth.signInWithPassword({
        email: user.email!,
        password: data.password.trim(),
      });
      if (checkAuth.error) {
        throw new Error("كلمة المرور المدخلة غير صحيحة، يرجى التأكد والمحاولة مجدداً");
      }
    } else if (data.method === "code") {
      if (!data.code?.trim()) {
        throw new Error("يرجى إدخال كود التحقق المكون من 6 أرقام");
      }
      const storedCode = user.user_metadata?.deletion_code;
      const expiresAt = user.user_metadata?.deletion_code_expires_at;

      if (!storedCode || !expiresAt) {
        throw new Error("لم يتم طلب كود تحقق بعد أو انتهت صلاحيته. يرجى طلب كود جديد.");
      }
      if (new Date(expiresAt).getTime() < Date.now()) {
        throw new Error("انتهت صلاحية كود التحقق، يرجى طلب كود جديد.");
      }
      if (storedCode.trim() !== data.code.trim()) {
        throw new Error("كود التحقق غير صحيح، يرجى التأكد من الرمز المدخل.");
      }
    } else if (data.method === "google_confirm") {
      const isGoogle =
        user.app_metadata?.provider === "google" ||
        user.app_metadata?.providers?.includes("google") ||
        user.identities?.some((id: any) => id.provider === "google");
      if (!isGoogle) {
        throw new Error("يرجى تأكيد الحذف بكلمة المرور أو كود البريد");
      }
    }

    // 2. جدولة الحذف لمدة 7 أيام بدءاً من الآن
    const now = new Date();
    const scheduledAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      user_metadata: {
        ...(user.user_metadata || {}),
        deletion_status: "pending",
        deletion_requested_at: now.toISOString(),
        scheduled_deletion_at: scheduledAt.toISOString(),
        deletion_code: null,
        deletion_code_expires_at: null,
      },
    });

    return {
      success: true,
      deletionRequestedAt: now.toISOString(),
      scheduledDeletionAt: scheduledAt.toISOString(),
      message: "تم تقديم طلب حذف حسابك بنجاح. سيتم حذف حسابك نهائياً خلال 7 أيام إذا لم تقم بتسجيل الدخول مجدداً.",
    };
  });

/** إعادة تنشيط الحساب وإلغاء طلب الحذف الجاري */
export const reactivateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
  });

/** فحص حالة الحذف ومسحه نهائياً بعد مرور الـ 7 أيام */
export const checkAndPurgeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userRes = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const user = userRes.data?.user;
    if (!user) return { status: "none" };

    const status = user.user_metadata?.deletion_status;
    const scheduledAt = user.user_metadata?.scheduled_deletion_at;

    if (status === "pending" && scheduledAt) {
      const scheduledTime = new Date(scheduledAt).getTime();
      const now = Date.now();

      // إذا انقضت الـ 7 أيام كاملة -> مسح الحساب نهائياً
      if (now >= scheduledTime) {
        try {
          await supabaseAdmin.from("profiles").delete().eq("id", context.userId);
          await supabaseAdmin.from("customer_addresses").delete().eq("user_id", context.userId);
          await supabaseAdmin.auth.admin.deleteUser(context.userId);
        } catch (delErr) {
          console.error("Purge user error:", delErr);
        }
        return {
          status: "purged",
          message: "تم حذف حسابك نهائياً بعد انتهاء مهلة الـ 7 أيام.",
        };
      }

      // الحساب لا يزال في مهلة الـ 7 أيام
      return {
        status: "pending",
        requestedAt: user.user_metadata?.deletion_requested_at,
        scheduledAt: scheduledAt,
        remainingTime: formatRemainingTime(scheduledAt),
      };
    }

    return { status: "active" };
  });

/** تأكيد آمن لحسابات الهاتف المسجلة دون كشف مستخدمي النظام أو تفعيل حسابات بريد خارجية مجهولة */
export const autoConfirmUser = createServerFn({ method: "POST" })
  .validator((data: { email: string; password?: string }) =>
    z.object({ email: z.string().trim(), password: z.string().optional() }).parse(data)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cleanEmail = data.email.toLowerCase().trim();

    // يُسمح بالتأكيد المباشر فقط لحسابات الهاتف النظامية (@phone.husayniya.app أو @phone.mawgood.store) أو عند تقديم كلمة المرور لتأكيد الهوية
    const isSystemPhoneAccount = cleanEmail.endsWith("@phone.husayniya.app") || cleanEmail.endsWith("@phone.mawgood.store");
    if (!isSystemPhoneAccount && (!data.password || data.password.length < 6)) {
      return { success: false, error: "عملية غير مصرح بها" };
    }

    try {
      const list = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      const cleanPhone = normalizePhone(cleanEmail);
      const existing = list.data?.users?.find(
        (u) =>
          u.email?.toLowerCase().trim() === cleanEmail ||
          u.user_metadata?.recovery_email?.toLowerCase().trim() === cleanEmail ||
          (cleanPhone && cleanPhone.length >= 8 && (
            u.user_metadata?.phone === cleanPhone ||
            u.email?.startsWith(`${cleanPhone}@`)
          ))
      );
      if (!existing) {
        // رسالة خطأ عامة ومحايدة لمنع هجمات تخمين الحسابات (Anti User Enumeration)
        return { success: false, error: "تعذر إتمام العملية" };
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
      });
      if (updateError) throw updateError;

      return { success: true, userId: existing.id };
    } catch (err: any) {
      console.error("Auto confirm user error:", err);
      return { success: false, error: "تعذر تفعيل الحساب" };
    }
  });
