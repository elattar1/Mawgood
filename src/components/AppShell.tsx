import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Home,
  ShoppingCart,
  ClipboardList,
  Store,
  Shield,
  User,
  Truck,
  Users,
  Package,
  PackageOpen,
  Wallet,
  ArrowRightLeft,
  Flame,
} from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useOffersVisibility } from "@/lib/use-offers-visibility";
import { Button } from "@/components/ui/button";

function useUnread() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["unread", user?.id],
    enabled: !!user,
    refetchInterval: 20000,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      return count ?? 0;
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAdmin, isDriver, isProvider, appMode, setAppMode } = useAuth();
  const cart = useCart();
  const { isVisible: isOffersVisible } = useOffersVisibility();
  const { data: unread = 0 } = useUnread();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const currentTab = String((location.search as any)?.tab || (currentPath.includes("/admin") || currentPath.includes("/provider") ? "stores" : ""));

  const activeItemClass = "text-primary font-bold";
  const active = { className: activeItemClass };

  const isHomeActive = appMode === "customer" && currentPath === "/";
  const isOffersActive = appMode === "customer" && (currentPath === "/offers" || currentPath.startsWith("/offers/"));
  const isCartActive = appMode === "customer" && currentPath === "/cart";
  const isOrdersActive = appMode === "customer" && currentPath === "/orders";
  const isAccountActive = currentPath === "/account" || currentPath === "/auth";

  const getNavItemClass = (isActive: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 text-[11px] py-1 px-2 rounded-full transition-colors duration-150 min-w-[50px] active:scale-95 ${
      isActive
        ? "text-primary font-bold"
        : "text-muted-foreground/80 font-medium hover:text-foreground"
    }`;

  const handleReturnToCustomer = () => {
    setAppMode("customer");
    navigate({ to: "/" });
  };

  const modeBadge = {
    admin: { label: "وضع الإدارة", bg: "bg-purple-600/15 text-purple-700 dark:text-purple-300 border-purple-500/30", icon: Shield },
    merchant: { label: "بوابة التاجر", bg: "bg-amber-600/15 text-amber-700 dark:text-amber-300 border-amber-500/30", icon: Store },
    driver: { label: "تطبيق السائق", bg: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30", icon: Truck },
    customer: null,
  }[appMode];

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="glass-top-header sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <Link to="/" className="flex items-center py-1 transition-opacity hover:opacity-90" aria-label="الرئيسية - موجود">
              <img
                src="/header-logo.png"
                alt="موجود"
                className="h-11 sm:h-12 w-auto max-w-[170px] sm:max-w-[210px] object-contain object-right"
              />
            </Link>

            {modeBadge && (
              <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${modeBadge.bg}`}>
                <modeBadge.icon className="size-3.5" />
                {modeBadge.label}
              </span>
            )}
          </div>

          {/* روابط سطح المكتب حسب الوضع الحالي */}
          <nav className="hidden items-center gap-3 text-sm md:flex">
            {appMode === "merchant" && (
              <>
                <Link to="/provider" search={{ tab: "orders" }} activeProps={active}>الطلبات الحية</Link>
                <Link to="/provider" search={{ tab: "products" }} activeProps={active}>المنتجات والمنيو</Link>
                <Link to="/provider" search={{ tab: "stores" }} activeProps={active}>بيانات المتجر</Link>
                <Link to="/provider" search={{ tab: "earnings" }} activeProps={active}>الأرباح والتقارير</Link>
              </>
            )}

            {appMode === "driver" && (
              <>
                <Link to="/delivery" search={{ tab: "current" }} activeProps={active}>معي الآن</Link>
                <Link to="/delivery" search={{ tab: "available" }} activeProps={active}>رادار الطلبات</Link>
                <Link to="/delivery" search={{ tab: "wallet" }} activeProps={active}>المحفظة والحساب</Link>
              </>
            )}

            {appMode === "admin" && (
              <>
                <Link to="/admin" search={{ tab: "stores" }} activeProps={active}>المتاجر والخدمات</Link>
                <Link to="/admin" search={{ tab: "products" }} activeProps={active}>إدارة المنيو</Link>
                <Link to="/admin" search={{ tab: "orders" }} activeProps={active}>الطلبات</Link>
                <Link to="/drivers" search={{ q: "" }} activeProps={active}>فريق الدليفري</Link>
                <Link to="/admin" search={{ tab: "earnings" }} activeProps={active}>الأرباح والخزينة</Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-1.5">
            {/* زر سريع للتحويل لوضع المشتري إذا كان في وضع إداري أو مهني */}
            {appMode !== "customer" && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReturnToCustomer}
                className="hidden sm:inline-flex h-8 gap-1.5 text-xs font-medium border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary"
              >
                <ArrowRightLeft className="size-3.5" />
                وضع المشتري
              </Button>
            )}

            {/* في وضع المشتري فقط: تظهر أيقونات الرئيسية والعروض وطلباتي في الوضع العرضي */}
            {appMode === "customer" && (
              <>
                <Link
                  to="/"
                  activeOptions={{ exact: true }}
                  className={`hidden md:inline-flex relative rounded-full p-2 transition-colors ${
                    currentPath === "/"
                      ? "text-primary font-bold bg-primary/10"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label="الرئيسية"
                  title="الرئيسية"
                >
                  <Home className="h-5 w-5" />
                </Link>

                {isOffersVisible && (
                  <Link
                    to="/offers"
                    className={`hidden md:inline-flex relative rounded-full p-2 transition-colors ${
                      currentPath.startsWith("/offers")
                        ? "text-primary font-bold bg-primary/10"
                        : "text-amber-600 dark:text-amber-400 hover:bg-muted"
                    }`}
                    aria-label="العروض والتخفيضات"
                    title="العروض والتخفيضات 🔥"
                  >
                    <Flame className="h-5 w-5" />
                  </Link>
                )}

                <Link
                  to={user ? "/orders" : "/auth"}
                  className={`hidden md:inline-flex relative rounded-full p-2 transition-colors ${
                    currentPath === "/orders"
                      ? "text-primary font-bold bg-primary/10"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label="طلباتي"
                  title="طلباتي"
                >
                  <ClipboardList className="h-5 w-5" />
                </Link>
              </>
            )}

            {/* الإشعارات: ظاهرة في جميع الأوضاع إذا كان المستخدم مسجل دخول */}
            {user && (
              <Link to="/notifications" className="relative rounded-full p-2 hover:bg-muted" aria-label="الإشعارات" title="الإشعارات">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -left-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                    {unread}
                  </span>
                )}
              </Link>
            )}

            {/* السلة: تظهر فقط في وضع المشتري */}
            {appMode === "customer" && (
              <Link to="/cart" className="relative rounded-full p-2 hover:bg-muted" aria-label="السلة" title="السلة">
                <ShoppingCart className="h-5 w-5" />
                {cart.count > 0 && (
                  <span className="absolute -top-0.5 -left-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] text-accent-foreground">
                    {cart.count}
                  </span>
                )}
              </Link>
            )}

            {/* حسابي: يظهر في جميع الأوضاع */}
            <Link to={user ? "/account" : "/auth"} className="rounded-full p-2 hover:bg-muted" aria-label="الحساب" title="حسابي">
              <User className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="min-h-screen pb-36 md:pb-12">{children}</main>

      {/* الشريط السفلي العائم بتصميم الزجاج المصنفر (Floating Frosted Glass Dock) */}
      <div className="fixed inset-x-0 bottom-3 z-40 px-3 sm:px-0 pointer-events-none md:hidden mb-[env(safe-area-inset-bottom,0px)]">
        <nav className="floating-glass-dock pointer-events-auto mx-auto max-w-md flex items-center justify-around py-1 px-1.5 rounded-full shadow-2xl">
          {/* 1. وضع المشتري (افتراضي ونظيف، خالي من أي لوحات أخرى) */}
          {appMode === "customer" && (
            <>
              <Link to="/" className={getNavItemClass(isHomeActive)}>
                <Home className="h-5 w-5" />
                <span>الرئيسية</span>
              </Link>
              {isOffersVisible && (
                <Link to="/offers" className={getNavItemClass(isOffersActive)}>
                  <div className="relative">
                    <Flame className={`h-5 w-5 ${isOffersActive ? "text-primary" : "text-amber-500"}`} />
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                    </span>
                  </div>
                  <span>العروض 🔥</span>
                </Link>
              )}
              <Link to="/cart" className={getNavItemClass(isCartActive)}>
                <div className="relative">
                  <ShoppingCart className="h-5 w-5" />
                  {cart.count > 0 && (
                    <span className="absolute -top-1 -left-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-0.5 text-[9px] text-accent-foreground font-bold">
                      {cart.count}
                    </span>
                  )}
                </div>
                <span>السلة</span>
              </Link>
              <Link to={user ? "/orders" : "/auth"} className={getNavItemClass(isOrdersActive)}>
                <ClipboardList className="h-5 w-5" />
                <span>طلباتي</span>
              </Link>
            </>
          )}

          {/* 2. وضع بوابة التاجر (مخصص للمحل) */}
          {appMode === "merchant" && (
            <>
              <Link
                to="/provider"
                search={{ tab: "orders" }}
                className={getNavItemClass(currentPath.includes("/provider") && currentTab === "orders")}
              >
                <ClipboardList className="h-5 w-5" />
                <span>الطلبات</span>
              </Link>
              <Link
                to="/provider"
                search={{ tab: "products" }}
                className={getNavItemClass(currentPath.includes("/provider") && currentTab === "products")}
              >
                <Package className="h-5 w-5" />
                <span>المنيو</span>
              </Link>
              <Link
                to="/provider"
                search={{ tab: "stores" }}
                className={getNavItemClass(currentPath.includes("/provider") && currentTab === "stores")}
              >
                <Store className="h-5 w-5" />
                <span>المتجر</span>
              </Link>
              <Link
                to="/provider"
                search={{ tab: "earnings" }}
                className={getNavItemClass(currentPath.includes("/provider") && currentTab === "earnings")}
              >
                <Wallet className="h-5 w-5" />
                <span>الأرباح</span>
              </Link>
            </>
          )}

          {/* 3. وضع تطبيق السائق (مخصص للكابتن) */}
          {appMode === "driver" && (
            <>
              <Link
                to="/delivery"
                search={{ tab: "current" }}
                className={getNavItemClass(currentPath.includes("/delivery") && currentTab === "current")}
              >
                <Truck className="h-5 w-5" />
                <span>معي الآن</span>
              </Link>
              <Link
                to="/delivery"
                search={{ tab: "available" }}
                className={getNavItemClass(currentPath.includes("/delivery") && currentTab === "available")}
              >
                <PackageOpen className="h-5 w-5" />
                <span>الرادار</span>
              </Link>
              <Link
                to="/delivery"
                search={{ tab: "wallet" }}
                className={getNavItemClass(currentPath.includes("/delivery") && currentTab === "wallet")}
              >
                <Wallet className="h-5 w-5" />
                <span>المحفظة</span>
              </Link>
            </>
          )}

          {/* 4. وضع لوحة الإدارة (مخصص للمدير) */}
          {appMode === "admin" && (
            <>
              <Link
                to="/admin"
                search={{ tab: "stores" }}
                className={getNavItemClass(currentPath.includes("/admin") && currentTab === "stores")}
              >
                <Store className="h-5 w-5" />
                <span>المتاجر</span>
              </Link>
              <Link
                to="/admin"
                search={{ tab: "products" }}
                className={getNavItemClass(currentPath.includes("/admin") && currentTab === "products")}
              >
                <Package className="h-5 w-5" />
                <span>المنيو</span>
              </Link>
              <Link
                to="/admin"
                search={{ tab: "orders" }}
                className={getNavItemClass(currentPath.includes("/admin") && currentTab === "orders")}
              >
                <ClipboardList className="h-5 w-5" />
                <span>الطلبات</span>
              </Link>
              <Link
                to="/drivers"
                search={{ q: "" }}
                className={getNavItemClass(currentPath.startsWith("/drivers"))}
              >
                <Users className="h-5 w-5" />
                <span>الأسطول</span>
              </Link>
              <Link
                to="/admin"
                search={{ tab: "earnings" }}
                className={getNavItemClass(currentPath.includes("/admin") && currentTab === "earnings")}
              >
                <Wallet className="h-5 w-5" />
                <span>الخزينة</span>
              </Link>
            </>
          )}

          {/* حسابي دائمًا هو العنصر الأخير في الشريط السفلي فيكون أقصى الشمال (أقصى اليسار) في الاتجاه العربي RTL في جميع الأوضاع */}
          <Link to={user ? "/account" : "/auth"} className={getNavItemClass(isAccountActive)}>
            <div className="relative">
              <User className="h-5 w-5" />
              {appMode !== "customer" && (
                <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-primary" />
              )}
            </div>
            <span>حسابي</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl text-primary">{title}</h1>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "cancelled"
      ? "bg-destructive/10 text-destructive"
      : ["delivered", "completed"].includes(status)
        ? "bg-success/15 text-success"
        : status === "pending"
          ? "bg-accent/25 text-accent-foreground"
          : "bg-primary/10 text-primary";
  const { STATUS_LABELS } = labels;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{STATUS_LABELS[status] ?? status}</span>;
}

import * as labels from "@/lib/labels";
