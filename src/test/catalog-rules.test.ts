import { describe, expect, it } from "vitest";
import {
  mergeCatalogItems,
  mergeCatalogGroups,
  catalogItemInputSchema,
  catalogGroupInputSchema,
} from "@/lib/catalog-rules";
import type { TemplateItem, TemplateGroup } from "@/lib/template-catalogs";

describe("Catalog Rules & Admin Overrides", () => {
  const baseItems: TemplateItem[] = [
    {
      key: "sp-item-1",
      category: "supermarkets",
      group: "dairy",
      name: "حليب جهينة 1 لتر",
      size: "1 لتر",
      price: 46,
      image: "https://example.com/milk.jpg",
      brand: "جهينة",
    },
    {
      key: "sp-item-2",
      category: "supermarkets",
      group: "dairy",
      name: "زبادي طبيعي",
      size: "105 جم",
      price: 9,
      image: "https://example.com/yogurt.jpg",
      brand: "جهينة",
    },
  ];

  const baseGroups: TemplateGroup[] = [
    {
      key: "dairy",
      name: "الألبان والأجبان",
      image: "https://example.com/dairy.jpg",
    },
  ];

  it("applies item overrides to base items correctly", () => {
    const overrides = {
      "sp-item-1": {
        key: "sp-item-1",
        price: 50,
        name: "حليب جهينة كامل الدسم المطور",
      },
    };

    const merged = mergeCatalogItems(baseItems, overrides);
    expect(merged).toHaveLength(2);

    const item1 = merged.find((i) => i.key === "sp-item-1");
    expect(item1?.price).toBe(50);
    expect(item1?.name).toBe("حليب جهينة كامل الدسم المطور");
    expect(item1?.size).toBe("1 لتر"); // Unchanged field remains
  });

  it("omits items marked as deleted", () => {
    const overrides = {
      "sp-item-2": {
        key: "sp-item-2",
        is_deleted: true,
      },
    };

    const merged = mergeCatalogItems(baseItems, overrides);
    expect(merged).toHaveLength(1);
    expect(merged[0].key).toBe("sp-item-1");
  });

  it("adds custom items created by admin", () => {
    const customItems: TemplateItem[] = [
      {
        key: "custom-sp-3",
        category: "supermarkets",
        group: "dairy",
        name: "جبنة رومي قديمة",
        size: "250 جم",
        price: 95,
        image: "https://example.com/romi.jpg",
        brand: "أصلي",
      },
    ];

    const merged = mergeCatalogItems(baseItems, {}, customItems);
    expect(merged).toHaveLength(3);
    const custom = merged.find((i) => i.key === "custom-sp-3");
    expect(custom).toBeDefined();
    expect(custom?.name).toBe("جبنة رومي قديمة");
  });

  it("merges group overrides correctly", () => {
    const overrides = {
      dairy: {
        name: "قسم الألبان والبيض الطازج",
        image: "https://example.com/new-dairy.jpg",
      },
    };

    const merged = mergeCatalogGroups(baseGroups, overrides);
    expect(merged[0].name).toBe("قسم الألبان والبيض الطازج");
    expect(merged[0].image).toBe("https://example.com/new-dairy.jpg");
  });

  it("validates catalog item input with schema", () => {
    const valid = catalogItemInputSchema.safeParse({
      key: "sp-new-item",
      category: "supermarkets",
      group: "dairy",
      name: "زبادي يوناني",
      size: "180 جم",
      price: 25,
      image: "https://example.com/greek.jpg",
      brand: "دانون",
    });
    expect(valid.success).toBe(true);

    const invalid = catalogItemInputSchema.safeParse({
      key: "",
      category: "invalid_cat",
      name: "a", // Too short
      price: -5, // Negative
    });
    expect(invalid.success).toBe(false);
  });
});
