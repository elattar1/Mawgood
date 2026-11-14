const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'src', 'lib', 'real-stores-data.ts');
const targetPath = path.join(__dirname, '..', 'husayniya_app', 'lib', 'constants', 'real_stores_data.dart');

const content = fs.readFileSync(srcPath, 'utf8');

const storesMatch = content.match(/export const REAL_STORES: RealStore\[\] = (\[[\s\S]*?\]);\s*export const REAL_SECTIONS/);
const sectionsMatch = content.match(/export const REAL_SECTIONS: RealSection\[\] = (\[[\s\S]*?\]);\s*export const REAL_PRODUCTS/);
const productsMatch = content.match(/export const REAL_PRODUCTS: RealProduct\[\] = (\[[\s\S]*?\]);/);

if (!storesMatch || !sectionsMatch || !productsMatch) {
  console.error('Could not match real stores data!');
  process.exit(1);
}

const stores = JSON.parse(storesMatch[1]);
const sections = JSON.parse(sectionsMatch[1]);
const products = JSON.parse(productsMatch[1]);

const dartCode = `// Auto-generated from website real-stores-data.ts for 100% app-web synchronization
import '../models/store_model.dart';
import '../models/section_model.dart';
import '../models/product_model.dart';

final List<Map<String, dynamic>> rawRealStores = ${JSON.stringify(stores, null, 2)};

final List<Map<String, dynamic>> rawRealSections = ${JSON.stringify(sections, null, 2)};

final List<Map<String, dynamic>> rawRealProducts = ${JSON.stringify(products, null, 2)};

List<StoreModel> getCuratedRealStores() =>
    rawRealStores.map((m) => StoreModel.fromJson(m)).toList();

List<SectionModel> getCuratedRealSections(String storeId) => rawRealSections
    .where((m) => m['store_id'] == storeId)
    .map((m) => SectionModel.fromJson(m))
    .toList();

List<ProductModel> getCuratedRealProducts(String storeId) => rawRealProducts
    .where((m) => m['store_id'] == storeId)
    .map((m) => ProductModel.fromJson(m))
    .toList();
`;

fs.writeFileSync(targetPath, dartCode, 'utf8');
console.log('Successfully generated real_stores_data.dart at:', targetPath);
