import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bike,
  MapPin,
  Store,
  Phone,
  MessageCircle,
  RefreshCw,
  Clock,
  Navigation,
  AlertCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getDriverLocation } from "@/lib/delivery.functions";
import { telHref } from "@/lib/phone";
import {
  DEFAULT_HUSAYNIYA_CENTER,
  calculateDistanceKm,
  formatDistanceArabic,
  estimateDeliveryMinutes,
  cleanDisplayAddress,
  type Coordinates,
} from "@/lib/map-utils";

interface LiveDriverTrackingDialogProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChat?: (orderId: string) => void;
  // rider picks which leg to view: route to the store or to the customer
  leg?: "customer" | "store";
  // customer watches the captain; the rider previews the same map as "موقعي"
  viewer?: "customer" | "rider";
}

export function LiveDriverTrackingDialog({
  orderId,
  open,
  onOpenChange,
  onOpenChat,
  leg = "customer",
  viewer = "customer",
}: LiveDriverTrackingDialogProps) {
  const fetchLocation = useServerFn(getDriverLocation);

  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const storeMarkerRef = useRef<any>(null);
  const routeLineRef = useRef<any>(null);

  const isRider = viewer === "rider";
  const isStoreLeg = leg === "store";

  // Poll driver location every 4 seconds when dialog is open
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["driver-live-location", orderId],
    queryFn: () => fetchLocation({ data: { orderId: orderId! } }),
    enabled: !!orderId && open,
    refetchInterval: open ? 4000 : false,
  });

  const destCoords: Coordinates | null = isStoreLeg
    ? data?.storeCoords ?? null
    : data?.customerCoords ?? null;

  // Load Leaflet dynamically from CDN
  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    async function loadLeaflet() {
      if (window.L) {
        if (isMounted) setMapLoaded(true);
        return;
      }

      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      if (!document.getElementById("leaflet-js")) {
        const script = document.createElement("script");
        script.id = "leaflet-js";
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.async = true;
        script.onload = () => {
          if (isMounted) setMapLoaded(true);
        };
        document.head.appendChild(script);
      }
    }

    void loadLeaflet();

    return () => {
      isMounted = false;
    };
  }, [open]);

  // Initialize and update Leaflet map
  useEffect(() => {
    if (!open || !mapLoaded || !window.L || !mapContainerRef.current) return;

    const L = window.L;

    // Initialize map if not yet created
    if (!mapInstanceRef.current) {
      const initialCenter = data?.driverCoords || destCoords || data?.customerCoords || DEFAULT_HUSAYNIYA_CENTER;
      const map = L.map(mapContainerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: 15,
        zoomControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    setTimeout(() => map.invalidateSize(), 150);

    // Letter markers instead of emoji (rider UI is emoji-free)
    const createCustomIcon = (letter: string, bgClass: string, isPulse = false) => {
      return L.divIcon({
        className: "custom-tracking-marker",
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;">
            ${
              isPulse
                ? `<div style="position: absolute; inset: 0; border-radius: 9999px; background: rgba(16, 185, 129, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
                : ""
            }
            <div style="position: relative; width: 38px; height: 38px; border-radius: 9999px; ${bgClass}; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.25); border: 2.5px solid white;">
              ${letter}
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
    };

    const points: [number, number][] = [];

    // 1. Driver Marker
    if (data?.driverCoords) {
      const driverPos: [number, number] = [data.driverCoords.lat, data.driverCoords.lng];
      points.push(driverPos);

      const driverIcon = createCustomIcon(
        "ك",
        "background: linear-gradient(135deg, #10b981, #059669)",
        true
      );

      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLatLng(driverPos);
      } else {
        const driverLabel = isRider
          ? "موقعك الحالي"
          : `كابتن التوصيل (${data.driverInfo?.name || "الكابتن"})`;
        driverMarkerRef.current = L.marker(driverPos, { icon: driverIcon })
          .addTo(map)
          .bindPopup(`<b>${driverLabel}</b>`);
      }
    }

    // 2. Destination marker (customer by default, store on the store leg)
    if (destCoords) {
      const destPos: [number, number] = [destCoords.lat, destCoords.lng];
      points.push(destPos);

      const destIcon = isStoreLeg
        ? createCustomIcon("م", "background: linear-gradient(135deg, #f59e0b, #d97706)", false)
        : createCustomIcon("ع", "background: linear-gradient(135deg, #3b82f6, #1d4ed8)", false);

      const destPopup = isStoreLeg
        ? `<b>${data?.storeName ?? "المتجر"}</b>`
        : `<b>موقع التسليم</b><br>${cleanDisplayAddress(data?.customerAddress ?? "")}`;

      if (destMarkerRef.current) {
        destMarkerRef.current.setLatLng(destPos);
      } else {
        destMarkerRef.current = L.marker(destPos, { icon: destIcon })
          .addTo(map)
          .bindPopup(destPopup);
      }
    }

    // 3. Store marker on the customer leg (context for the route)
    if (!isStoreLeg && data?.storeCoords) {
      const storePos: [number, number] = [data.storeCoords.lat, data.storeCoords.lng];
      const storeIcon = createCustomIcon(
        "م",
        "background: linear-gradient(135deg, #f59e0b, #d97706)",
        false
      );

      if (storeMarkerRef.current) {
        storeMarkerRef.current.setLatLng(storePos);
      } else {
        storeMarkerRef.current = L.marker(storePos, { icon: storeIcon })
          .addTo(map)
          .bindPopup(`<b>${data.storeName}</b>`);
      }
    }

    // 4. Connecting path polyline (driver -> current destination)
    if (data?.driverCoords && destCoords) {
      const pathPoints: [number, number][] = [
        [data.driverCoords.lat, data.driverCoords.lng],
        [destCoords.lat, destCoords.lng],
      ];

      if (routeLineRef.current) {
        routeLineRef.current.setLatLngs(pathPoints);
      } else {
        routeLineRef.current = L.polyline(pathPoints, {
          color: "#10b981",
          weight: 4,
          opacity: 0.8,
          dashArray: "8, 8",
        }).addTo(map);
      }
    }

    // Auto fit map bounds if we have points
    if (points.length >= 2) {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
  }, [open, mapLoaded, data, destCoords, isStoreLeg, isRider]);

  // Clean up map when dialog closes
  useEffect(() => {
    if (!open && mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
      storeMarkerRef.current = null;
      routeLineRef.current = null;
    }
  }, [open]);

  // Distance & ETA to the current destination
  let distanceKm: number | null = null;
  let etaMinutes: number | null = null;

  if (data?.driverCoords && destCoords) {
    distanceKm = calculateDistanceKm(data.driverCoords, destCoords);
    etaMinutes = estimateDeliveryMinutes(distanceKm);
  }

  const hasDriverGps = !!data?.driverCoords;
  const destMissing = !isLoading && !!data && !destCoords;

  const title = isRider
    ? isStoreLeg
      ? "مسار المتجر"
      : "مسار العميل"
    : "تتبع مسار الكابتن المباشر";

  const statusChip = () => {
    if (distanceKm === null) return null;
    const arrived = distanceKm <= 0.1;
    if (isStoreLeg) return arrived ? "وصلت إلى المتجر" : "في الطريق إلى المتجر";
    if (isRider) return arrived ? "وصلت لموقع العميل" : "في الطريق إلى العميل";
    return arrived ? "الكابتن وصل تحت البيت" : "الكابتن في الطريق";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full p-0 gap-0 overflow-hidden rounded-2xl flex flex-col h-[85vh] sm:h-[620px]">
        {/* Header */}
        <DialogHeader className="p-4 border-b bg-card shrink-0 flex flex-row items-center justify-between text-right space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="size-10 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
              {isStoreLeg ? <Store className="size-5" /> : <Bike className="size-5" />}
            </div>
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                {title}
                {hasDriverGps && (
                  <span className="inline-block size-2.5 rounded-full bg-emerald-500 animate-pulse" title="بث GPS مباشر" />
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isRider
                  ? isStoreLeg
                    ? data?.storeName ?? "المتجر"
                    : cleanDisplayAddress(data?.customerAddress ?? "") || "عنوان العميل"
                  : data?.driverInfo?.name
                    ? `الكابتن: ${data.driverInfo.name}`
                    : "متابعة لحظية لموقع الشحنة"}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-1 pl-8">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => refetch()}
              disabled={isFetching}
              title="تحديث الموقع الآن"
            >
              <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin text-primary" : ""}`} />
            </Button>
          </div>
        </DialogHeader>

        {/* Live Status & ETA Floating Card */}
        <div className="bg-muted/40 border-b p-3 shrink-0 flex items-center justify-between gap-3 text-xs">
          {hasDriverGps && distanceKm !== null && etaMinutes !== null ? (
            <>
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-bold text-foreground">
                  المسافة: {formatDistanceArabic(distanceKm)}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="font-bold text-primary flex items-center gap-1">
                  <Clock className="size-3.5" />
                  الوصول: ~{etaMinutes} دقيقة
                </span>
              </div>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {statusChip()}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Navigation className="size-3.5 text-primary animate-pulse" />
              <span>
                {isRider
                  ? "موقعك المباشر غير متاح بعد. فعّل الـ GPS واضغط زر التحديث."
                  : "جاري مزامنة إحداثيات الكابتن... الكابتن استلم الطلب وهو في الطريق إليك"}
              </span>
            </div>
          )}
        </div>

        {/* Interactive Map Canvas */}
        <div className="relative flex-1 bg-muted/20 overflow-hidden">
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />

          {(!mapLoaded || isLoading) && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-10">
              <RefreshCw className="size-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground font-medium">جاري تجهيز الخريطة المباشرة...</p>
            </div>
          )}

          {isError && (
            <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-2 p-4 text-center z-10">
              <AlertCircle className="size-8 text-destructive" />
              <p className="text-sm font-semibold text-destructive">
                {error instanceof Error ? error.message : "تعذر تحميل إحداثيات التتبع"}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          )}

          {/* Destination without coordinates: fall back to the typed address */}
          {destMissing && !isError && (
            <div className="absolute inset-x-3 top-3 z-[400] bg-card/95 backdrop-blur-xs border rounded-xl p-3 shadow-md text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-foreground">
                {isStoreLeg ? <Store className="size-4 text-amber-500" /> : <MapPin className="size-4 text-primary" />}
                {isStoreLeg ? data?.storeName ?? "المتجر" : "عنوان العميل"}
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {isStoreLeg
                  ? data?.storeAddress || "عنوان المتجر غير مسجل"
                  : cleanDisplayAddress(data?.customerAddress ?? "") || "عنوان العميل غير مسجل"}
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                لا توجد إحداثيات مسجلة لهذه الوجهة، اعتمد على العنوان المكتوب أعلاه.
              </p>
            </div>
          )}

          {/* Map legend overlay */}
          <div className="absolute bottom-3 left-3 z-[400] bg-card/90 backdrop-blur-xs border rounded-xl p-2 text-[11px] shadow-md flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2.5 rounded-full bg-emerald-500" />
              {isRider ? "موقعي" : "كابتن التوصيل"}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span className={`inline-block size-2.5 rounded-full ${isStoreLeg ? "bg-amber-500" : "bg-blue-500"}`} />
              {isStoreLeg ? "المتجر" : isRider ? "العميل" : "موقعك"}
            </span>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-3 border-t bg-card shrink-0 flex items-center gap-2">
          {!isRider && data?.driverInfo?.phone && (
            <Button asChild variant="outline" className="flex-1 font-semibold gap-1.5 h-10 border-primary/30 text-xs">
              <a href={telHref(data.driverInfo.phone)}>
                <Phone className="size-3.5 text-primary" />
                اتصال بالكابتن ({data.driverInfo.phone})
              </a>
            </Button>
          )}

          {isRider && isStoreLeg && data?.storePhone && (
            <Button asChild variant="outline" className="flex-1 font-semibold gap-1.5 h-10 border-primary/30 text-xs">
              <a href={telHref(data.storePhone)}>
                <Phone className="size-3.5 text-primary" />
                اتصال بالمتجر
              </a>
            </Button>
          )}

          {orderId && onOpenChat && (
            <Button
              type="button"
              variant="default"
              className="flex-1 font-bold gap-1.5 h-10 bg-primary text-primary-foreground text-xs shadow-sm"
              onClick={() => {
                onOpenChange(false);
                onOpenChat(orderId);
              }}
            >
              <MessageCircle className="size-4" />
              {isRider ? "محادثة العميل" : "محادثة الكابتن"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
