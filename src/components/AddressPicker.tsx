import { useEffect, useState } from 'react';
import { MapPin, Plus, Trash2, Check, Crosshair } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapLocationPicker } from '@/components/MapLocationPicker';
import { extractCoordinates, cleanDisplayAddress, formatAddressWithCoordinates, type Coordinates } from '@/lib/map-utils';
import { getPersistedAddressDraft, saveAddressDraft } from '@/lib/address-storage';

type Saved = { id: string; label: string; phone: string; address: string; area_id: number | null; is_default: boolean };
type Area = { id: number; name: string };

/** Renders form inputs named area / address / phone (+ label, save) with automatic local persistence. */
export function AddressPicker({ areas, defaultArea, showArea = true }: { areas: Area[]; defaultArea?: number | null | undefined; showArea?: boolean }) {
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [initialDraft] = useState(() => getPersistedAddressDraft());

  const [selected, setSelected] = useState<string>(initialDraft.selectedId || 'new');
  const [addressText, setAddressText] = useState<string>(initialDraft.address || '');
  const [phoneText, setPhoneText] = useState<string>(initialDraft.phone || '');
  const [selectedAreaId, setSelectedAreaId] = useState<number | null>(initialDraft.areaId ?? defaultArea ?? null);
  const [addressLabel, setAddressLabel] = useState<string>(initialDraft.label || '');
  const [detectedCoords, setDetectedCoords] = useState<Coordinates | null>(initialDraft.coords);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);

  // Silently detect actual GPS location in the background if not cached
  useEffect(() => {
    if (navigator.geolocation && !detectedCoords) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setDetectedCoords(coords);
          saveAddressDraft({ coords });
        },
        () => {
          // Graceful fallback if permission denied or timeout
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }
  }, [detectedCoords]);

  async function load() {
    try {
      const { data } = await supabase.from('customer_addresses').select('id,label,phone,address,area_id,is_default').order('is_default', { ascending: false }).order('created_at', { ascending: false });
      const rows = data ?? [];
      setSaved(rows);
      if (rows.length > 0) {
        setSelected(s => {
          if (s === 'new') return 'new';
          if (rows.some(r => r.id === s)) return s;
          return rows[0].id;
        });
      } else {
        setSelected('new');
      }
    } catch {
      setSaved([]);
      setSelected('new');
    }
  }
  useEffect(() => { void load(); }, []);

  async function remove(id: string) {
    await supabase.from('customer_addresses').delete().eq('id', id);
    void load();
  }

  const handleSelectRadio = (id: string) => {
    setSelected(id);
    saveAddressDraft({ selectedId: id });
  };

  if (saved === null) return <p className="text-sm text-muted-foreground">جاري تحميل عناوينك...</p>;
  const current = saved.find(s => s.id === selected);

  // The final address string submitted in the form combines the clean text with silent GPS tag
  const submittedAddress = detectedCoords
    ? formatAddressWithCoordinates(addressText, detectedCoords)
    : addressText;

  return (
    <div className="space-y-3">
      {saved.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold">عناويني المحفوظة</p>
          {saved.map(s => {
            const cleanText = cleanDisplayAddress(s.address);
            const hasCoords = !!extractCoordinates(s.address);
            return (
              <label key={s.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-all ${selected === s.id ? 'border-primary bg-primary/5 shadow-xs' : 'hover:bg-muted/40'}`}>
                <input type="radio" name="saved_address" className="mt-1" checked={selected === s.id} onChange={() => handleSelectRadio(s.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <MapPin size={14} className="text-primary" />
                    {s.label}
                    {hasCoords && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-medium">
                        تتبع GPS مفعّل 📍
                      </span>
                    )}
                  </span>
                  <span className="block break-words text-muted-foreground mt-0.5">
                    {cleanText}
                    {s.area_id ? ` • ${areas.find(a => a.id === s.area_id)?.name ?? ''}` : ''}
                  </span>
                  <span dir="ltr" className="block text-right text-xs text-muted-foreground mt-1">{s.phone}</span>
                </span>
                <Button type="button" size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label={`حذف ${s.label}`} onClick={e => { e.preventDefault(); void remove(s.id); }}>
                  <Trash2 className="size-4" />
                </Button>
              </label>
            );
          })}
          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-all ${selected === 'new' ? 'border-primary bg-primary/5 font-semibold' : 'hover:bg-muted/40'}`}>
            <input type="radio" name="saved_address" checked={selected === 'new'} onChange={() => handleSelectRadio('new')} />
            <Plus size={16} className="text-primary" />
            كتابة عنوان جديد
          </label>
        </div>
      )}

      {current ? (
        <>
          <input type="hidden" name="address" value={current.address} />
          <input type="hidden" name="phone" value={current.phone} />
          {showArea && <input type="hidden" name="area" value={current.area_id ?? defaultArea ?? ''} />}
        </>
      ) : (
        <div className="space-y-3 rounded-xl border bg-card/60 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-bold">بيانات العنوان الجديد</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMapPickerOpen(true)}
              className="text-xs h-7 gap-1 text-muted-foreground hover:text-primary"
            >
              <Crosshair className="size-3" />
              تعديل يدوي على الخريطة
            </Button>
          </div>

          {showArea && (
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">المنطقة</span>
              <select
                name="area"
                required
                className="h-10 w-full rounded-md border bg-card px-3 text-sm"
                value={selectedAreaId ?? defaultArea ?? ''}
                onChange={e => {
                  const val = Number(e.target.value) || null;
                  setSelectedAreaId(val);
                  saveAddressDraft({ areaId: val });
                }}
              >
                <option value="">اختر المنطقة</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">العنوان بالتفصيل</span>
            <Input
              value={addressText}
              onChange={e => {
                setAddressText(e.target.value);
                saveAddressDraft({ address: e.target.value });
              }}
              required
              minLength={3}
              placeholder="اكتب عنوانك بالتفصيل (الشارع، رقم المنزل، علامة مميزة...)"
              className="text-sm"
            />
          </label>

          {/* Hidden input carrying the actual address + silent GPS coordinate tag */}
          <input type="hidden" name="address" value={submittedAddress} />

          {/* Silent GPS detection indicator (reassuring without revealing raw numbers) */}
          {detectedCoords && (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg">
              <Check className="size-3.5 shrink-0" />
              تم رصد موقعك الجغرافي الفعلي تلقائياً لمساعدة كابتن الدليفري على تتبع المسار بدقة 📍
            </p>
          )}

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">رقم الهاتف</span>
            <Input
              name="phone"
              type="tel"
              required
              minLength={6}
              value={phoneText}
              onChange={e => {
                setPhoneText(e.target.value);
                saveAddressDraft({ phone: e.target.value });
              }}
              placeholder="01xxxxxxxxx"
              className="text-sm"
            />
          </label>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">اسم العنوان</span>
            <Input
              name="address_label"
              placeholder="المنزل، الشغل..."
              value={addressLabel}
              onChange={e => {
                setAddressLabel(e.target.value);
                saveAddressDraft({ label: e.target.value });
              }}
              className="text-sm"
            />
          </label>

          <p className="text-xs text-muted-foreground leading-relaxed">
            يتم حفظ العنوان والبيانات تلقائياً في جهازك لعدم فقدانها عند إغلاق المتصفح.
          </p>
        </div>
      )}

      {/* نافذة اختيار الموقع يدوياً إذا رغب العميل */}
      <MapLocationPicker
        open={mapPickerOpen}
        onOpenChange={setMapPickerOpen}
        initialAddress={addressText}
        onConfirm={(full, coords) => {
          const clean = cleanDisplayAddress(full);
          setAddressText(clean);
          setDetectedCoords(coords);
          saveAddressDraft({ address: clean, coords });
        }}
      />
    </div>
  );
}

/** Save the address used in a submitted form (saves locally and in Supabase). */
export async function rememberAddress(form: FormData) {
  const address = String(form.get('address') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  const areaId = Number(form.get('area')) || null;
  const label = String(form.get('address_label') ?? '').trim() || 'عنوان';

  if (address.length >= 3 && phone.length >= 6) {
    saveAddressDraft({
      address: cleanDisplayAddress(address),
      phone,
      areaId,
      label,
    });
  }

  if (!form.has('address_label')) return;
  if (address.length < 3 || phone.length < 6) return;
  try {
    const { count } = await supabase.from('customer_addresses').select('id', { count: 'exact', head: true });
    await supabase.from('customer_addresses').upsert({ address, phone, area_id: areaId, label, is_default: !count }, { onConflict: 'user_id,phone,address', ignoreDuplicates: true });
  } catch {}
}
