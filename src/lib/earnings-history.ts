// Range filtering helpers for the earnings history dialog (B1).

export type HistoryRange = "week" | "month" | "custom" | "all";

export type RangeBounds = { from: Date | null; to: Date | null };

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * week = last 7 days including today, month = last 30 days including today.
 * custom uses yyyy-mm-dd input values; a missing side leaves that side open.
 */
export function rangeBounds(range: HistoryRange, now = new Date(), customFrom?: string, customTo?: string): RangeBounds {
  if (range === "all") return { from: null, to: null };
  if (range === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from, to: endOfDay(now) };
  }
  if (range === "month") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 29);
    return { from, to: endOfDay(now) };
  }
  const from = customFrom ? startOfDay(new Date(`${customFrom}T00:00:00`)) : null;
  const to = customTo ? endOfDay(new Date(`${customTo}T00:00:00`)) : null;
  return { from, to };
}

export function inBounds(iso: string | null | undefined, bounds: RangeBounds): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (bounds.from && t < bounds.from.getTime()) return false;
  if (bounds.to && t > bounds.to.getTime()) return false;
  return true;
}

/** Driver history: delivered orders only, filtered by delivered_at. */
export function filterDriverHistory<T extends { status: string; delivered_at: string | null }>(orders: T[], bounds: RangeBounds): T[] {
  return orders.filter(o => o.status === "delivered" && inBounds(o.delivered_at, bounds));
}

/** Partner history: completed ledger rows only, filtered by created_at. */
export function filterPartnerHistory<T extends { kind: string; status: string; created_at: string }>(rows: T[], bounds: RangeBounds): T[] {
  return rows.filter(row => {
    const complete = row.kind === "orders" ? row.status === "delivered" : row.status === "completed";
    return complete && inBounds(row.created_at, bounds);
  });
}
