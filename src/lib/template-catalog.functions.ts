import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CATEGORY_CATALOGS,
  getCategoryCatalog,
  ALL_TEMPLATE_ITEMS,
  type TemplateItem,
  type CategoryCatalogConfig,
} from "./template-catalogs";
import {
  catalogItemInputSchema,
  catalogGroupInputSchema,
  mergeCatalogItems,
  mergeCatalogGroups,
  type CatalogItemOverride,
  type CatalogGroupOverride,
} from "./catalog-rules";

const STATE_ID_ITEM_OVERRIDES = "catalog_item_overrides";
const STATE_ID_CUSTOM_ITEMS = "catalog_custom_items";
const STATE_ID_GROUP_OVERRIDES = "catalog_group_overrides";

async function loadCatalogStateFromDb() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_recommendation_access_state")
      .select("id, message")
      .in("id", [
        STATE_ID_ITEM_OVERRIDES,
        STATE_ID_CUSTOM_ITEMS,
        STATE_ID_GROUP_OVERRIDES,
      ]);

    let overrides: Record<string, CatalogItemOverride> = {};
    let customItems: TemplateItem[] = [];
    let groupOverrides: Record<string, CatalogGroupOverride> = {};

    if (data) {
      for (const row of data) {
        if (row.id === STATE_ID_ITEM_OVERRIDES && row.message) {
          try {
            overrides = JSON.parse(row.message);
          } catch {}
        } else if (row.id === STATE_ID_CUSTOM_ITEMS && row.message) {
          try {
            customItems = JSON.parse(row.message);
          } catch {}
        } else if (row.id === STATE_ID_GROUP_OVERRIDES && row.message) {
          try {
            groupOverrides = JSON.parse(row.message);
          } catch {}
        }
      }
    }

    return { overrides, customItems, groupOverrides };
  } catch (err) {
    console.warn("Could not load catalog state from DB:", err);
    return {
      overrides: {} as Record<string, CatalogItemOverride>,
      customItems: [] as TemplateItem[],
      groupOverrides: {} as Record<string, CatalogGroupOverride>,
    };
  }
}

/**
 * Public/Merchant loader: Returns category catalog with admin overrides applied
 */
export const getDynamicCategoryCatalog = createServerFn({ method: "GET" })
  .validator((category: unknown) => String(category || "supermarkets"))
  .handler(async ({ data: category }) => {
    const baseConfig = getCategoryCatalog(category);
    if (!baseConfig) return null;

    const { overrides, customItems, groupOverrides } = await loadCatalogStateFromDb();

    // Filter custom items belonging to this category
    const categoryCustomItems = customItems.filter((i) => i.category === category);

    const mergedItems = mergeCatalogItems(baseConfig.items, overrides, categoryCustomItems);
    const mergedGroups = mergeCatalogGroups(baseConfig.groups, groupOverrides);

    return {
      ...baseConfig,
      groups: mergedGroups,
      items: mergedItems,
    } as CategoryCatalogConfig;
  });

/**
 * Admin loader: returns all categories, base catalogs, and all admin overrides
 */
export const getAdminCatalogData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roleCheck = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (roleCheck.error || !roleCheck.data) {
      throw new Error("هذه الصفحة مخصصة لمديري التطبيق فقط");
    }

    const { overrides, customItems, groupOverrides } = await loadCatalogStateFromDb();

    const categoriesList = Object.values(CATEGORY_CATALOGS).map((cat) => {
      const catCustom = customItems.filter((i) => i.category === cat.category);
      return {
        ...cat,
        groups: mergeCatalogGroups(cat.groups, groupOverrides),
        items: mergeCatalogItems(cat.items, overrides, catCustom),
      };
    });

    return {
      categories: categoriesList,
      overrides,
      customItems,
      groupOverrides,
    };
  });

/**
 * Admin action: Save/Update a catalog item (price, name, size, brand, image, department)
 */
