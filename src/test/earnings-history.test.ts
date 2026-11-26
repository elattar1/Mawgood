import { describe, it, expect } from "vitest";
import { rangeBounds, inBounds, filterDriverHistory, filterPartnerHistory } from "@/lib/earnings-history";

const now = new Date("2026-11-26T15:00:00");

describe("rangeBounds", () => {
  it("all leaves both sides open", () => {
    expect(rangeBounds("all", now)).toEqual({ from: null, to: null });
  });
  const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  it("week covers the last 7 days including today", () => {
    const b = rangeBounds("week", now);
    expect(localDay(b.from!)).toBe("2026-11-20");
    expect(b.to!.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });
  it("month covers the last 30 days including today", () => {
    const b = rangeBounds("month", now);
    expect(localDay(b.from!)).toBe("2026-10-28");
  });
  it("custom uses the provided dates, to inclusive", () => {
    const b = rangeBounds("custom", now, "2026-11-01", "2026-11-10");
    expect(inBounds("2026-11-01T00:30:00", b)).toBe(true);
    expect(inBounds("2026-11-10T23:30:00", b)).toBe(true);
    expect(inBounds("2026-11-11T00:30:00", b)).toBe(false);
    expect(inBounds("2026-10-31T23:30:00", b)).toBe(false);
  });
});

describe("filterDriverHistory", () => {
  const orders = [
    { status: "delivered", delivered_at: "2026-11-25T12:00:00" },
    { status: "delivered", delivered_at: "2026-10-01T12:00:00" },
    { status: "on_the_way", delivered_at: null },
    { status: "delivered", delivered_at: null },
  ];
  it("keeps delivered orders inside the range only", () => {
    const b = rangeBounds("week", now);
    expect(filterDriverHistory(orders, b)).toHaveLength(1);
    expect(filterDriverHistory(orders, rangeBounds("all", now))).toHaveLength(2);
  });
});

describe("filterPartnerHistory", () => {
  const rows = [
    { kind: "orders", status: "delivered", created_at: "2026-11-25T12:00:00" },
    { kind: "orders", status: "cancelled", created_at: "2026-11-25T12:00:00" },
    { kind: "bookings", status: "completed", created_at: "2026-11-24T12:00:00" },
    { kind: "service_requests", status: "completed", created_at: "2026-11-23T12:00:00" },
    { kind: "service_requests", status: "pending", created_at: "2026-11-23T12:00:00" },
  ];
  it("keeps delivered orders and completed bookings/services", () => {
    expect(filterPartnerHistory(rows, rangeBounds("all", now))).toHaveLength(3);
    expect(filterPartnerHistory(rows, rangeBounds("week", now))).toHaveLength(3);
    expect(filterPartnerHistory(rows, rangeBounds("custom", now, "2026-11-25", "2026-11-26"))).toHaveLength(1);
  });
});
