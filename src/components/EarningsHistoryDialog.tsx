import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Wallet, CalendarDays } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDriverBoard } from "@/lib/delivery.functions";
import { getDashboard } from "@/lib/dashboard.functions";
import { driverWallet } from "@/lib/delivery-rules";
import { ledgerRowsFrom } from "@/lib/dashboard-rules";
import { filterDriverHistory, filterPartnerHistory, rangeBounds, type HistoryRange } from "@/lib/earnings-history";
import { money, dateAr } from "@/lib/labels";

interface EarningsHistoryDialogProps {
  role: "driver" | "partner";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RANGE_LABELS: { key: HistoryRange; label: string }[] = [
  { key: "week", label: "آخر أسبوع" },
  { key: "month", label: "آخر شهر" },
  { key: "custom", label: "فترة مخصصة" },
  { key: "all", label: "كل الفترات" },
];

export function EarningsHistoryDialog({ role, open, onOpenChange }: EarningsHistoryDialogProps) {
  const [range, setRange] = useState<HistoryRange>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const driverQuery = useQuery({
    queryKey: ["earnings-history", "driver"],
    queryFn: () => getDriverBoard(),
    enabled: open && role === "driver",
  });
  const partnerQuery = useQuery({
    queryKey: ["earnings-history", "partner"],
    queryFn: () => getDashboard({ data: { admin: false } }),
    enabled: open && role === "partner",
  });

  const active = role === "driver" ? driverQuery : partnerQuery;

  const bounds = useMemo(
    () => rangeBounds(range, new Date(), customFrom || undefined, customTo || undefined),
    [range, customFrom, customTo],
  );

  const driverRows = useMemo(
    () => (role === "driver" && driverQuery.data ? filterDriverHistory(driverQuery.data.mine, bounds) : []),
    [role, driverQuery.data, bounds],
  );
  const partnerRows = useMemo(
    () => (role === "partner" && partnerQuery.data ? filterPartnerHistory(ledgerRowsFrom(partnerQuery.data), bounds) : []),
    [role, partnerQuery.data, bounds],
  );

  const driverTotals = useMemo(
    () => (role === "driver" ? driverWallet(driverRows) : null),
    [role, driverRows],
  );
  const partnerTotals = useMemo(() => {
    if (role !== "partner") return null;
    return partnerRows.reduce(
      (sum, row) => ({
        gross: sum.gross + row.amount,
        commission: sum.commission + row.commission,
        net: sum.net + row.amount - row.commission,
        count: sum.count + 1,
      }),
      { gross: 0, commission: 0, net: 0, count: 0 },
    );
  }, [role, partnerRows]);

  const title = role === "driver" ? "أرباحي وسجل التوصيلات" : "أرباح متجري وسجل المبيعات";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-full max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>اختر الفترة لعرض السجل والإجماليات</DialogDescription>
        </DialogHeader>

        {/* اختيار الفترة */}
        <div className="flex flex-wrap gap-2">
          {RANGE_LABELS.map(r => (
            <Button
              key={r.key}
              type="button"
              size="sm"
              variant={range === r.key ? "default" : "outline"}
              className="h-8 text-xs font-bold"
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>

        {range === "custom" && (
          <div className="flex items-center gap-2 text-xs">
            <CalendarDays className="size-4 text-muted-foreground shrink-0" />
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 text-xs" aria-label="من تاريخ" />
            <span className="text-muted-foreground">إلى</span>
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 text-xs" aria-label="إلى تاريخ" />
          </div>
        )}

        {active.isPending ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            <RefreshCw className="mx-auto mb-2 size-5 animate-spin text-primary" />
            جاري تحميل السجل...
          </p>
        ) : active.isError ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm text-destructive">تعذر تحميل السجل</p>
            <Button variant="outline" size="sm" onClick={() => active.refetch()}>إعادة المحاولة</Button>
          </div>
        ) : (
          <>
            {/* الإجماليات */}
            {role === "driver" && driverTotals ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border bg-muted/50 p-3">
                  <span className="block text-[11px] text-muted-foreground">عدد التوصيلات</span>
                  <strong className="text-lg">{driverTotals.deliveredCount}</strong>
                </div>
                <div className="rounded-xl border bg-muted/50 p-3">
                  <span className="block text-[11px] text-muted-foreground">أرباح التوصيل</span>
                  <strong className="text-lg text-success">{money(driverTotals.earnings)}</strong>
                </div>
                <div className="rounded-xl border bg-muted/50 p-3">
                  <span className="block text-[11px] text-muted-foreground">النقدية المحصلة</span>
                  <strong className="text-lg">{money(driverTotals.cashCollected)}</strong>
                </div>
              </div>
            ) : partnerTotals ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="rounded-xl border bg-muted/50 p-3">
                  <span className="block text-[11px] text-muted-foreground">عدد الطلبات</span>
                  <strong className="text-lg">{partnerTotals.count}</strong>
                </div>
                <div className="rounded-xl border bg-muted/50 p-3">
                  <span className="block text-[11px] text-muted-foreground">إجمالي المبيعات</span>
                  <strong className="text-lg">{money(partnerTotals.gross)}</strong>
                </div>
                <div className="rounded-xl border bg-muted/50 p-3">
                  <span className="block text-[11px] text-muted-foreground">العمولة</span>
                  <strong className="text-lg text-destructive">{money(partnerTotals.commission)}</strong>
                </div>
                <div className="rounded-xl border bg-muted/50 p-3">
                  <span className="block text-[11px] text-muted-foreground">الصافي</span>
                  <strong className="text-lg text-success">{money(partnerTotals.net)}</strong>
                </div>
              </div>
            ) : null}

            {/* السجل */}
            <div className="divide-y rounded-xl border">
              {role === "driver" ? (
                driverRows.length ? (
                  driverRows
                    .slice()
                    .sort((a, b) => String(b.delivered_at).localeCompare(String(a.delivered_at)))
                    .map(o => (
                      <div key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                        <div className="min-w-0">
                          <span className="block font-mono text-muted-foreground">طلب #{o.id.slice(0, 8)}</span>
                          <span className="text-muted-foreground">{o.delivered_at ? dateAr(o.delivered_at) : ""}</span>
                        </div>
                        <div className="text-left shrink-0">
                          <span className="block font-bold text-success">{money(o.delivery_fee)}</span>
                          <span className="text-[11px] text-muted-foreground">تحصيل {money(o.total)}</span>
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground">لا توجد توصيلات في هذه الفترة</p>
                )
              ) : partnerRows.length ? (
                partnerRows
                  .slice()
                  .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
                  .map((row, i) => (
                    <div key={`${row.created_at}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                      <span className="text-muted-foreground">{dateAr(row.created_at)}</span>
                      <div className="text-left shrink-0">
                        <span className="block font-bold">{money(row.amount)}</span>
                        <span className="text-[11px] text-muted-foreground">صافي {money(row.amount - row.commission)}</span>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">لا توجد مبيعات في هذه الفترة</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
      }
