import { describe, expect, it } from 'vitest';
import {
  getCategoryCatalog,
  isCategorySupportedForCatalog,
  findTemplateItem,
  resolveProductImageUrl,
  PHARMACY_ITEMS,
  SUPERMARKET_ITEMS,
  RESTAURANT_ITEMS,
  ALL_TEMPLATE_ITEMS,
} from '@/lib/template-catalogs';
import { catalogImportInput } from '@/lib/dashboard-rules';

describe('Template Catalogs & Product Images', () => {
  it('supports pharmacies, supermarkets, and restaurants and rejects unsupported categories', () => {
    expect(isCategorySupportedForCatalog('pharmacies')).toBe(true);
    expect(isCategorySupportedForCatalog('supermarkets')).toBe(true);
    expect(isCategorySupportedForCatalog('restaurants')).toBe(true);
    expect(isCategorySupportedForCatalog('doctors')).toBe(false);
    expect(isCategorySupportedForCatalog('maintenance')).toBe(false);

    expect(getCategoryCatalog('pharmacies')?.title).toContain('الصيدلية');
    expect(getCategoryCatalog('supermarkets')?.title).toContain('السوبر ماركت');
    expect(getCategoryCatalog('restaurants')?.title).toContain('المطاعم');
  });

  it('provides pharmacy catalog with generic names and valid HTTPS images', () => {
    const pharma = getCategoryCatalog('pharmacies');
    expect(pharma).toBeDefined();
    expect(pharma!.items.length).toBeGreaterThanOrEqual(20);

    const panadol = pharma!.items.find((i) => i.key === 'ph-panadol-blue');
    expect(panadol).toBeDefined();
    expect(panadol?.genericName).toContain('Paracetamol');
    expect(panadol?.image).toMatch(/^https:\/\//);

    for (const item of PHARMACY_ITEMS) {
      expect(item.image).toMatch(/^https:\/\//);
      expect(item.genericName).toBeTruthy();
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('provides supermarket catalog with brand names, sizes/flavors and valid images', () => {
    const superm = getCategoryCatalog('supermarkets');
    expect(superm).toBeDefined();
    expect(superm!.items.length).toBeGreaterThanOrEqual(30);

    const juhayna = superm!.items.find((i) => i.key === 'sp-juhayna-full-1l');
    expect(juhayna).toBeDefined();
    expect(juhayna?.brand).toBe('جهينة');
    expect(juhayna?.image).toMatch(/^https:\/\/|^\/catalog\//);

    for (const item of SUPERMARKET_ITEMS) {
      expect(item.image).toMatch(/^https:\/\/|^\/catalog\//);
      expect(item.name).toBeTruthy();
      expect(item.size).toBeTruthy();
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('provides restaurant catalog with meals, pizzas, grills, drinks, desserts and valid HTTPS images', () => {
    const resto = getCategoryCatalog('restaurants');
    expect(resto).toBeDefined();
    expect(resto!.items.length).toBeGreaterThanOrEqual(25);

    const burger = resto!.items.find((i) => i.key === 'rst-burger-classic-single');
    expect(burger).toBeDefined();
    expect(burger?.image).toMatch(/^https:\/\//);

    for (const item of RESTAURANT_ITEMS) {
      expect(item.image).toMatch(/^https:\/\//);
      expect(item.price).toBeGreaterThan(0);
    }
  });

  it('ensures all template item keys adhere to schema constraints (max 40 chars)', () => {
    for (const item of ALL_TEMPLATE_ITEMS) {
      expect(item.key.length).toBeLessThanOrEqual(40);
      expect(item.key).toMatch(/^[a-z0-9_-]+$/);
    }

    const sample = {
      store_id: '11111111-1111-4111-8111-111111111111',
      items: [
        { key: 'ph-panadol-blue', price: 35, stock_qty: null },
        { key: 'sp-juhayna-full-1l', price: 46, stock_qty: 20 },
      ],
    };
    expect(catalogImportInput.safeParse(sample).success).toBe(true);
  });

  it('resolves legacy relative /catalog/ paths to valid HTTPS URLs', () => {
    expect(resolveProductImageUrl('/catalog/dairy.jpg')).toMatch(/^https:\/\//);
    expect(resolveProductImageUrl('/catalog/drinks.jpg')).toMatch(/^https:\/\//);
    expect(resolveProductImageUrl(null)).toBeNull();
    expect(resolveProductImageUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    expect(resolveProductImageUrl('/catalog/items/image1.png')).toBe('/catalog/items/image1.png');
    expect(resolveProductImageUrl('https://mawgood.app/catalog/items/image1.png')).toBe('/catalog/items/image1.png');
  });
});
