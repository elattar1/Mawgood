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

type Product = {
  id: string;
  store_id: string;
  name: string;
  description: string;
  price: number;
  is_available: boolean;
  image_url: string | null;
  section_id: string | null;
};

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

      {/* المنتجات المعروضة بناءً على الفئة المختارة */}
      <div className="space-y-8">
        {displayedGroups.map((group) => (
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
                {group.products.length} صنف
              </Badge>
            </div>

            {/* قائمة منتجات هذه الفئة */}
            <div className="grid gap-4 md:grid-cols-2">
              {group.products.map((product) => {
                const itemInCart = cart.items.find((i) => i.product_id === product.id);
                const qty = itemInCart?.qty ?? 0;
                return (
                  <article
                    className="flex min-w-0 items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft transition-all hover:border-primary/40 hover:shadow-hover"
                    key={product.id}
                  >
                    {product.image_url ? (
                      <img
                        src={resolveProductImageUrl(product.image_url, store.category) ?? product.image_url}
                        alt={product.name}
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
                          {store.category === 'pharmacies' ? 'دواء' : store.category === 'restaurants' ? 'وجبة' : 'منتج'}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="break-words font-sans font-bold text-base text-foreground">
                        {product.name}
                      </h4>
                      {product.description && (
                        <p className="my-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {product.description}
                        </p>
                      )}
                      <p className="font-bold text-primary text-sm mt-1">{money(product.price)}</p>
                    </div>

                    {/* زر الإضافة أو عداد الكمية */}
                    <div className="shrink-0">
                      {qty === 0 ? (
                        <Button
                          size="icon"
                          className="size-9 rounded-xl shadow-sm transition-transform active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90"
                          aria-label={`إضافة ${product.name} للسلة`}
                          title={`إضافة ${product.name}`}
                          disabled={!product.is_available || !store.is_open}
                          onClick={() => {
                            if (
                              cart.add(store, {
                                product_id: product.id,
                                name: product.name,
                                price: Number(product.price),
                              })
                            ) {
                              toast.success(`تمت إضافة ${product.name} للسلة`);
                            }
                          }}
                        >
                          <Plus className="size-4" />
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
                              cart.setQty(product.id, qty - 1);
                              if (qty === 1) {
                                toast.info(`تم حذف ${product.name} من السلة`);
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
                            disabled={!product.is_available || !store.is_open}
                            onClick={() => {
                              cart.setQty(product.id, qty + 1);
                            }}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
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
