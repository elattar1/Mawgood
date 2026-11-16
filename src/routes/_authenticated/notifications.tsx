import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Bell, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { notificationsQuery } from '@/lib/customer-queries';
import { readNotification } from '@/lib/customer.functions';
import { pageMeta } from '@/lib/page-meta';
import { dateAr } from '@/lib/labels';
import { CustomerError, CustomerNotFound } from '@/components/CustomerFeedback';
export const Route = createFileRoute('/_authenticated/notifications')({ loader: ({ context }) => context.queryClient.ensureQueryData(notificationsQuery), head: () => pageMeta('الإشعارات', 'آخر تحديثات طلباتك وحجوزاتك في خدمات الحسينية'), component: Notifications, errorComponent: CustomerError, notFoundComponent: CustomerNotFound });
function Notifications() {
  const { data } = useSuspenseQuery(notificationsQuery);
  const read = useServerFn(readNotification);
  const client = useQueryClient();

  async function mark(id?: string) {
    try {
      await read({ data: { id } });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['notifications'] }),
        client.invalidateQueries({ queryKey: ['unread'] }),
      ]);
    } catch {
      toast.error('تعذر تحديث الإشعارات');
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-7 flex flex-wrap justify-between gap-4">
        <h1 className="text-3xl font-bold">الإشعارات</h1>
        <Button variant="outline" disabled={!data.some((n) => !n.is_read)} onClick={() => mark()}>
          <CheckCheck className="size-4 ml-1.5" />
          قراءة الكل
        </Button>
      </div>

      <div className="space-y-3">
        {data.map((n) => {
          const targetUrl = n.link || '/orders';
          const linkText = n.link?.includes('/provider')
            ? 'معاينة في لوحة المتجر ←'
            : n.link?.includes('/delivery')
            ? 'معاينة في رادار التوصيل ←'
            : n.link?.includes('chat=')
            ? 'فتح المحادثة ←'
            : 'عرض التفاصيل ←';

          return (
            <article
              key={n.id}
              className={`rounded-2xl border p-4 transition-colors ${
                !n.is_read ? 'border-primary/40 bg-primary/5 shadow-xs' : 'bg-card'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-sans font-bold text-foreground text-sm sm:text-base">{n.title}</h2>
                    {!n.is_read && <span className="inline-block size-2 rounded-full bg-primary" />}
                  </div>
                  <p className="my-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">{n.body}</p>
                  <p className="mb-3 text-[11px] text-muted-foreground/80">{dateAr(n.created_at)}</p>

                  <div className="flex items-center gap-3">
                    <Button asChild variant="link" className="px-0 text-xs font-semibold text-primary">
                      <Link to={targetUrl} onClick={() => mark(n.id)}>
                        {linkText}
                      </Link>
                    </Button>
                    {!n.is_read && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => mark(n.id)}>
                        تحديد كمقروء
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}

        {!data.length && (
          <div className="py-16 text-center text-muted-foreground">
            <Bell className="mx-auto mb-4 size-12 opacity-40" />
            لا توجد إشعارات بعد
          </div>
        )}
      </div>
    </div>
  );
}
