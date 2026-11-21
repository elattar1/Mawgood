import { z } from "zod";
import type {
  TemplateItem,
  TemplateGroup,
  CategoryCatalogConfig,
} from "./template-catalogs";

export type CatalogItemOverride = {
  key: string;
  name?: string;
  size?: string;
  price?: number;
  image?: string;
  brand?: string;
  genericName?: string;
  group?: string;
  is_deleted?: boolean;
};

export type CatalogGroupOverride = {
  name?: string;
  image?: string;
};

export const catalogItemInputSchema = z.object({
  key: z.string().min(1).max(50),
  category: z.enum(["supermarkets", "pharmacies", "restaurants"]),
  group: z.string().min(1, "القسم مطلوب"),
  name: z.string().min(2, "اسم المنتج يجب أن يحتوي على حرفين على الأقل"),
  size: z.string().min(1, "الحجم أو العبوة مطلوبة"),
  price: z.number().min(0, "السعر يجب أن يكون 0 أو أكثر"),
  image: z.string().min(1, "رابط الصورة مطلوب"),
  brand: z.string().optional(),
  genericName: z.string().optional(),
});

export type CatalogItemInput = z.infer<typeof catalogItemInputSchema>;

export const catalogGroupInputSchema = z.object({
  category: z.enum(["supermarkets", "pharmacies", "restaurants"]),
  groupKey: z.string().min(1),
  name: z.string().min(2, "اسم القسم يجب أن يحتوي على حرفين على الأقل"),
  image: z.string().min(1, "رابط صورة القسم مطلوب"),
});

export type CatalogGroupInput = z.infer<typeof catalogGroupInputSchema>;

/**
 * Merges static base catalog items with admin overrides and custom added items.
 */
export function mergeCatalogItems(
  baseItems: TemplateItem[],
  overrides: Record<string, CatalogItemOverride> = {},
  customItems: TemplateItem[] = []
): TemplateItem[] {
  const result: TemplateItem[] = [];
  const processedKeys = new Set<string>();

  // 1. Process base items with overrides
  for (const base of baseItems) {
    processedKeys.add(base.key);
    const override = overrides[base.key];
    if (override?.is_deleted) {
      continue; // Skip items marked as deleted
    }
    if (override) {
      result.push({
        ...base,
        name: override.name ?? base.name,
        size: override.size ?? base.size,
        price: override.price != null ? override.price : base.price,
        image: override.image ?? base.image,
        brand: override.brand !== undefined ? override.brand : base.brand,
        genericName: override.genericName !== undefined ? override.genericName : base.genericName,
        group: override.group ?? base.group,
      });
    } else {
      result.push(base);
    }
  }

  // 2. Add custom items
  for (const custom of customItems) {
    if (processedKeys.has(custom.key)) continue;
    processedKeys.add(custom.key);

    const override = overrides[custom.key];
    if (override?.is_deleted) {
      continue;
    }
    if (override) {
      result.push({
        ...custom,
        name: override.name ?? custom.name,
        size: override.size ?? custom.size,
        price: override.price != null ? override.price : custom.price,
        image: override.image ?? custom.image,
        brand: override.brand !== undefined ? override.brand : custom.brand,
        genericName: override.genericName !== undefined ? override.genericName : custom.genericName,
        group: override.group ?? custom.group,
      });
    } else {
      result.push(custom);
    }
  }

  return result;
}

/**
 * Merges static base catalog groups with admin overrides.
 */
export function mergeCatalogGroups(
  baseGroups: TemplateGroup[],
  groupOverrides: Record<string, CatalogGroupOverride> = {}
): TemplateGroup[] {
  return baseGroups.map((group) => {
    const override = groupOverrides[group.key];
    if (override) {
      return {
        ...group,
        name: override.name ?? group.name,
        image: override.image ?? group.image,
      };
    }
    return group;
  });
}
