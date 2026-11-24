import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { CartProvider, useCart } from "@/lib/cart";

// Local-state only: no network, no backend. Synthetic store and products.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
type Hook = { result: { current: ReturnType<typeof useCart> }; unmount: () => void };
function renderHook(_fn: () => ReturnType<typeof useCart>, _o?: unknown): Hook {
  const result = { current: undefined as unknown as ReturnType<typeof useCart> };
  function Probe() { result.current = useCart(); return null; }
  const el = document.createElement("div");
  const root = createRoot(el);
  act(() => { root.render(<CartProvider><Probe /></CartProvider>); });
  return { result, unmount: () => act(() => root.unmount()) };
}
const wrapper = undefined as unknown as ({ children }: { children: ReactNode }) => ReactNode;
const storeA = { id: "store-a", name: "Store A" };
const storeB = { id: "store-b", name: "Store B" };
const p1 = { product_id: "p1", name: "Item 1", price: 50 };
const p2 = { product_id: "p2", name: "Item 2", price: 30 };

describe("cart provider (synthetic data, localStorage only)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts empty", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.count).toBe(0);
    expect(result.current.subtotal).toBe(0);
    expect(result.current.items).toEqual([]);
  });

  it("adds items, increments qty for the same product, computes count and subtotal", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => { result.current.add(storeA, p1); });
    act(() => { result.current.add(storeA, p1); });
    act(() => { result.current.add(storeA, p2); });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.count).toBe(3);
    expect(result.current.subtotal).toBe(50 * 2 + 30);
    expect(result.current.store_id).toBe("store-a");
  });

  it("setQty(0) removes the line and an empty cart clears storage", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => { result.current.add(storeA, p1); });
    expect(localStorage.length).toBeGreaterThan(0);
    act(() => { result.current.setQty("p1", 0); });
    expect(result.current.count).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it("persists to localStorage and restores on a new provider", () => {
    const first = renderHook(() => useCart(), { wrapper });
    act(() => { first.result.current.add(storeA, p1); });
    first.unmount();
    const second = renderHook(() => useCart(), { wrapper });
    expect(second.result.current.count).toBe(1);
    expect(second.result.current.items[0].product_id).toBe("p1");
  });

  it("asks before replacing a cart from another store; declining keeps it", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => { result.current.add(storeA, p1); });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    let ok = true;
    act(() => { ok = result.current.add(storeB, p2); });
    expect(ok).toBe(false);
    expect(result.current.store_id).toBe("store-a");
    expect(result.current.count).toBe(1);
  });

  it("replaces the cart when the user accepts the other-store prompt", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    act(() => { result.current.add(storeA, p1); });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    act(() => { result.current.add(storeB, p2); });
    expect(result.current.store_id).toBe("store-b");
    expect(result.current.items.map((i) => i.product_id)).toEqual(["p2"]);
  });
});
