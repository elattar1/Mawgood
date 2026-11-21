import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Sparkles,
  Search,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Layers,
  Check,
  Package,
  FolderEdit,
  X,
  LoaderCircle,
  Tag,
  DollarSign,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getAdminCatalogData,
  saveAdminCatalogItem,
  deleteAdminCatalogItem,
  resetAdminCatalogItem,
  saveAdminCatalogGroup,
} from "@/lib/template-catalog.functions";
import type {
  TemplateItem,
  TemplateGroup,
  CategoryCatalogConfig,
} from "@/lib/template-catalogs";
import { money } from "@/lib/labels";

export function AdminCatalogManager() {
  const queryClient = useQueryClient();
  const doFetchData = useServerFn(getAdminCatalogData);
  const doSaveItem = useServerFn(saveAdminCatalogItem);
  const doDeleteItem = useServerFn(deleteAdminCatalogItem);
  const doResetItem = useServerFn(resetAdminCatalogItem);
  const doSaveGroup = useServerFn(saveAdminCatalogGroup);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-catalog-data"],
    queryFn: () => doFetchData(),
  });

  const [activeCategory, setActiveCategory] = useState<string>("supermarkets");
  const [activeGroup, setActiveGroup] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Edit / Add Item Dialog State
  const [editItem, setEditItem] = useState<{
    item: Partial<TemplateItem> & { isNew?: boolean };
    open: boolean;
  }>({ item: {}, open: false });

  // Edit Group Dialog State
  const [editGroup, setEditGroup] = useState<{
    group: Partial<TemplateGroup> | null;
    open: boolean;
  }>({ group: null, open: false });

  const [busy, setBusy] = useState(false);

  // Active Category Config
  const currentCategoryConfig: CategoryCatalogConfig | undefined = useMemo(() => {
    return data?.categories?.find((c) => c.category === activeCategory);
  }, [data?.categories, activeCategory]);

  const groups = currentCategoryConfig?.groups ?? [];
  const items = currentCategoryConfig?.items ?? [];

  // Filtered items
  const filteredItems = useMemo(() => {
    let list = items;
    if (activeGroup !== "all") {
      list = list.filter((i) => i.group === activeGroup);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.brand && i.brand.toLowerCase().includes(q)) ||
          (i.genericName && i.genericName.toLowerCase().includes(q)) ||
          i.size.toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, activeGroup, searchQuery]);

  const [renderLimit, setRenderLimit] = useState(60);

  useMemo(() => {
    setRenderLimit(60);
  }, [activeCategory, activeGroup, searchQuery]);

  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, renderLimit);
  }, [filteredItems, renderLimit]);

  // Status counters
  const stats = useMemo(() => {
    const overridesCount = Object.keys(data?.overrides ?? {}).length;
    const customCount = data?.customItems?.length ?? 0;
    return {
      total: items.length,
      groupsCount: groups.length,
      overridesCount,
      customCount,
    };
  }, [items, groups, data]);

  // Handle Save Item
  const handleSaveItemSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const key = String(form.get("key") || "").trim();
    const name = String(form.get("name") || "").trim();
    const size = String(form.get("size") || "").trim();
    const price = Number(form.get("price"));
    const brand = String(form.get("brand") || "").trim();
    const group = String(form.get("group") || "").trim();
    const image = String(form.get("image") || "").trim();
    const genericName = String(form.get("genericName") || "").trim();

    if (!name || !size || !(price >= 0) || !group || !image) {
      toast.error("يرجى ملء جميع الحقول المطلوبة بشكل صحيح");
      return;
    }

    setBusy(true);
    try {
      await doSaveItem({
        data: {
          key: key || `custom-${activeCategory}-${Date.now()}`,
          category: activeCategory as any,
          group,
          name,
          size,
          price,
          brand: brand || undefined,
          genericName: genericName || undefined,
          image,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-catalog-data"] });
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
      toast.success(editItem.item.isNew ? "تمت إضافة الصنف للكتالوج بنجاح" : "تم تحديث الصنف بالكتالوج بنجاح");
      setEditItem({ item: {}, open: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ الصنف");
    } finally {
      setBusy(false);
    }
  };

  // Handle Delete Item
  const handleDeleteItem = async (key: string, name: string) => {
    if (!confirm(`هل أنت متأكد من حذف الصنف «${name}» من الكتالوج الجاهز؟`)) return;

    setBusy(true);
    try {
      await doDeleteItem({ data: { key } });
      await queryClient.invalidateQueries({ queryKey: ["admin-catalog-data"] });
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
      toast.success(`تم حذف «${name}» من الكتالوج بنجاح`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حذف الصنف");
    } finally {
      setBusy(false);
    }
  };

  // Handle Reset Item (revert back to system default)
  const handleResetItem = async (key: string, name: string) => {
    if (!confirm(`إعادة تعيين «${name}» إلى بياناته الأصلية الافتراضية؟`)) return;

    setBusy(true);
    try {
      await doResetItem({ data: { key } });
      await queryClient.invalidateQueries({ queryKey: ["admin-catalog-data"] });
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
      toast.success(`تمت استعادة البيانات الأصلية لـ «${name}»`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر استعادة البيانات");
    } finally {
      setBusy(false);
    }
  };

  // Handle Save Group
  const handleSaveGroupSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editGroup.group?.key) return;
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const image = String(form.get("image") || "").trim();

    if (!name || !image) {
      toast.error("يرجى ملء اسم القسم ورابط الصورة");
      return;
    }

    setBusy(true);
    try {
      await doSaveGroup({
        data: {
          category: activeCategory as any,
          groupKey: editGroup.group.key,
          name,
          image,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-catalog-data"] });
      toast.success("تم تحديث بيانات القسم بالكتالوج بنجاح");
      setEditGroup({ group: null, open: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحديث القسم");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* رأس الصفحة والإحصائيات السريعة */}
      <div className="rounded-2xl border bg-card p-4 sm:p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-amber-500" />
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                إدارة وتعديل الكتالوج الجاهز للمتاجر
              </h2>
              <Badge variant="secondary" className="font-bold text-xs bg-primary/10 text-primary">
                لوحة الإدارة
              </Badge>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              تحكم بجميع الأصناف، الأحجام، البراندات، والأسعار المقترحة التي تظهر لأصحاب المحلات للاستيراد السريع بمركز الحسينية.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setEditItem({
                  item: {
                    isNew: true,
                    category: activeCategory as any,
                    group: groups[0]?.key || "dairy",
                    price: 20,
                    size: "عبوة قياسية",
                    image: groups[0]?.image || "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&auto=format&fit=crop&q=80",
                  },
                  open: true,
                });
              }}
              className="gap-2 font-bold shadow-soft h-10 px-4 text-xs sm:text-sm"
            >
              <Plus className="size-4" />
              <span>إضافة صنف جديد للكتالوج</span>
            </Button>
          </div>
        </div>

        {/* بطاقات الإحصائيات */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border bg-muted/30 p-3 text-right">
            <span className="text-[11px] font-semibold text-muted-foreground">إجمالي الأصناف المتاحة</span>
            <p className="text-lg sm:text-xl font-bold text-foreground mt-0.5">{stats.total} صنف</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3 text-right">
            <span className="text-[11px] font-semibold text-muted-foreground">عدد الأقسام والتصنيفات</span>
            <p className="text-lg sm:text-xl font-bold text-primary mt-0.5">{stats.groupsCount} قسم</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3 text-right">
            <span className="text-[11px] font-semibold text-muted-foreground">أصناف تم تعديلها</span>
            <p className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{stats.overridesCount} صنف</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-3 text-right">
            <span className="text-[11px] font-semibold text-muted-foreground">أصناف جديدة مضافة</span>
            <p className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{stats.customCount} صنف</p>
          </div>
        </div>
      </div>

      {/* تبديل الكتالوج الرئيسي: سوبر ماركت / صيدلية / مطعم */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Button
          type="button"
          variant={activeCategory === "supermarkets" ? "default" : "outline"}
          onClick={() => {
            setActiveCategory("supermarkets");
            setActiveGroup("all");
          }}
          className="gap-2 font-bold rounded-xl text-xs sm:text-sm h-9"
        >
          <span>🛒 السوبر ماركت والبقالة (16 قسماً)</span>
        </Button>
        <Button
          type="button"
          variant={activeCategory === "pharmacies" ? "default" : "outline"}
          onClick={() => {
            setActiveCategory("pharmacies");
            setActiveGroup("all");
          }}
          className="gap-2 font-bold rounded-xl text-xs sm:text-sm h-9"
        >
          <span>💊 الصيدليات والمستلزمات الطبية</span>
        </Button>
        <Button
          type="button"
          variant={activeCategory === "restaurants" ? "default" : "outline"}
          onClick={() => {
            setActiveCategory("restaurants");
            setActiveGroup("all");
          }}
          className="gap-2 font-bold rounded-xl text-xs sm:text-sm h-9"
        >
          <span>🍽️ المطاعم والكافيهات</span>
        </Button>
      </div>

      {/* شريط الأقسام والفئات للكتالوج النشط */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" />
            أقسام وفئات «{currentCategoryConfig?.title ?? ""}»:
          </span>
          {activeGroup !== "all" && (
            <button
              type="button"
              onClick={() => setActiveGroup("all")}
              className="text-xs text-primary font-bold hover:underline"
            >
              عرض كل الأقسام ({items.length})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <Button
            type="button"
            size="sm"
            variant={activeGroup === "all" ? "default" : "outline"}
            onClick={() => setActiveGroup("all")}
            className="shrink-0 rounded-xl h-8 text-xs font-bold gap-1"
          >
            <span>كل الأقسام</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-primary-foreground/20">
              {items.length}
            </span>
          </Button>

          {groups.map((g) => {
            const count = items.filter((i) => i.group === g.key).length;
            const isSelected = activeGroup === g.key;
            return (
              <div key={g.key} className="shrink-0 flex items-center gap-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => setActiveGroup(g.key)}
                  className="rounded-xl h-8 text-xs font-bold gap-1.5"
                >
                  <span>{g.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-muted text-muted-foreground">
                    {count}
                  </span>
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditGroup({ group: g, open: true })}
                  className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                  title="تعديل اسم أو صورة هذا القسم"
                >
                  <Pencil className="size-3" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* البحث في الكتالوج */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="ابحث في الكتالوج بالاسم، الماركة، الحجم، أو الاسم العلمي..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-9 pl-8 text-sm h-10 rounded-xl"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-5 grid place-items-center text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* قائمة المنتجات المعروضة في الكتالوج */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>نتائج العرض: <strong>{filteredItems.length}</strong> صنف</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground">
            <LoaderCircle className="size-8 mx-auto mb-2 animate-spin text-primary" />
            <p className="text-sm font-medium">جاري تحميل بيانات الكتالوج...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground border rounded-2xl bg-card">
            <Package className="size-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">لم يتم العثور على أصناف مطابقة للبحث</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map((item) => {
              const isOverridden = !!data?.overrides?.[item.key];
              const isCustom = data?.customItems?.some((c) => c.key === item.key);
              const groupObj = groups.find((g) => g.key === item.group);

              return (
                <div
                  key={item.key}
                  className="flex flex-col justify-between rounded-2xl border bg-card p-3.5 shadow-soft transition-all hover:border-primary/40 hover:shadow-hover"
                >
                  <div>
                    <div className="flex items-start gap-3">
                      <div className="relative size-16 shrink-0 rounded-xl overflow-hidden border bg-muted shadow-xs">
                        <img
                          src={item.image || groupObj?.image}
                          alt={item.name}
                          width={64}
                          height={64}
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              groupObj?.image ||
                              "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=200&auto=format&fit=crop&q=80";
                          }}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="font-bold text-sm text-foreground break-words leading-tight">
                            {item.name}
                          </h4>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {item.brand && (
                            <Badge variant="outline" className="font-bold px-1.5 py-0 h-4 text-[10px]">
                              {item.brand}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="font-semibold px-1.5 py-0 h-4 text-[10px]">
                            {item.size}
                          </Badge>
                          {groupObj && (
                            <span className="text-muted-foreground text-[10px]">
                              {groupObj.name}
                            </span>
                          )}
                        </div>

                        {item.genericName && (
                          <p className="mt-0.5 text-[11px] font-mono text-emerald-700 dark:text-emerald-400 font-semibold truncate">
                            {item.genericName}
                          </p>
                        )}

                        <div className="mt-1.5 flex items-baseline gap-2">
                          <span className="font-extrabold text-primary text-sm sm:text-base">
                            {money(item.price)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">سعر مقترح</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* شريط الإجراءات والتحكم للصنف */}
                  <div className="mt-3 pt-2.5 border-t flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      {isCustom ? (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold">
                          صنف مضاف
                        </Badge>
                      ) : isOverridden ? (
                        <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold">
                          معدل من الأدمن
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground font-medium">افتراضي</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {isOverridden && !isCustom && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleResetItem(item.key, item.name)}
                          className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                          title="استعادة البيانات الأصلية الافتراضية"
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setEditItem({
                            item: { ...item },
                            open: true,
                          })
                        }
                        className="size-7 rounded-lg text-primary hover:bg-primary/10"
                        title="تعديل هذا الصنف بالكتالوج"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteItem(item.key, item.name)}
                        className="size-7 rounded-lg text-destructive hover:bg-destructive/10"
                        title="حذف من الكتالوج الجاهز"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>

            {filteredItems.length > renderLimit && (
              <div className="py-4 text-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRenderLimit((prev) => prev + 60)}
                  className="gap-2 font-bold rounded-xl text-xs h-9 px-4"
                >
                  <span>عرض المزيد ({filteredItems.length - renderLimit} صنف إضافي)</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* نافذة إضافة / تعديل صنف في الكتالوج */}
      <Dialog
        open={editItem.open}
        onOpenChange={(open) => {
          if (!open && !busy) setEditItem({ item: {}, open: false });
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-4 sm:p-6">
          <div className="border-b pb-3">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Pencil className="size-4 text-primary" />
              {editItem.item.isNew ? "إضافة صنف جديد للكتالوج" : "تعديل صنف في الكتالوج"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">
              الأصناف المضافة أو المعدلة ستظهر لجميع أصحاب المحلات المعتمدة بمركز الحسينية.
            </DialogDescription>
          </div>

          <form onSubmit={handleSaveItemSubmit} className="space-y-3.5 pt-2">
            <input type="hidden" name="key" defaultValue={editItem.item.key || ""} />

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                اسم المنتج بالعربية <span className="text-destructive">*</span>
              </label>
              <Input
                name="name"
                defaultValue={editItem.item.name || ""}
                placeholder="مثال: أرز مصري الساعة"
                required
                className="text-sm rounded-xl h-9 font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  القسم أو التصنيف <span className="text-destructive">*</span>
                </label>
                <select
                  name="group"
                  defaultValue={editItem.item.group || groups[0]?.key || ""}
                  required
                  className="w-full rounded-xl border bg-background px-3 py-1.5 text-xs font-bold text-foreground focus:ring-2 focus:ring-primary h-9"
                >
                  {groups.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  العلامة التجارية (البراند)
                </label>
                <Input
                  name="brand"
                  defaultValue={editItem.item.brand || ""}
                  placeholder="مثال: جهينة، دومتي، الضحى"
                  className="text-xs rounded-xl h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  الحجم / الوزن / العبوة <span className="text-destructive">*</span>
                </label>
                <Input
                  name="size"
                  defaultValue={editItem.item.size || ""}
                  placeholder="مثال: 1 كجم، 500 مل، 105جم"
                  required
                  className="text-xs rounded-xl h-9"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  السعر المقترح بالسوق (ج.م) <span className="text-destructive">*</span>
                </label>
                <Input
                  name="price"
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={editItem.item.price ?? 20}
                  required
                  className="text-xs rounded-xl h-9 font-bold text-primary"
                />
              </div>
            </div>

            {activeCategory === "pharmacies" && (
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  الاسم العلمي والتركيز (للأدوية)
                </label>
                <Input
                  name="genericName"
                  defaultValue={editItem.item.genericName || ""}
                  placeholder="مثال: Paracetamol 500mg"
                  className="text-xs font-mono rounded-xl h-9"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                رابط صورة المنتج (HTTPS URL) <span className="text-destructive">*</span>
              </label>
              <Input
                name="image"
                defaultValue={editItem.item.image || ""}
                placeholder="https://..."
                required
                className="text-xs rounded-xl h-9 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditItem({ item: {}, open: false })}
                className="rounded-xl text-xs h-9"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="rounded-xl text-xs h-9 font-bold gap-1.5"
              >
                {busy && <LoaderCircle className="size-3.5 animate-spin" />}
                <span>{editItem.item.isNew ? "إضافة الصنف الآن" : "حفظ التعديلات"}</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* نافذة تعديل بيانات القسم */}
      <Dialog
        open={editGroup.open}
        onOpenChange={(open) => {
          if (!open && !busy) setEditGroup({ group: null, open: false });
        }}
      >
        <DialogContent className="max-w-md p-4 sm:p-6">
          <div className="border-b pb-3">
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <FolderEdit className="size-4 text-primary" />
              تعديل بيانات القسم
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">
              تعديل الاسم أو صورة الغلاف للقسم بالكتالوج.
            </DialogDescription>
          </div>

          <form onSubmit={handleSaveGroupSubmit} className="space-y-3.5 pt-2">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                اسم القسم
              </label>
              <Input
                name="name"
                defaultValue={editGroup.group?.name || ""}
                required
                className="text-sm rounded-xl h-9 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                رابط صورة غلاف القسم (HTTPS URL)
              </label>
              <Input
                name="image"
                defaultValue={editGroup.group?.image || ""}
                required
                className="text-xs rounded-xl h-9 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setEditGroup({ group: null, open: false })}
                className="rounded-xl text-xs h-9"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="rounded-xl text-xs h-9 font-bold gap-1.5"
              >
                {busy && <LoaderCircle className="size-3.5 animate-spin" />}
                <span>حفظ بيانات القسم</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
