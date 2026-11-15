// src/lib/address-storage.ts
// نظام حفظ واسترجاع العنوان وبيانات التوصيل في التخزين المحلي (Local Persistence)
import { cleanDisplayAddress } from "@/lib/map-utils";

export interface PersistedAddressDraft {
  address: string;
  phone: string;
  areaId: number | null;
  label: string;
  selectedId: string;
  coords: { lat: number; lng: number } | null;
}

export const ADDRESS_STORAGE_KEYS = {
  ADDRESS: "husayniya_last_address",
  PHONE: "husayniya_last_phone",
  AREA: "husayniya_last_area",
  LABEL: "husayniya_last_label",
  SELECTED_ID: "husayniya_selected_address_id",
  COORDS: "husayniya_last_coords",
  NOTES: "husayniya_last_notes",
} as const;

/**
 * استرجاع بيانات العنوان الأخير والمسودة المحفوظة في المتصفح
 */
export function getPersistedAddressDraft(): PersistedAddressDraft {
  if (typeof window === "undefined") {
    return {
      address: "",
      phone: "",
      areaId: null,
      label: "",
      selectedId: "new",
      coords: null,
    };
  }
  try {
    const address = localStorage.getItem(ADDRESS_STORAGE_KEYS.ADDRESS) || "";
    const phone = localStorage.getItem(ADDRESS_STORAGE_KEYS.PHONE) || "";
    const areaRaw = localStorage.getItem(ADDRESS_STORAGE_KEYS.AREA);
    const areaId = areaRaw ? Number(areaRaw) || null : null;
    const label = localStorage.getItem(ADDRESS_STORAGE_KEYS.LABEL) || "";
    const selectedId = localStorage.getItem(ADDRESS_STORAGE_KEYS.SELECTED_ID) || "new";

    let coords: { lat: number; lng: number } | null = null;
    const coordsRaw = localStorage.getItem(ADDRESS_STORAGE_KEYS.COORDS);
    if (coordsRaw) {
      try {
        const parsed = JSON.parse(coordsRaw);
        if (parsed && typeof parsed.lat === "number" && typeof parsed.lng === "number") {
          coords = parsed;
        }
      } catch {}
    }

    return {
      address,
      phone,
      areaId,
      label,
      selectedId,
      coords,
    };
  } catch {
    return {
      address: "",
      phone: "",
      areaId: null,
      label: "",
      selectedId: "new",
      coords: null,
    };
  }
}

/**
 * حفظ مسودة العنوان في التخزين المحلي فور الكتابة أو التعديل
 */
export function saveAddressDraft(partial: Partial<PersistedAddressDraft>): void {
  if (typeof window === "undefined") return;
  try {
    if (partial.address !== undefined) {
      localStorage.setItem(ADDRESS_STORAGE_KEYS.ADDRESS, cleanDisplayAddress(partial.address));
    }
    if (partial.phone !== undefined) {
      localStorage.setItem(ADDRESS_STORAGE_KEYS.PHONE, partial.phone);
    }
    if (partial.areaId !== undefined) {
      if (partial.areaId === null) {
        localStorage.removeItem(ADDRESS_STORAGE_KEYS.AREA);
      } else {
        localStorage.setItem(ADDRESS_STORAGE_KEYS.AREA, String(partial.areaId));
      }
    }
    if (partial.label !== undefined) {
      localStorage.setItem(ADDRESS_STORAGE_KEYS.LABEL, partial.label);
    }
    if (partial.selectedId !== undefined) {
      localStorage.setItem(ADDRESS_STORAGE_KEYS.SELECTED_ID, partial.selectedId);
    }
    if (partial.coords !== undefined) {
      if (partial.coords === null) {
        localStorage.removeItem(ADDRESS_STORAGE_KEYS.COORDS);
      } else {
        localStorage.setItem(ADDRESS_STORAGE_KEYS.COORDS, JSON.stringify(partial.coords));
      }
    }
  } catch {}
}

/**
 * استرجاع ملاحظات الطلب المؤقتة
 */
export function getPersistedNotes(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(ADDRESS_STORAGE_KEYS.NOTES) || "";
  } catch {
    return "";
  }
}

/**
 * حفظ ملاحظات الطلب المؤقتة أثناء الكتابة
 */
export function savePersistedNotes(notes: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADDRESS_STORAGE_KEYS.NOTES, notes);
  } catch {}
}

/**
 * حذف ملاحظات الطلب بعد نجاح إرسال الطلب (مع الإبقاء على العنوان ورقم الهاتف)
 */
export function clearPersistedNotes(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ADDRESS_STORAGE_KEYS.NOTES);
  } catch {}
}
