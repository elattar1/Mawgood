import { AddressPicker, rememberAddress } from '@/components/AddressPicker';
import { StoreProducts } from '@/components/StoreProducts';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState, type FormEvent } from 'react';
import {
  MapPin,
  Phone,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  ArrowRight,
  Star,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { catalogQuery, storeDetailsQuery } from '@/lib/customer-queries';
import { pageMeta } from '@/lib/page-meta';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { createBooking, createServiceRequest } from '@/lib/customer.functions';
import { compressImageToWebP } from '@/lib/image-compress';
import { supabase } from '@/integrations/supabase/client';
import { TIME_SLOTS, CATEGORY_ICONS, money } from '@/lib/labels';
import { isStoreCurrentlyOpen, cleanStoreDescription } from '@/lib/store-hours';
import { CustomerError, CustomerNotFound } from '@/components/CustomerFeedback';

export const Route = createFileRoute('/stores/$storeId')({
  loader: async ({ params, context }) => {
    const [data] = await Promise.all([
      context.queryClient.ensureQueryData({
        ...catalogQuery,
        revalidateIfStale: true,
      }),
      context.queryClient.ensureQueryData({
        ...storeDetailsQuery(params.storeId),
        revalidateIfStale: true,
      }),
    ]);
    if (!data.stores.some((s) => s.id === params.storeId)) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    const s = loaderData?.stores.find((s) => s.id === params.storeId);
    const meta = pageMeta(
      s?.name ?? 'متجر غير متاح',
      s?.description || 'منتجات وحجز مواعيد وطلب خدمات في الحسينية'
    );
    if (s?.banner_url?.startsWith('https://'))
      meta.meta.push(
        { property: 'og:image', content: s.banner_url },
        { name: 'twitter:image', content: s.banner_url }
      );
    return meta;
  },
  component: StorePage,
  errorComponent: CustomerError,
  notFoundComponent: CustomerNotFound,
});

function StorePage() {
  const { storeId } = Route.useParams();
  const { data } = useSuspenseQuery(catalogQuery);
  const store = data.stores.find((s) => s.id === storeId);
  const { data: details } = useSuspenseQuery(storeDetailsQuery(storeId));
  const cart = useCart();
  const { user } = useAuth();
  const navigate = Route.useNavigate();
  const client = useQueryClient();
  const book = useServerFn(createBooking);
  const request = useServerFn(createServiceRequest);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  if (!store) return <CustomerNotFound />;
  const doctor = store.category === 'doctors';
  const service = ['maintenance', 'home'].includes(store.category);
  const products = details.products.filter((p) => p.store_id === storeId);
  const categoryName = data.categories.find((c) => c.slug === store.category)?.name || "متجر";
  const areaName = data.areas.find((a) => a.id === store.area_id)?.name || "";
  const cleanDesc = cleanStoreDescription(store.description);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || !store) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const uploaded: string[] = [];
    try {
      if (doctor) {
        await book({
          data: {
            store_id: storeId,
            patient_name: String(form.get('patient_name')),
            phone: String(form.get('phone')),
            booking_date: String(form.get('date')),
            booking_time: String(form.get('time')),
            notes: String(form.get('notes') ?? ''),
          },
        });
      } else {
        for (const file of files) {
          const compressed = await compressImageToWebP(file, { maxWidth: 1280, maxHeight: 1280 });
          const ext = compressed.type === 'image/webp' ? 'webp' : (compressed.name.split('.').pop() || 'jpg');
          const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
          const result = await supabase.storage.from('service-images').upload(path, compressed, { contentType: compressed.type });
          if (result.error) throw new Error('تعذر رفع الصور');
          uploaded.push(path);
        }
        await request({
          data: {
            store_id: storeId,
            description: String(form.get('description')),
            address: String(form.get('address')),
            phone: String(form.get('phone')),
            area_id: Number(form.get('area')) || null,
            notes: '',
            preferred_date: String(form.get('date')) || null,
            image_paths: uploaded,
          },
        });
        void rememberAddress(form);
      }
      await client.invalidateQueries({ queryKey: ['customer-orders'] });
      toast.success(doctor ? 'تم إرسال طلب الحجز' : 'تم إرسال طلب الخدمة');
      navigate({ to: '/orders' });
    } catch (error) {
      if (uploaded.length) await supabase.storage.from('service-images').remove(uploaded);
      toast.error(error instanceof Error ? error.message : 'تعذر إرسال الطلب');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* رابط العودة للمتاجر */}
      <Link to="/" className="mb-4 inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline">
        <ArrowRight size={16} />
        المتاجر والخدمات
      </Link>

      {/* 1. صورة الكفر مع الشارات العلوية */}
      <div className="relative mb-4 h-48 sm:h-60 md:h-72 w-full overflow-hidden rounded-2xl md:rounded-3xl border bg-muted shadow-soft">
        {store.banner_url || store.logo_url ? (
          <img
            src={store.banner_url || store.logo_url}
            alt={`بانر ${store.name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-primary/15 via-muted to-card flex items-center justify-center">
            <span className="text-6xl opacity-20">{CATEGORY_ICONS[store.category] || "🏪"}</span>
          </div>
        )}

        {/* تدرج فيد علوي لضمان وضوح الشارات تماماً */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/25 pointer-events-none" />

        {/* الشارات العلوية فوق صورة الكفر */}
        <div className="absolute inset-x-3.5 top-3.5 flex items-center justify-between gap-2 z-10">
          {/* نوع النشاط من فوق علي اليمين */}
          <span className="flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md border border-white/10 shadow-sm">
            <span>{CATEGORY_ICONS[store.category]}</span>
            <span>{categoryName}</span>
          </span>

          {/* مفتوح او مغلق من فوق علي الشمال زي كارت المتجر من برا */}
          {(() => {
            const hours = isStoreCurrentlyOpen(store);
            return (
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold backdrop-blur-md shadow-sm border ${
                  hours.isOpen
                    ? "bg-emerald-600/95 text-white border-emerald-400/40"
                    : "bg-black/75 text-rose-200 border-rose-500/40"
                }`}
                title={hours.reason || hours.formattedHours}
              >
                <span
                  className={`size-2 rounded-full ${
                    hours.isOpen ? "bg-emerald-300 animate-pulse" : "bg-rose-400"
                  }`}
                />
                <span>{hours.isOpen ? "مفتوح الآن" : "مغلق حاليًا"}</span>
              </span>
            );
          })()}
        </div>
      </div>

      {/* 2. الاسم تحت صورة الكفر على طول وجمب صورة المتجر ونوع المتجر حالياً */}
      <div className="mb-4 flex flex-wrap items-center gap-4 px-1">
        {store.logo_url ? (
          <img
            src={store.logo_url}
            alt={`شعار ${store.name}`}
            className="size-20 sm:size-24 shrink-0 rounded-2xl border-4 border-background object-cover shadow-md bg-card -mt-10 sm:-mt-12 relative z-10"
          />
        ) : (
          <div className="grid size-20 sm:size-24 shrink-0 place-items-center rounded-2xl border-4 border-background bg-secondary text-4xl shadow-md -mt-10 sm:-mt-12 relative z-10">
            {CATEGORY_ICONS[store.category] || "🏪"}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="break-words text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {store.name}
            </h1>
            {/* نوع المتجر حالياً */}
            <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
              {store.specialty || categoryName}
            </span>
          </div>
          {store.rating ? (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Star className="size-3.5 fill-amber-400 text-amber-400" />
              <span className="font-bold text-foreground">{Number(store.rating).toFixed(1)}</span>
              <span>•</span>
              <span>{store.reviews_count ?? 0} تقييم</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* 3. مستطيل فيه الوصف وتحته العنوان جمب علامة لوكيشن وتحته السله جمبها ايكونه تليفون فيها رقم التليفون الخاص بالمتجر */}
      <div className="mb-8 rounded-2xl border bg-card p-4 sm:p-5 shadow-soft space-y-3.5">
        {/* الوصف في الأعلى */}
        {cleanDesc && (
          <p className="text-sm sm:text-base leading-relaxed text-muted-foreground">
            {cleanDesc}
          </p>
        )}

        {/* العنوان تحته بجانب أيقونة لوكيشن */}
        <div className="flex items-start sm:items-center gap-2 text-sm text-foreground/90 font-medium">
          <MapPin className="size-4 shrink-0 text-primary mt-0.5 sm:mt-0" />
          <span>
            {store.address} {areaName ? `• ${areaName}` : ""}
          </span>
        </div>

        {/* السلة بجانبها أيقونة تليفون فيها رقم التليفون الخاص بالمتجر */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/60">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* أيقونة تليفون فيها رقم التليفون الخاص بالمتجر */}
            {store.phone && (
              <Button
                asChild
                variant="outline"
                className="gap-2 font-bold text-xs sm:text-sm h-10 border-primary/30 text-primary hover:bg-primary/10 rounded-xl"
              >
                <a href={`tel:${store.phone}`}>
                  <Phone className="size-4 text-primary" />
                  <span dir="ltr">{store.phone}</span>
                </a>
              </Button>
            )}

            {/* زر السلة بجانبها */}
            {!doctor && !service && (
              <Button
                asChild
                className="gap-2 font-bold text-xs sm:text-sm h-10 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm rounded-xl"
              >
                <Link to="/cart">
                  <ShoppingCart className="size-4" />
                  <span>السلة ({cart.count})</span>
                </Link>
              </Button>
            )}
          </div>

          {/* رسوم التوصيل المقررة */}
          {!doctor && !service && (
            <div className="text-xs text-muted-foreground font-medium">
              رسوم التوصيل المقررة: <strong className="text-primary font-bold">{money(store.delivery_fee)}</strong>
            </div>
          )}
        </div>
      </div>

      {!doctor && !service ? (
        <StoreProducts
          store={store}
          products={products}
          sections={details.sections ?? []}
        />
      ) : (
        <section className="max-w-2xl">
          <h2 className="mb-5 flex items-center gap-2 text-xl">
            <CalendarDays />
            {doctor ? 'حجز موعد' : 'طلب خدمة منزلية'}
          </h2>
          {doctor && (
            <p className="mb-5 text-primary">
              {store.specialty} • رسوم الحجز {money(store.booking_fee)}
            </p>
          )}

          {!user ? (
            <Button asChild>
              <Link to="/auth" search={{ redirect: `/stores/${storeId}` }}>
                سجل الدخول {doctor ? 'للحجز' : 'لطلب الخدمة'}
              </Link>
            </Button>
          ) : (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              {doctor ? (
                <label className="space-y-2 text-sm">
                  اسم المريض
                  <Input name="patient_name" required minLength={2} />
                </label>
              ) : (
                <label className="space-y-2 text-sm sm:col-span-2">
                  تفاصيل الخدمة
                  <textarea
                    name="description"
                    required
                    minLength={5}
                    className="min-h-28 w-full rounded-md border bg-card p-3"
                  />
                </label>
              )}

              {doctor ? (
                <label className="space-y-2 text-sm">
                  رقم الهاتف
                  <Input name="phone" type="tel" required minLength={6} />
                </label>
              ) : (
                <div className="sm:col-span-2">
                  <AddressPicker areas={data.areas} defaultArea={store.area_id} />
                </div>
              )}

              <label className="space-y-2 text-sm">
                {doctor ? 'تاريخ الحجز' : 'التاريخ المفضل (اختياري)'}
                <Input name="date" type="date" min={today} required={doctor} />
              </label>

              {doctor && (
                <>
                  <label className="space-y-2 text-sm">
                    الموعد
                    <select
                      name="time"
                      className="h-10 w-full rounded-md border bg-card px-3"
                    >
                      {TIME_SLOTS.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm sm:col-span-2">
                    ملاحظات
                    <Input name="notes" />
                  </label>
                </>
              )}

              {service && (
                <label className="space-y-2 text-sm sm:col-span-2">
                  صور الخدمة (اختياري)
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={(e) => {
                      const chosen = Array.from(e.target.files ?? []);
                      if (
                        chosen.length > 5 ||
                        chosen.some(
                          (f) =>
                            f.size > 5 * 1024 * 1024 ||
                            !['image/jpeg', 'image/png', 'image/webp'].includes(f.type)
                        )
                      ) {
                        toast.error('اختر حتى 5 صور، كل صورة أقل من 5 ميجابايت');
                        e.target.value = '';
                        setFiles([]);
                      } else setFiles(chosen);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {files.length ? `${files.length} صور مرفقة` : 'السعر يحدده مقدم الخدمة'}
                  </p>
                </label>
              )}

              <Button
                className="sm:col-span-2"
                type="submit"
                disabled={busy || !store.is_open}
              >
                {busy ? 'جاري الإرسال...' : doctor ? 'إرسال طلب الحجز' : 'إرسال طلب الخدمة'}
              </Button>
            </form>
          )}
        </section>
      )}

      <section className="mt-10 border-t pt-6">
        <h2 className="mb-5 text-xl">تقييمات العملاء</h2>
        {details.reviews
          .filter((r) => r.store_id === storeId)
          .map((r) => (
            <article key={r.id} className="border-b py-4">
              <p className="flex items-center gap-2 font-semibold">
                {r.author_name}
                <Star size={14} className="text-accent" />
                {r.rating}/5
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{r.comment}</p>
            </article>
          ))}
        {!details.reviews.some((r) => r.store_id === storeId) && (
          <p className="text-sm text-muted-foreground">لا توجد تقييمات بعد</p>
        )}
      </section>
    </div>
  );
}
