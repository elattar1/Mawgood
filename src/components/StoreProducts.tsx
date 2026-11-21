import { useState, useRef } from "react";
import { Plus, Minus, Trash2, UtensilsCrossed, Layers, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/cart";
import type { Catalog } from "@/lib/customer-queries";
import { money } from "@/lib/labels";
import { groupProductsBySection, type StoreSection } from "@/lib/product-sections";
import { resolveProductImageUrl, getDefaultCategoryFallbackImage } from "@/lib/template-catalogs";
import {
  groupProductsIntoCards,
  type GroupedProductCard,
  type StoreProductLike,
} from "@/lib/product-variants";

type Product = StoreProductLike;

function ProductCardItem({
  card,
  store,
  cart,
}: {
  card: GroupedProductCard<Product>;
  store: Catalog["stores"][number];
  cart: ReturnType<typeof useCart>;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string>(() => {
    // If any variant is already in cart, default selection to it
    const inCart = card.variants.find((v) =>
      cart.items.some((ci) => ci.product_id === v.product.id)
    );
    return inCart ? inCart.product.id : card.variants[0]?.product.id ?? card.id;
  });

  const activeVariant =
    card.variants.find((v) => v.product.id === selectedVariantId) ??
    card.variants[0];
  const activeProduct = activeVariant.product;

  const itemInCart = cart.items.find((i) => i.product_id === activeProduct.id);
  const qty = itemInCart?.qty ?? 0;

  const hasMultipleSizes = card.variants.length > 1;

  // Total quantity in cart across all sizes for this product line
  const totalInCartForLine = card.variants.reduce((sum, v) => {
    const ci = cart.items.find((i) => i.product_id === v.product.id);
    return sum + (ci?.qty ?? 0);
  }, 0);

  const displayImage = activeProduct.image_url || card.imageUrl || null;

  return (
    <article
      className="flex flex-col justify-between rounded-2xl border bg-card p-4 shadow-soft transition-all hover:border-primary/40 hover:shadow-hover"
      key={card.id}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {displayImage ? (
          <img
            src={resolveProductImageUrl(displayImage, store.category) ?? displayImage}
            alt={hasMultipleSizes ? card.baseName : activeProduct.name}
            loading="lazy"
            decoding="async"
            className="size-20 shrink-0 rounded-xl object-cover border"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = getDefaultCategoryFallbackImage(store.category);
            }}
          />
        ) : (
          <div className="size-20 shrink-0 rounded-xl bg-muted/60 border flex flex-col items-center justify-center text-muted-foreground p-1 text-center">
            <Package className="size-6 opacity-40 mb-0.5" />
            <span className="text-[10px] font-semibold text-muted-foreground/80 line-clamp-1">
              {store.category === "pharmacies" ? "دواء" : store.category === "restaurants" ? "وجبة" : "منتج"}
            </span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <h4 className="break-words font-sans font-bold text-base text-foreground leading-snug">
              {hasMultipleSizes ? card.baseName : activeProduct.name}
            </h4>
            {totalInCartForLine > 0 && hasMultipleSizes && (
              <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0.5 bg-primary/10 text-primary shrink-0">
                {totalInCartForLine} بالسلة
              </Badge>
            )}
          </div>

          {activeProduct.description && (
            <p className="my-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {activeProduct.description}
            </p>
          )}

          <div className="mt-1 flex items-baseline gap-2">
            <p className="font-bold text-primary text-base sm:text-lg">
              {money(activeProduct.price)}
            </p>
            {!hasMultipleSizes && activeVariant.sizeLabel && (
              <span className="text-xs text-muted-foreground font-medium">
                • {activeVariant.sizeLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* شريط اختيار الأحجام المتوفرة بأسلوب تطبيقات الطلبات العالمية (طلبات، إنستاشوب) */}
      {hasMultipleSizes && (
        <div className="mt-3 pt-2.5 border-t border-border/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-muted-foreground">
              اختر الحجم:
            </span>
            <span className="text-[11px] font-semibold text-primary">
              المحدد: {activeVariant.sizeLabel} ({money(activeProduct.price)})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="اختر الحجم المطلوب">
            {card.variants.map((v) => {
              const isSelected = v.product.id === activeProduct.id;
              const vInCart = cart.items.find((i) => i.product_id === v.product.id);
              const vQty = vInCart?.qty ?? 0;
              return (
                <button
                  key={v.product.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedVariantId(v.product.id)}
                  className={`group relative inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/20 scale-[1.02]"
                      : "bg-muted/70 text-foreground hover:bg-muted hover:border-primary/40 border border-border/40"
                  }`}
                >
                  <span>{v.sizeLabel}</span>
                  <span
                    className={`text-[10px] font-mono font-medium ${
                      isSelected ? "text-primary-foreground/90" : "text-muted-foreground"
                    }`}
                  >
                    ({money(v.product.price)})
                  </span>
                  {vQty > 0 && (
                    <span
                      className={`size-4 rounded-full text-[10px] font-black inline-flex items-center justify-center ${
                        isSelected
                          ? "bg-white text-primary"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {vQty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* شريط الإضافة والتحكم بالكمية للحجم النشط المختار */}
      <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/40">
        <div className="text-xs text-muted-foreground">
          {hasMultipleSizes ? (
            <span className="font-medium text-[11px]">
              {activeVariant.sizeLabel} • <span className="font-bold text-foreground">{money(activeProduct.price)}</span>
            </span>
          ) : (
            <span className="text-[11px]">الكمية المطلوبة</span>
          )}
        </div>

        <div>
          {qty === 0 ? (
            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-xl shadow-xs px-3 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-transform active:scale-95"
              aria-label={`إضافة ${activeProduct.name} للسلة`}
              title={`إضافة ${activeProduct.name}`}
              disabled={!activeProduct.is_available || !store.is_open}
              onClick={() => {
                if (
                  cart.add(store, {
                    product_id: activeProduct.id,
                    name: activeProduct.name,
                    price: Number(activeProduct.price),
                  })
                ) {
                  toast.success(`تمت إضافة ${activeProduct.name} للسلة`);
                }
              }}
            >
              <Plus className="size-3.5" />
              <span>أضف للسلة</span>
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 p-1 shadow-sm">
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive active:scale-90 transition-transform"
                aria-label="تقليل أو حذف"
                title={qty === 1 ? "حذف من السلة" : "تقليل الكمية"}
                onClick={() => {
                  cart.setQty(activeProduct.id, qty - 1);
                  if (qty === 1) {
                    toast.info(`تم حذف ${activeProduct.name} من السلة`);
                  }
                }}
              >
                {qty === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
              </Button>
              <span className="min-w-6 text-center font-bold text-sm text-primary tabular-nums">
                {qty}
              </span>
              <Button
                size="icon"
                className="size-7 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 active:scale-90 transition-transform shadow-none"
                aria-label="زيادة الكمية"
                title="زيادة الكمية"
                disabled={!activeProduct.is_available || !store.is_open}
                onClick={() => {
                  cart.setQty(activeProduct.id, qty + 1);
                }}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function StoreProducts({
  store,
  products,
  sections,
}: {
  store: Catalog["stores"][number];
  products: Product[];
  sections: StoreSection[];
}) {
  const cart = useCart();
  const groups = groupProductsBySection(products, sections);
  const [activeSectionId, setActiveSectionId] = useState<string>("all");
  const navRef = useRef<HTMLDivElement>(null);

  // تحديث الفئة دون أي قفز أو تمرير في الصفحة إطلاقاً
  const handleSelectSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
  };

  // فلترة المنتجات حسب الفئة المحددة (أو عرض الكل عند اختيار "الكل")
  const displayedGroups =
    activeSectionId === "all"
      ? groups
      : groups.filter((g) => g.id === activeSectionId);

  return (
    <div>
      {/* شريط الفئات والأقسام المطور - بارز ومصمم مثل فئات الخدمات في الصفحة الرئيسية */}
      {groups.length > 0 && (
        <div className="mb-6 rounded-2xl border bg-card p-3.5 sm:p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              أقسام ومنيو المتجر ({groups.length + 1})
            </span>
            {activeSectionId !== "all" && (
              <button
                type="button"
                onClick={() => handleSelectSection("all")}
                className="text-xs text-primary font-bold hover:underline"
              >
                عرض كل الأصناف
              </button>
            )}
          </div>
          <div
            ref={navRef}
            role="tablist"
            aria-label="أقسام ومنيو المتجر"
            className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth pb-1"
          >
            {/* زر عرض الكل */}
            <Button
              type="button"
              variant={activeSectionId === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => handleSelectSection("all")}
              className="shrink-0 gap-1.5 font-bold rounded-xl h-9 text-xs transition-all shadow-xs"
            >
              <Layers className="size-3.5" />
              <span>الكل</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  activeSectionId === "all"
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {products.length}
              </span>
            </Button>

            {/* أزرار أقسام المتجر */}
            {groups.map((group) => {
              const isActive = activeSectionId === group.id;
              return (
                <Button
                  key={group.id}
                  type="button"
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSelectSection(group.id)}
                  className="shrink-0 gap-1.5 font-bold rounded-xl h-9 text-xs transition-all shadow-xs"
                >
                  <UtensilsCrossed className="size-3.5" />
                  <span>{group.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {group.products.length}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* المنتجات المعروضة بناءً على الفئة المختارة مجمعة بذكاء بالأحجام */}
      <div className="space-y-8">
        {displayedGroups.map((group) => {
          const groupedCards = groupProductsIntoCards(group.products);

          return (
            <section
              key={group.id}
              id={`product-section-${group.id}`}
              className="space-y-4"
            >
              {/* عنوان الفئة وعدد منتجاتها */}
              <div className="flex items-center justify-between border-b pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full bg-primary" />
                  <h3 className="text-lg font-bold text-foreground">{group.name}</h3>
                </div>
                <Badge variant="outline" className="text-xs font-semibold">
                  {groupedCards.length} منتج
                </Badge>
              </div>

              {/* قائمة منتجات هذه الفئة مع دعم اختيار الحجم */}
              <div className="grid gap-4 md:grid-cols-2">
                {groupedCards.map((card) => (
                  <ProductCardItem
                    key={card.id}
                    card={card}
                    store={store}
                    cart={cart}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {!products.length && (
        <div className="py-16 text-center text-muted-foreground border rounded-2xl bg-card">
          <UtensilsCrossed className="mx-auto mb-3 size-12 text-muted-foreground/50" />
          <p className="text-base font-semibold">لا توجد منتجات مسجلة في هذا المتجر بعد</p>
        </div>
      )}
    </div>
  );
}
