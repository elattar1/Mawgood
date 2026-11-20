import { describe, expect, it } from "vitest";
import { driverWallet, canEndDriverShift } from "@/lib/delivery-rules";

describe("Delivery wallet accounting", () => {
  it("counts delivery fees and collected cash only for delivered orders", () => {
    expect(driverWallet([
      { status: "delivered", delivery_fee: 20, total: 120, delivered_at: "2026-11-01T10:00:00Z" },
      { status: "on_the_way", delivery_fee: 30, total: 200, delivered_at: null },
      { status: "cancelled", delivery_fee: 40, total: 300, delivered_at: null },
    ], new Date("2026-11-01T12:00:00Z"))).toEqual({ deliveredCount: 1, todayCount: 1, earnings: 20, todayEarnings: 20, cashCollected: 120 });
  });
});

describe("Delivery shift rules", () => {
  it("prevents driver from ending shift if they currently have active orders on the way", () => {
    const resultWithOneOrder = canEndDriverShift(1);
    expect(resultWithOneOrder.allowed).toBe(false);
    expect(resultWithOneOrder.reason).toContain("لا يمكنك إيقاف الوردية");

    const resultWithThreeOrders = canEndDriverShift(3);
    expect(resultWithThreeOrders.allowed).toBe(false);
    expect(resultWithThreeOrders.reason).toContain("3 طلب");
  });

  it("allows driver to end shift when there are zero active orders", () => {
    const result = canEndDriverShift(0);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});
import { allowedNext as storeNext } from "@/lib/dashboard-rules";
describe("store order steps", () => {
  it("store can move an accepted order to ready", () => { expect(storeNext("orders", "accepted")).toContain("preparing"); });
  it("store cannot mark ready orders on the way or delivered", () => { expect(storeNext("orders", "preparing")).toEqual([]); expect(storeNext("orders", "on_the_way")).toEqual([]); });
});
