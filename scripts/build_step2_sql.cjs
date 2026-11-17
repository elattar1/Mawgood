const fs = require('fs');
const { REAL_STORES, REAL_SECTIONS, REAL_PRODUCTS, DEFAULT_CATEGORIES, DEFAULT_AREAS } = require('../src/lib/real-stores-data.ts');

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

let sql = '-- ==========================================\n';
sql += '-- STEP 2: STORES, RESTAURANTS, PRODUCTS & DATA\n';
sql += '-- Generated cleanly from real-stores-data.ts\n';
sql += '-- ==========================================\n\n';

// 1. Categories
sql += '-- 1. CATEGORIES\n';
sql += 'ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;\n\n';
for (const cat of DEFAULT_CATEGORIES) {
  sql += `INSERT INTO public.categories (slug, name, kind, sort, is_active) VALUES (${escapeSql(cat.slug)}, ${escapeSql(cat.name)}, ${escapeSql(cat.kind)}, ${cat.sort}, true) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, sort = EXCLUDED.sort, is_active = EXCLUDED.is_active;\n`;
}
sql += '\n';

// 2. Areas
sql += '-- 2. AREAS\n';
for (const area of DEFAULT_AREAS) {
  sql += `INSERT INTO public.areas (id, name) VALUES (${area.id}, ${escapeSql(area.name)}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;\n`;
}
sql += '\n';

// 3. Stores
sql += '-- 3. STORES\n';
for (const s of REAL_STORES) {
  sql += `INSERT INTO public.stores (id, category, area_id, name, description, phone, address, specialty, booking_fee, delivery_fee, commission_rate, rating, reviews_count, is_active, is_open, logo_url, banner_url) VALUES (${escapeSql(s.id)}, ${escapeSql(s.category)}, ${s.area_id}, ${escapeSql(s.name)}, ${escapeSql(s.description)}, ${escapeSql(s.phone)}, ${escapeSql(s.address)}, ${escapeSql(s.specialty || null)}, ${s.booking_fee}, ${s.delivery_fee}, ${s.commission_rate}, ${s.rating}, ${s.reviews_count}, ${s.is_active}, ${s.is_open}, ${escapeSql(s.logo_url)}, ${escapeSql(s.banner_url)}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, phone = EXCLUDED.phone, address = EXCLUDED.address, category = EXCLUDED.category, area_id = EXCLUDED.area_id, is_active = EXCLUDED.is_active, is_open = EXCLUDED.is_open, logo_url = EXCLUDED.logo_url, banner_url = EXCLUDED.banner_url, delivery_fee = EXCLUDED.delivery_fee, rating = EXCLUDED.rating, reviews_count = EXCLUDED.reviews_count;\n`;
}
sql += '\n';

// 4. Store Sections
sql += '-- 4. STORE SECTIONS\n';
for (const sec of REAL_SECTIONS) {
  sql += `INSERT INTO public.store_sections (id, store_id, name, sort_order) VALUES (${escapeSql(sec.id)}, ${escapeSql(sec.store_id)}, ${escapeSql(sec.name)}, ${sec.sort_order}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;\n`;
}
sql += '\n';

// 5. Products
sql += '-- 5. PRODUCTS\n';
for (const p of REAL_PRODUCTS) {
  sql += `INSERT INTO public.products (id, store_id, section_id, name, description, price, is_available, image_url) VALUES (${escapeSql(p.id)}, ${escapeSql(p.store_id)}, ${escapeSql(p.section_id || null)}, ${escapeSql(p.name)}, ${escapeSql(p.description)}, ${p.price}, ${p.is_available}, ${escapeSql(p.image_url)}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, price = EXCLUDED.price, is_available = EXCLUDED.is_available, image_url = EXCLUDED.image_url, section_id = EXCLUDED.section_id;\n`;
}

fs.writeFileSync('supabase_step2_data.sql', sql, 'utf8');

// Also update combined setup
const s1 = fs.readFileSync('supabase_step1_schema.sql', 'utf8');
fs.writeFileSync('supabase_setup.sql', s1 + '\n\n' + sql, 'utf8');

console.log('Clean supabase_step2_data.sql and supabase_setup.sql regenerated successfully!');
