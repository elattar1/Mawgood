import { useMemo, useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, LoaderCircle, Search, Sparkles, CheckCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  getCategoryCatalog,
  type TemplateItem,
  type CategoryCatalogConfig,
} from "@/lib/template-catalogs";
import { getDynamicCategoryCatalog } from "@/lib/template-catalog.functions";
import { importCatalogProducts } from "@/lib/dashboard.functions";

type Pick = { price: string; qty: string };
type Existing = { catalog_key: string | null; price: number; stock_qty: number | null };

export function CatalogPicker({
  storeId,
  storeCategory = "supermarkets",
  storeName,
  existing,
  open,
  onOpenChange,
}: {
  storeId: string;
  storeCategory?: string;
  storeName?: string;
  existing: Existing[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const client = useQueryClient();
  const doImport = useServerFn(importCatalogProducts);
  const owned = useMemo(
    () => new Map(existing.filter((p) => p.catalog_key).map((p) => [p.catalog_key as string, p])),
    [existing]
  );

  const doFetchDynamic = useServerFn(getDynamicCategoryCatalog);
  const { data: dynamicConfig } = useQuery({
    queryKey: ["dynamic-catalog", storeCategory],
    queryFn: () => doFetchDynamic({ data: storeCategory }),
    staleTime: 60_000,
  });

  // Load category-tailored catalog (Pharmacies / Supermarkets / Restaurants) with live admin customizations
  const catalogConfig: CategoryCatalogConfig = useMemo(() => {
    return (
      dynamicConfig ??
      getCategoryCatalog(storeCategory) ??
      getCategoryCatalog("supermarkets")!
    );
  }, [dynamicConfig, storeCategory]);

  const [group, setGroup] = useState<string>(catalogConfig.groups[0]?.key ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [busy, setBusy] = useState(false);

  // Update default active group when category changes
  useEffect(() => {
    if (catalogConfig.groups[0]) {
      setGroup(catalogConfig.groups[0].key);
    }
    setPicks({});
    setSearchQuery("");
  }, [catalogConfig]);

  const selected = Object.keys(picks);

  function toggle(key: string, price: number) {
    setPicks((p) => {
      const next = { ...p };
      if (next[key]) {
        delete next[key];
      } else {
        const o = owned.get(key);
        next[key] = {
          price: String(o?.price ?? price),
          qty: o?.stock_qty != null ? String(o.stock_qty) : "",
        };
      }
      return next;
    });
  }

  function selectAllInCurrentView(itemsToSelect: TemplateItem[]) {
    setPicks((p) => {
      const next = { ...p };
      for (const item of itemsToSelect) {
        if (!next[item.key]) {
          const o = owned.get(item.key);
          next[item.key] = {
            price: String(o?.price ?? item.price),
            qty: o?.stock_qty != null ? String(o.stock_qty) : "",
          };
        }
      }
      return next;
    });
  }

  function deselectAllInCurrentView(itemsToDeselect: TemplateItem[]) {
    setPicks((p) => {
      const next = { ...p };
      for (const item of itemsToDeselect) {
        delete next[item.key];
      }
      return next;
    });
  }

  async function submit() {
    const items = selected.map((key) => ({
      key,
      price: Number(picks[key]!.price),
      stock_qty: picks[key]!.qty === "" ? null : Number(picks[key]!.qty),
    }));

    if (
      items.some(
        (i) =>
          !(i.price >= 0) ||
          (i.stock_qty !== null && !(Number.isInteger(i.stock_qty) && i.stock_qty >= 0))
      )
    ) {
      toast.error("راجع الأسعار والكميات المدخلة للتأكد من صحتها");
      return;
    }

    setBusy(true);
    try {
      const r = await doImport({ data: { store_id: storeId, items } });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
      await client.invalidateQueries({ queryKey: ["catalog"] });
      toast.success(`تمت إضافة/تحديث ${r.count} منتج بنجاح في متجرك`);
      setPicks({});
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر حفظ المنتجات");
    } finally {
      setBusy(false);
    }
  }

  const currentGroup =
    catalogConfig.groups.find((g) => g.key === group) ?? catalogConfig.groups[0]!;

  // Items to display: either filtered by search across whole catalog, or filtered by selected group
  const displayedItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return catalogConfig.items.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.genericName && item.genericName.toLowerCase().includes(q)) ||
          (item.brand && item.brand.toLowerCase().includes(q)) ||
          item.size.toLowerCase().includes(q)
      );
    }
    return catalogConfig.items.filter((i) => i.group === group);
  }, [catalogConfig.items, group, searchQuery]);

  const allDisplayedSelected =
    displayedItems.length > 0 && displayedItems.every((item) => !!picks[item.key]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b pb-3">
          <div>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <Sparkles className="size-5 text-amber-500" />
                {catalogConfig.title}
              </DialogTitle>
              <Badge variant="secondary" className="text-xs font-semibold">
                {catalogConfig.badge}
              </Badge>
            </div>
            <DialogDescription className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {catalogConfig.subtitle}
              {storeName && <span className="block mt-0.5 font-bold text-foreground">لـ «{storeName}»</span>}
            </DialogDescription>
          </div>
        </div>

        {/* خانة البحث السريع داخل الكتالوج */}
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={
              storeCategory === "pharmacies"
                ? "ابحث باسم الدواء التجاري أو العلمي (مثل: بانادول، بروفين، باراسيتامول)..."
                : storeCategory === "restaurants"
                  ? "ابحث عن أكلة، برجر، بيتزا، مشروب، حواوشي..."
                  : "ابحث عن منتج، براند، أو صنف (مثل: جهينة، عبور لاند، شيبسي)..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 pl-8 text-sm h-10 rounded-xl"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-5 grid place-items-center text-muted-foreground hover:text-foreground"
              title="مسح البحث"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* أقسام وفئات الكتالوج (تظهر إذا لم يكن هناك بحث نشط) */}
        {!searchQuery && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-56 overflow-y-auto p-1.5 border rounded-2xl bg-muted/20">
            {catalogConfig.groups.map((g) => {
              const n = catalogConfig.items.filter(
                (i) => i.group === g.key && picks[i.key]
              ).length;
              const isSelected = group === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGroup(g.key)}
                  className={`group relative overflow-hidden rounded-xl border-2 text-xs transition-all text-right ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20 shadow-sm"
                      : "border-border/60 hover:border-primary/50"
                  }`}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-muted">
                    <img
                      src={g.image}
                      alt={g.name}
                      width={200}
                      height={200}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  </div>
                  <span className="block bg-card p-1.5 font-bold leading-tight truncate text-[11px]">
                    {g.name}
                  </span>
                  {n > 0 && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* رأس قائمة الأصناف المعروضة مع زر تحديد/إلغاء الكل */}
        <div className="mt-4 flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm sm:text-base text-foreground">
              {searchQuery ? `نتائج البحث عن «${searchQuery}»` : currentGroup?.name}
            </h3>
            <span className="text-xs text-muted-foreground">({displayedItems.length} صنف)</span>
          </div>

          {displayedItems.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (allDisplayedSelected) {
                  deselectAllInCurrentView(displayedItems);
                } else {
                  selectAllInCurrentView(displayedItems);
                }
              }}
              className="h-8 gap-1 text-xs font-bold text-primary hover:bg-primary/10"
            >
              <CheckCheck className="size-3.5" />
              <span>{allDisplayedSelected ? "إلغاء تحديد المعروض" : "تحديد كل المعروض"}</span>
            </Button>
          )}
        </div>

        {/* قائمة الأصناف والمنتجات بصورها الحقيقية */}
        <div className="divide-y border-b max-h-[50vh] overflow-y-auto pr-1">
          {displayedItems.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Search className="size-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">لم يتم العثور على أصناف مطابقة للبحث</p>
            </div>
          ) : (
            displayedItems.map((item) => {
              const pick = picks[item.key];
              const has = owned.has(item.key);
              const productImage = item.image || currentGroup?.image;

              return (
                <div
                  key={item.key}
                  className={`py-3 transition-colors rounded-xl px-2 my-1 ${
                    pick ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/40"
                  }`}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="size-5 mt-1 accent-primary rounded cursor-pointer shrink-0"
                      checked={!!pick}
                      onChange={() => toggle(item.key, item.price)}
                    />

                    {/* صورة المنتج الحقيقية الواضحة */}
                    <div className="relative size-14 shrink-0 rounded-xl overflow-hidden border bg-muted shadow-xs">
                      <img
                        src={productImage}
                        alt={item.name}
                        width={56}
                        height={56}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          // صورة بديلة إذا لم تتوفر الصورة
                          (e.currentTarget as HTMLImageElement).src =
                            currentGroup?.image ||
                            "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&auto=format&fit=crop&q=80";
                        }}
                      />
                    </div>

                    {/* تفاصيل المنتج: الاسم، البراند، والاسم العلمي إن وُجد */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-sm text-foreground break-words">
                          {item.name}
                        </span>
                        {item.brand && (
                          <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 h-4">
                            {item.brand}
                          </Badge>
                        )}
                      </div>

                      {/* الاسم العلمي في الصيدليات */}
                      {item.genericName && (
                        <p className="mt-0.5 text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold truncate">
                          {item.genericName}
                        </p>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold px-2 py-0.5 rounded-md bg-muted text-foreground border border-border/50 text-[11px]">
                          {item.size}
                        </span>
                        <span>•</span>
                        <span className="text-primary font-bold">
                          سعر مقترح: {item.price} ج.م
                        </span>
                      </div>
                    </div>

                    {has && (
                      <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">
                        <Check className="size-3" /> مضاف بمتجرك
                      </span>
                    )}
                  </label>

                  {/* خانة تعديل السعر والكمية عند التحديد */}
                  {pick && (
                    <div className="mt-2.5 grid grid-cols-2 gap-3 pr-8 sm:pr-12 pt-2 border-t border-border/40">
                      <div>
                        <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                          سعر البيع بمتجرك (ج.م)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step="0.5"
                          value={pick.price}
                          onChange={(e) =>
                            setPicks((p) => ({
                              ...p,
                              [item.key]: { ...pick, price: e.target.value },
                            }))
                          }
                          className="h-8 text-xs font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                          الكمية المتاحة (اختياري)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="متوفر باستمرار"
                          value={pick.qty}
                          onChange={(e) =>
                            setPicks((p) => ({
                              ...p,
                              [item.key]: { ...pick, qty: e.target.value },
                            }))
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* شريط الإجراءات السفلي */}
        <div className="sticky bottom-0 -mb-2 flex items-center justify-between gap-3 bg-background/95 backdrop-blur pt-3 border-t">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <span className="text-muted-foreground">المحدد للإضافة:</span>
            <span className="font-extrabold text-primary px-2 py-0.5 rounded-md bg-primary/10">
              {selected.length} منتج
            </span>
          </div>
          <Button
            disabled={!selected.length || busy}
            onClick={submit}
            className="gap-2 font-bold shadow-md text-xs sm:text-sm h-10 px-4"
          >
            {busy && <LoaderCircle className="animate-spin size-4" />}
            <span>إضافة المنتجات المحددة لمتجري ({selected.length})</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
