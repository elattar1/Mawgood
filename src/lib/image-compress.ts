// src/lib/image-compress.ts
// نظام ضغط الصور التلقائي الحديث بصيغة WebP لتسريع التحميل وتوفير باقة الإنترنت

export interface ImageCompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0 to 1, default 0.82
  wide?: boolean; // True for banners (1600x1000), false for square products/logos (1080x1080)
}

/**
 * تنسيق حجم الملف للعرض البشري (مثلاً: 120 KB أو 1.4 MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * فحص ما إذا كان المتصفح يدعم تصدير WebP عبر الكانفاس
 */
export function isWebPExportSupported(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  try {
    // Avoid jsdom un-implemented canvas warnings in test environment
    if (typeof navigator !== "undefined" && navigator.userAgent && navigator.userAgent.includes("jsdom")) {
      return false;
    }
    const canvas = document.createElement("canvas");
    if (!canvas || typeof canvas.toDataURL !== "function") return false;
    const ctx = canvas.getContext?.("2d");
    if (!ctx) return false;
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

interface LoadedImageResult {
  width: number;
  height: number;
  source: CanvasImageSource;
  cleanup: () => void;
}

async function loadSourceImage(file: Blob): Promise<LoadedImageResult> {
  // استخدام createImageBitmap الحديث إذا كان متاحاً في المتصفح لسرعة المعالجة بدون استهلاك الـ Main Thread
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        cleanup: () => {
          if (typeof bitmap.close === "function") {
            bitmap.close();
          }
        },
      };
    } catch {
      // Fallback to HTMLImageElement
    }
  }

  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined" || typeof URL === "undefined") {
      reject(new Error("Image decoding is not supported in this environment"));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        source: img,
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("تعذر قراءة ملف الصورة"));
    };
    img.src = objectUrl;
  });
}

/**
 * ضغط وتحويل الصورة تلقائياً إلى صيغة WebP الحديثة مع الحفاظ على الأبعاد والنسب
 * يقلل حجم صور الكاميرات والهواتف بنسبة 85% - 95% بأعلى دقة ممكنة
 */
export async function compressImageToWebP(
  file: File,
  options: ImageCompressOptions = {}
): Promise<File> {
  // إذا لم يكن الملف صورة صالحة
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("الملف المحدد ليس صورة صالحة");
  }

  // تجاهل الصور المتجهة SVG أو المتحركة GIF للحفاظ على حركتها وجودتها الأصلية
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }

  // في بيئات الاختبار بدون DOM كامل (Node/SSR/Vitest)
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return file;
  }

  const maxWidth = options.maxWidth || (options.wide ? 1600 : 1080);
  const maxHeight = options.maxHeight || (options.wide ? 1000 : 1080);
  const quality = Math.min(Math.max(options.quality ?? 0.82, 0.1), 1.0);

  let loaded: LoadedImageResult | null = null;
  try {
    loaded = await loadSourceImage(file);
  } catch {
    // في حال تعذر القراءة (مثلاً في بيئة اختبار)، أرجع الملف الأصلي
    return file;
  }

  try {
    let { width, height } = loaded;

    // إذا كانت الصورة أصغر من 150KB وبأبعاد مناسبة وصيغة WebP بالفعل، لا داعي لإعادة الضغط
    if (
      file.type === "image/webp" &&
      file.size < 150 * 1024 &&
      width <= maxWidth &&
      height <= maxHeight
    ) {
      return file;
    }

    // حساب الأبعاد الجديدة مع المحافظة التامة على نسبة الطول إلى العرض (Aspect Ratio)
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return file;
    }

    // تنعيم وتصفية فائقة الجودة للبيكسلات أثناء التصغير
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(loaded.source, 0, 0, width, height);

    // التحقق من دعم المتصفح لتصدير WebP
    const supportsWebP = isWebPExportSupported();
    const exportFormat = supportsWebP ? "image/webp" : "image/jpeg";
    const exportExt = supportsWebP ? "webp" : "jpg";

    if (typeof canvas.toBlob !== "function") {
      return file;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, exportFormat, quality);
    });

    if (!blob) {
      return file;
    }

    // تجهيز اسم الملف الجديد مع الامتداد المناسب
    const baseName = file.name.substring(0, file.name.lastIndexOf(".")) || file.name;
    const newFileName = `${baseName}.${exportExt}`;

    return new File([blob], newFileName, {
      type: exportFormat,
      lastModified: Date.now(),
    });
  } catch (err) {
    console.warn("Image compression failed, using original file:", err);
    return file;
  } finally {
    if (loaded) {
      loaded.cleanup();
    }
  }
}
