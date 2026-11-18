import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Removes embedded chat logs, GPS coordinates, and automated payment/system tags
 * from the notes field so user-facing views only see real human notes from the customer.
 */
export function cleanOrderNotes(notes?: string | null): string {
  if (!notes) return "";
  return notes
    .replace(/<!--\s*CHAT_V1:[\s\S]*?-->/gi, "")
    .replace(/<!--\s*DRIVER_GPS:[\s\S]*?-->/gi, "")
    .replace(/<!--\s*GPS:[\s\S]*?-->/gi, "")
    .replace(/\[\s*طريقة الدفع:[^\]]*\]/gi, "")
    .replace(/طريقة الدفع:[^\n]*/gi, "")
    .replace(/\[\s*توصيل المتجر[^\]]*\]/gi, "")
    .replace(/\[\s*الدفع[^\]]*\]/gi, "")
    .replace(/(?:📍|\(|\[)?\s*-?[0-9]{1,3}\.[0-9]{3,12}\s*,\s*-?[0-9]{1,3}\.[0-9]{3,12}(?:\)|\])?/g, "")
    .trim();
}
