// Helpers for parsing product size variants and grouping multi-size supermarket products
// Enables global app-style variant selection (e.g. Talabat, Instashop) without DB schema changes.

export type StoreProductLike = {
  id: string;
  store_id: string;
  name: string;
  description: string;
  price: number;
  is_available: boolean;
  image_url: string | null;
  section_id: string | null;
};

export type ProductVariant<T extends StoreProductLike = StoreProductLike> = {
  product: T;
  sizeLabel: string;
};

export type GroupedProductCard<T extends StoreProductLike = StoreProductLike> = {
  id: string;
  baseName: string;
  description: string;
  imageUrl: string | null;
  variants: ProductVariant<T>[];
};

/**
 * Parses a product's name and description into a clean base product name and its size/variant label.
 * Handles formats like:
 * - "أرز مصري الساعة - 1ك" -> base: "أرز مصري الساعة", size: "1ك"
 * - "حليب جهينة كامل الدسم (1 لتر)" -> base: "حليب جهينة كامل الدسم", size: "1 لتر"
 * - "مشروب غازي كوكاكولا - 300مل" -> base: "مشروب غازي كوكاكولا", size: "300مل"
 */
export function parseProductVariant(name: string, description?: string | null): { baseName: string; sizeLabel: string } {
  const trimmedName = (name || "").trim();

  // 1. Check for dash separators: " - ", " – ", " — "
  const dashMatch = trimmedName.match(/^(.*?)\s*[-–—]\s*(.+)$/);
  if (dashMatch && dashMatch[1].trim() && dashMatch[2].trim()) {
    return {
      baseName: dashMatch[1].trim(),
      sizeLabel: dashMatch[2].trim(),
    };
  }

  // 2. Check for parentheses at end: "اسم المنتج (الحجم)"
  const parenMatch = trimmedName.match(/^(.*?)\s*[\(（]([^\)）]+)[\)）]$/);
  if (parenMatch && parenMatch[1].trim() && parenMatch[2].trim()) {
    return {
      baseName: parenMatch[1].trim(),
      sizeLabel: parenMatch[2].trim(),
    };
  }

  // 3. Fallback: extract size from description if present
  const descSize = (description || "").split("•")[0]?.trim();
  return {
    baseName: trimmedName,
    sizeLabel: descSize || "عبوة قياسية",
  };
}

/**
 * Groups a flat list of products into cards, combining items that share the same base name
 * into interactive multi-size variant cards.
 */
export function groupProductsIntoCards<T extends StoreProductLike>(products: T[]): GroupedProductCard<T>[] {
  const map = new Map<string, GroupedProductCard<T>>();

  for (const product of products) {
    const { baseName, sizeLabel } = parseProductVariant(product.name, product.description);
    const key = baseName.toLowerCase();

    if (!map.has(key)) {
      map.set(key, {
        id: product.id,
        baseName,
        description: product.description,
        imageUrl: product.image_url,
        variants: [{ product, sizeLabel }],
      });
    } else {
      const existing = map.get(key)!;
      // Prevent duplicate size variants with the exact same size label and price
      const duplicate = existing.variants.some(
        (v) => v.sizeLabel === sizeLabel && v.product.price === product.price
      );
      if (!duplicate) {
        existing.variants.push({ product, sizeLabel });
        if (!existing.imageUrl && product.image_url) {
          existing.imageUrl = product.image_url;
        }
      }
    }
  }

  // Sort variants inside each card by price ascending
  for (const card of map.values()) {
    card.variants.sort((a, b) => Number(a.product.price) - Number(b.product.price));
  }

  return Array.from(map.values());
}
