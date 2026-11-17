/**
 * نظام مواعيد وساعات العمل التلقائية للمتاجر في خدمات الحسينية
 * يحسب حالة فتح وإغلاق المتجر بناءً على التوقيت المحلي لجمهورية مصر العربية (توقيت القاهرة)
 */

export interface StoreHoursConfig {
  openTime: string; // صيغة 24 ساعة (مثال: "10:00")
  closeTime: string; // صيغة 24 ساعة (مثال: "02:00")
  is24Hours?: boolean;
}

export interface StoreWorkingStatus {
  isOpen: boolean;
  reason?: string;
  formattedHours?: string;
  nextOpenText?: string;
}

/**
 * المواعيد الافتراضية الذكية حسب نشاط المتجر في الحسينية
 */
export const DEFAULT_HOURS_BY_CATEGORY: Record<string, StoreHoursConfig> = {
  pharmacies: { openTime: "08:00", closeTime: "02:00", is24Hours: true },
  supermarkets: { openTime: "08:00", closeTime: "01:30" },
  restaurants: { openTime: "10:00", closeTime: "02:30" },
  doctors: { openTime: "12:00", closeTime: "22:00" },
  maintenance: { openTime: "09:00", closeTime: "21:00" },
  gifts: { openTime: "10:00", closeTime: "23:30" },
  home: { openTime: "09:00", closeTime: "21:00" },
};

/**
 * استخراج ساعات العمل المحددة من بيانات المتجر
 * تبحث عن علامة [hours:HH:mm-HH:mm] داخل الوصف، أو تعتمد على الفئة كافتراضي
 */
export function parseStoreHours(store: { description?: string | null; category?: string | null }): StoreHoursConfig {
  const desc = store.description || "";
  const match = desc.match(/\[hours:(\d{1,2}:\d{2})-(\d{1,2}:\d{2})\]/);
  if (match) {
    const open = match[1].padStart(5, "0");
    const close = match[2].padStart(5, "0");
    return {
      openTime: open,
      closeTime: close,
      is24Hours: open === close,
    };
  }

  // إذا كان صيدلية 24 ساعة مكتوب في الوصف
  if (desc.includes("24 ساعة") || desc.includes("طوال اليوم")) {
    return { openTime: "00:00", closeTime: "00:00", is24Hours: true };
  }

  const cat = store.category || "restaurants";
  return DEFAULT_HOURS_BY_CATEGORY[cat] || { openTime: "09:00", closeTime: "00:00" };
}

/**
 * تنظيف وصف المتجر لإزالة تاج ساعات العمل البرمجي عند عرضه للمستخدم
 */
export function cleanStoreDescription(desc?: string | null): string {
  if (!desc) return "";
  return desc.replace(/\[hours:\d{1,2}:\d{2}-\d{1,2}:\d{2}\]/g, "").trim();
}

/**
 * دمج ساعات العمل داخل وصف المتجر لحفظها في قاعدة البيانات
 */
export function embedStoreHoursInDescription(rawDescription: string, openTime: string, closeTime: string): string {
  const clean = cleanStoreDescription(rawDescription);
  if (!openTime || !closeTime || (openTime === "00:00" && closeTime === "00:00")) {
    return clean;
  }
  return `${clean} [hours:${openTime}-${closeTime}]`.trim();
}

/**
 * تحويل وقت 24 ساعة (مثال: 14:30) إلى نص عربي فخم (02:30 م أو 10:00 ص)
 */
export function formatArabicTime(time24: string): string {
  if (!time24) return "";
  const [hStr, mStr] = time24.split(":");
  const hour = parseInt(hStr, 10);
  const min = parseInt(mStr || "0", 10);
  const minText = `:${String(min).padStart(2, "0")}`;

  if (hour === 0 && min === 0) return "12:00 منتصف الليل";
  if (hour === 12 && min === 0) return "12:00 ظهراً";
  if (hour === 0) return `12${minText} ص`;
  if (hour < 12) return `${String(hour).padStart(2, "0")}${minText} ص`;
  const pmHour = hour === 12 ? 12 : hour - 12;
  return `${String(pmHour).padStart(2, "0")}${minText} م`;
}

/**
 * حساب الوقت الحالي بدقة بتوقيت مصر (UTC+2)
 */
export function getCairoNowMinutes(now = new Date()): { minutes: number; cairoDate: Date } {
  // توقيت القاهرة قياسياً UTC+2 (أو UTC+3 في التوقيت الصيفي)
  const cairoTimeStr = now.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo", hour12: false });
  const parts = cairoTimeStr.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return {
    minutes: h * 60 + m,
    cairoDate: now,
  };
}

/**
 * الفحص الذكي: هل المتجر مفتوح حالياً لاستقبال الطلبات؟
 */
export function isStoreCurrentlyOpen(
  store: {
    is_open?: boolean | null;
    is_active?: boolean | null;
    description?: string | null;
    category?: string | null;
  },
  now = new Date()
): StoreWorkingStatus {
  // 1. إذا كان المتجر معطلاً من الإدارة نهائياً
  if (store.is_active === false) {
    return {
      isOpen: false,
      reason: "المتجر غير متاح حالياً على المنصة",
    };
  }

  // 2. إذا كان المتجر مغلقاً يدوياً من لوحة التاجر
  if (store.is_open === false) {
    return {
      isOpen: false,
      reason: "المتجر مغلق بطلب من الإدارة/صاحب المتجر",
    };
  }

  // 3. فحص ساعات العمل المبرمجة
  const config = parseStoreHours(store);
  if (config.is24Hours) {
    return {
      isOpen: true,
      formattedHours: "مفتوح 24 ساعة",
    };
  }

  const [openH, openM] = config.openTime.split(":").map(Number);
  const [closeH, closeM] = config.closeTime.split(":").map(Number);
  const openMin = openH * 60 + (openM || 0);
  const closeMin = closeH * 60 + (closeM || 0);

  const { minutes: currentMin } = getCairoNowMinutes(now);

  const formattedHours = `من ${formatArabicTime(config.openTime)} إلى ${formatArabicTime(config.closeTime)}`;

  // إذا كانت فترة العمل تمتد بعد منتصف الليل (مثلاً من 10 ص حتى 2 فجراً)
  const isOvernight = closeMin < openMin;

  let inWorkingHours = false;
  if (isOvernight) {
    inWorkingHours = currentMin >= openMin || currentMin < closeMin;
  } else {
    inWorkingHours = currentMin >= openMin && currentMin < closeMin;
  }

  if (inWorkingHours) {
    return {
      isOpen: true,
      formattedHours,
    };
  }

  return {
    isOpen: false,
    reason: `المتجر مغلق حالياً • مواعيد العمل: ${formattedHours}`,
    formattedHours,
    nextOpenText: `يفتح الساعة ${formatArabicTime(config.openTime)}`,
  };
}