export const saveAdminCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(catalogItemInputSchema)
  .handler(async ({ context, data }) => {
    const roleCheck = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (roleCheck.error || !roleCheck.data) {
      throw new Error("هذه العملية متاحة لمديري التطبيق فقط");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { overrides, customItems } = await loadCatalogStateFromDb();

    const isBaseItem = ALL_TEMPLATE_ITEMS.some((i) => i.key === data.key);

    if (isBaseItem) {
      // It's a modification of a predefined item -> store in overrides
      overrides[data.key] = {
        key: data.key,
        name: data.name,
        size: data.size,
        price: data.price,
        image: data.image,
        brand: data.brand,
        genericName: data.genericName,
        group: data.group,
        is_deleted: false,
      };

      await supabaseAdmin.from("ai_recommendation_access_state").upsert({
        id: STATE_ID_ITEM_OVERRIDES,
        status: 1,
        message: JSON.stringify(overrides),
        updated_at: new Date().toISOString(),
      });
    } else {
      // It's a new or custom item -> store in custom items list
      const existingIdx = customItems.findIndex((i) => i.key === data.key);
      const customItem: TemplateItem = {
        key: data.key,
        category: data.category,
        group: data.group,
        name: data.name,
        size: data.size,
        price: data.price,
        image: data.image,
        brand: data.brand,
        genericName: data.genericName,
      };

      if (existingIdx >= 0) {
        customItems[existingIdx] = customItem;
      } else {
        customItems.push(customItem);
      }

      await supabaseAdmin.from("ai_recommendation_access_state").upsert({
        id: STATE_ID_CUSTOM_ITEMS,
        status: 1,
        message: JSON.stringify(customItems),
        updated_at: new Date().toISOString(),
      });
    }

    return { success: true, item: data };
  });

/**
 * Admin action: Delete/hide an item from the catalog
 */
export const deleteAdminCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ key: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const roleCheck = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (roleCheck.error || !roleCheck.data) {
      throw new Error("هذه العملية متاحة لمديري التطبيق فقط");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { overrides, customItems } = await loadCatalogStateFromDb();

    // Mark as deleted in overrides
    overrides[data.key] = {
      ...(overrides[data.key] || { key: data.key }),
      is_deleted: true,
    };

    // Also remove from customItems if it exists there
    const nextCustom = customItems.filter((i) => i.key !== data.key);

    await Promise.all([
      supabaseAdmin.from("ai_recommendation_access_state").upsert({
        id: STATE_ID_ITEM_OVERRIDES,
        status: 1,
        message: JSON.stringify(overrides),
        updated_at: new Date().toISOString(),
      }),
      supabaseAdmin.from("ai_recommendation_access_state").upsert({
        id: STATE_ID_CUSTOM_ITEMS,
        status: 1,
        message: JSON.stringify(nextCustom),
        updated_at: new Date().toISOString(),
      }),
    ]);

    return { success: true };
  });

/**
 * Admin action: Reset an item's modifications back to system defaults
 */
export const resetAdminCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ key: z.string().min(1) }))
  .handler(async ({ context, data }) => {
    const roleCheck = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (roleCheck.error || !roleCheck.data) {
      throw new Error("هذه العملية متاحة لمديري التطبيق فقط");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { overrides } = await loadCatalogStateFromDb();

    delete overrides[data.key];

    await supabaseAdmin.from("ai_recommendation_access_state").upsert({
      id: STATE_ID_ITEM_OVERRIDES,
      status: 1,
      message: JSON.stringify(overrides),
      updated_at: new Date().toISOString(),
    });

    return { success: true };
  });

/**
 * Admin action: Edit department / group name or image
 */
export const saveAdminCatalogGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(catalogGroupInputSchema)
  .handler(async ({ context, data }) => {
    const roleCheck = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });

    if (roleCheck.error || !roleCheck.data) {
      throw new Error("هذه العملية متاحة لمديري التطبيق فقط");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { groupOverrides } = await loadCatalogStateFromDb();

    groupOverrides[data.groupKey] = {
      name: data.name,
      image: data.image,
    };

    await supabaseAdmin.from("ai_recommendation_access_state").upsert({
      id: STATE_ID_GROUP_OVERRIDES,
      status: 1,
      message: JSON.stringify(groupOverrides),
      updated_at: new Date().toISOString(),
    });

    return { success: true };
  });
