import { describe, expect, it } from 'vitest';
import { parseProductVariant, groupProductsIntoCards } from '@/lib/product-variants';

describe('Product Variants & Multi-size Grouping', () => {
  it('correctly parses base name and size with dash separator', () => {
    const v1 = parseProductVariant('أرز مصري الساعة - 1ك', '1ك');
    expect(v1.baseName).toBe('أرز مصري الساعة');
    expect(v1.sizeLabel).toBe('1ك');

    const v2 = parseProductVariant('حليب جهينة كامل الدسم - 1 لتر', '1 لتر');
    expect(v2.baseName).toBe('حليب جهينة كامل الدسم');
    expect(v2.sizeLabel).toBe('1 لتر');

    const v3 = parseProductVariant('مشروب غازي كوكاكولا - 300مل', '300مل');
    expect(v3.baseName).toBe('مشروب غازي كوكاكولا');
    expect(v3.sizeLabel).toBe('300مل');
  });

  it('correctly parses base name and size with parentheses', () => {
    const v1 = parseProductVariant('أرز الضحى (5 كجم)', '5 كجم');
    expect(v1.baseName).toBe('أرز الضحى');
    expect(v1.sizeLabel).toBe('5 كجم');
  });

  it('falls back to description or default when no size in name', () => {
    const v1 = parseProductVariant('شيبسي بالجبنة المتبلة', 'كيس عائلي • شيبسي');
    expect(v1.baseName).toBe('شيبسي بالجبنة المتبلة');
    expect(v1.sizeLabel).toBe('كيس عائلي');

    const v2 = parseProductVariant('ملح طعام سياحي', '');
    expect(v2.baseName).toBe('ملح طعام سياحي');
    expect(v2.sizeLabel).toBe('عبوة قياسية');
  });

  it('groups multi-size products sharing the same base name into one card with sorted variants', () => {
    const products = [
      {
        id: 'p1',
        store_id: 's1',
        name: 'أرز مصري الساعة - 5ك',
        description: '5ك',
        price: 191.95,
        is_available: true,
        image_url: 'https://example.com/rice.jpg',
        section_id: 'sec1',
      },
      {
        id: 'p2',
        store_id: 's1',
        name: 'أرز مصري الساعة - 1ك',
        description: '1ك',
        price: 38.5,
        is_available: true,
        image_url: 'https://example.com/rice.jpg',
        section_id: 'sec1',
      },
      {
        id: 'p3',
        store_id: 's1',
        name: 'تونة دولفين - 185 جم',
        description: '185 جم',
        price: 45.0,
        is_available: true,
        image_url: null,
        section_id: 'sec1',
      },
    ];

    const cards = groupProductsIntoCards(products);
    expect(cards).toHaveLength(2);

    const riceCard = cards.find((c) => c.baseName === 'أرز مصري الساعة');
    expect(riceCard).toBeDefined();
    expect(riceCard!.variants).toHaveLength(2);
    // Checked sorted by price ascending: 1kg (38.5) comes before 5kg (191.95)
    expect(riceCard!.variants[0].sizeLabel).toBe('1ك');
    expect(riceCard!.variants[0].product.price).toBe(38.5);
    expect(riceCard!.variants[1].sizeLabel).toBe('5ك');
    expect(riceCard!.variants[1].product.price).toBe(191.95);

    const tunaCard = cards.find((c) => c.baseName === 'تونة دولفين');
    expect(tunaCard).toBeDefined();
    expect(tunaCard!.variants).toHaveLength(1);
    expect(tunaCard!.variants[0].sizeLabel).toBe('185 جم');
  });
});
