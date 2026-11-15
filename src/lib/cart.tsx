// src/lib/cart.tsx
// نظام إدارة وحفظ سلة المشتريات تلقائياً في التخزين المحلي (Local Persistence)
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartItem = { product_id: string; name: string; price: number; qty: number };
type Cart = { store_id: string | null; store_name: string; items: CartItem[] };
type CartCtx = Cart & {
  add: (store: { id: string; name: string }, item: Omit<CartItem, "qty">) => boolean;
  setQty: (product_id: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
};

const empty: Cart = { store_id: null, store_name: "", items: [] };
const Ctx = createContext<CartCtx | null>(null);
const KEY = "husseiniya-cart";
const BACKUP_KEY = "husayniya_cart_backup";

/**
 * قراءة حالة السلة فوراً من التخزين المحلي
 */
function readCartFromStorage(): Cart {
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(BACKUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        return {
          store_id: parsed.store_id ?? null,
          store_name: parsed.store_name ?? "",
          items: parsed.items.map((it: any) => ({
            product_id: String(it.product_id),
            name: String(it.name),
            price: Number(it.price) || 0,
            qty: Number(it.qty) || 1,
          })),
        };
      }
    }
  } catch {}
  return empty;
}

export function CartProvider({ children }: { children: ReactNode }) {
  // تهيئة الحالة فوراً من الذاكرة المحلية لمنع وميض "السلة فارغة" عند التحديث
  const [cart, setCart] = useState<Cart>(readCartFromStorage);

  useEffect(() => {
    // التأكد من استرجاع البيانات بعد اكتمال تهيئة المتصفح (Hydration Sync)
    const stored = readCartFromStorage();
    if (stored.items.length > 0 && cart.items.length === 0) {
      setCart(stored);
    }

    // مزامنة التغييرات فوراً بين النوافذ والتبويبات المختلفة
    const handleStorage = (e: StorageEvent) => {
      if (e.key === KEY || e.key === BACKUP_KEY) {
        setCart(readCartFromStorage());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const save = (c: Cart) => {
    setCart(c);
    try {
      if (typeof window !== "undefined") {
        if (!c.items || c.items.length === 0) {
          localStorage.removeItem(KEY);
          localStorage.removeItem(BACKUP_KEY);
        } else {
          const serialized = JSON.stringify(c);
          localStorage.setItem(KEY, serialized);
          localStorage.setItem(BACKUP_KEY, serialized);
        }
      }
    } catch (e) {
      console.warn("Failed to save cart to localStorage:", e);
    }
  };

  const add: CartCtx["add"] = (store, item) => {
    if (cart.store_id && cart.store_id !== store.id && cart.items.length) {
      if (!confirm(`سلتك فيها منتجات من "${cart.store_name}". هل تريد تفريغها والبدء من جديد؟`)) return false;
      save({ store_id: store.id, store_name: store.name, items: [{ ...item, qty: 1 }] });
      return true;
    }
    const existing = cart.items.find((i) => i.product_id === item.product_id);
    const items = existing
      ? cart.items.map((i) => (i.product_id === item.product_id ? { ...i, qty: i.qty + 1 } : i))
      : [...cart.items, { ...item, qty: 1 }];
    save({ store_id: store.id, store_name: store.name, items });
    return true;
  };

  const setQty = (product_id: string, qty: number) => {
    const items = cart.items
      .map((i) => (i.product_id === product_id ? { ...i, qty } : i))
      .filter((i) => i.qty > 0);
    save(items.length ? { ...cart, items } : empty);
  };

  const clear = () => {
    save(empty);
  };

  return (
    <Ctx.Provider
      value={{
        ...cart,
        add,
        setQty,
        clear,
        count: cart.items.reduce((s, i) => s + i.qty, 0),
        subtotal: cart.items.reduce((s, i) => s + i.qty * i.price, 0),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useCart = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("CartProvider missing");
  return c;
};
