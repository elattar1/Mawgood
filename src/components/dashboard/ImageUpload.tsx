import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, LoaderCircle, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { compressImageToWebP, formatFileSize } from "@/lib/image-compress";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export interface UploadStoreImageOptions {
  wide?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

// Uploads to the private store-media bucket under the owner's folder and returns a long-lived signed URL.
export async function uploadStoreImage(file: File, options?: UploadStoreImageOptions) {
  if (!file.type.startsWith("image/")) throw new Error("الملف يجب أن يكون صورة");
  if (file.size > 20 * 1024 * 1024) throw new Error("أقصى حجم للصورة الأصلية 20 ميجا");

  const originalSize = file.size;

  // ضغط الصورة تلقائياً بصيغة WebP لتسريع التحميل وتوفير باقة النت
  const compressed = await compressImageToWebP(file, {
    wide: options?.wide,
    maxWidth: options?.maxWidth,
    maxHeight: options?.maxHeight,
    quality: options?.quality,
  });

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("سجّل الدخول أولاً");

  const ext = compressed.type === "image/webp" ? "webp" : (compressed.name.split(".").pop()?.toLowerCase() || "jpg");
  const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from("store-media").upload(path, compressed, { contentType: compressed.type });
  if (up.error) throw new Error("تعذر رفع الصورة");
  const signed = await supabase.storage.from("store-media").createSignedUrl(path, TEN_YEARS);
  if (signed.error || !signed.data) throw new Error("تعذر تجهيز رابط الصورة");

  if (originalSize > compressed.size && compressed.type === "image/webp") {
    const saved = Math.round(((originalSize - compressed.size) / originalSize) * 100);
    if (saved > 10) {
      toast.success(
        `تم ضغط الصورة بصيغة WebP الحديثة (توفير ${saved}%: ${formatFileSize(originalSize)} ← ${formatFileSize(compressed.size)}) ⚡`
      );
    }
  }

  return signed.data.signedUrl;
}

export function ImageUploadField({ label, name, value, wide = false }: { label: string; name: string; value?: string | null | undefined; wide?: boolean }) {
  const [url, setUrl] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      setUrl(await uploadStoreImage(file, { wide }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center gap-3">
        <div className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted ${wide ? "h-20 w-36" : "size-20"}`}>
          {busy ? (
            <div className="flex flex-col items-center gap-1">
              <LoaderCircle className="animate-spin size-5 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">جاري الضغط...</span>
            </div>
          ) : url ? (
            <img src={url} alt={label} loading="lazy" decoding="async" className="size-full object-cover" />
          ) : (
            <ImagePlus className="text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-muted font-medium">
            {url ? "تغيير الصورة" : "رفع صورة"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {url && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setUrl("")}>
              <X /> إزالة
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
