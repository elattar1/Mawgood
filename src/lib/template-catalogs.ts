import { ALL_SUPERMARKET_ITEMS } from './supermarket-catalog-data';
// Comprehensive Predefined Category Catalogs for Providers in Markaz Al-Husayniya
// Provides instant professional catalogs for: Pharmacies, Supermarkets, and Restaurants & Cafes.

export type TemplateGroup = {
  key: string;
  name: string;
  image: string;
};

export type TemplateItem = {
  key: string;
  category: 'pharmacies' | 'supermarkets' | 'restaurants';
  group: string;
  name: string;
  size: string;
  price: number;
  image: string;
  brand?: string;
  genericName?: string;
};

export type CategoryCatalogConfig = {
  category: 'pharmacies' | 'supermarkets' | 'restaurants';
  title: string;
  subtitle: string;
  badge: string;
  groups: TemplateGroup[];
  items: TemplateItem[];
};

// -----------------------------------------------------------------------------
// 1. PHARMACY CATALOG (الصيدليات والمستلزمات الطبية)
// -----------------------------------------------------------------------------
export const PHARMACY_GROUPS: TemplateGroup[] = [
  {
    key: 'analgesics',
    name: 'مسكنات وخافض حرارة',
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'cold_allergy',
    name: 'البرد والإنفلونزا والحساسية',
    image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'digestive',
    name: 'المعدة والقولون والحموضة',
    image: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'antibiotics',
    name: 'المضادات الحيوية والمطهرات',
    image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'vitamins',
    name: 'الفيتامينات والمكملات الغذائية',
    image: 'https://images.unsplash.com/photo-1577401239170-897942555fb3?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'baby_firstaid',
    name: 'عناية الأطفال والإسعافات الأولية',
    image: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=600&auto=format&fit=crop&q=80',
  },
];

export const PHARMACY_ITEMS: TemplateItem[] = [
  // مسكنات وخافض حرارة
  {
    key: 'ph-panadol-blue',
    category: 'pharmacies',
    group: 'analgesics',
    name: 'بانادol أزرق (Panadol 500mg)',
    size: 'شريط 12 قرص',
    price: 35,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    brand: 'Panadol',
    genericName: 'Paracetamol 500mg',
  },
  {
    key: 'ph-panadol-extra',
    category: 'pharmacies',
    group: 'analgesics',
    name: 'بانادول إكسترا الأحمر (Panadol Extra)',
    size: 'شريط 12 قرص',
    price: 45,
    image: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=600&auto=format&fit=crop&q=80',
    brand: 'Panadol',
    genericName: 'Paracetamol 500mg + Caffeine 65mg',
  },
  {
    key: 'ph-cataflam-50',
    category: 'pharmacies',
    group: 'analgesics',
    name: 'كتافلام 50 مجم (Cataflam 50mg)',
    size: 'شريط 10 أقراص',
    price: 40,
    image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80',
    brand: 'Novartis',
    genericName: 'Diclofenac Potassium 50mg',
  },
  {
    key: 'ph-brufen-400',
    category: 'pharmacies',
    group: 'analgesics',
    name: 'بروفين 400 مجم (Brufen 400mg)',
    size: 'شريط 10 أقراص',
    price: 35,
    image: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=600&auto=format&fit=crop&q=80',
    brand: 'Abbott',
    genericName: 'Ibuprofen 400mg',
  },
  {
    key: 'ph-brufen-600',
    category: 'pharmacies',
    group: 'analgesics',
    name: 'بروفين 600 مجم فوار (Brufen 600mg)',
    size: 'علبة 10 أكياس فوار',
    price: 55,
    image: 'https://images.unsplash.com/photo-1616671285442-f8313437e5c6?w=600&auto=format&fit=crop&q=80',
    brand: 'Abbott',
    genericName: 'Ibuprofen 600mg',
  },
  {
    key: 'ph-paramol-500',
    category: 'pharmacies',
    group: 'analgesics',
    name: 'بارامول 500 مجم (Paramol 500mg)',
    size: 'شريط 10 أقراص',
    price: 20,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    brand: 'Misr Pharma',
    genericName: 'Paracetamol 500mg',
  },
  {
    key: 'ph-voltaren-100',
    category: 'pharmacies',
    group: 'analgesics',
    name: 'فولتارين 100 مجم لبوس (Voltaren)',
    size: 'علبة 5 أقماع شرجية',
    price: 50,
    image: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=600&auto=format&fit=crop&q=80',
    brand: 'Novartis',
    genericName: 'Diclofenac Sodium 100mg',
  },
  {
    key: 'ph-panadol-cold',
    category: 'pharmacies',
    group: 'analgesics',
    name: 'بانادول كولد آند فلو داي الأصفر',
    size: 'شريط 12 قرص',
    price: 48,
    image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=600&auto=format&fit=crop&q=80',
    brand: 'Panadol',
    genericName: 'Paracetamol + Phenylephrine',
  },

  // أدوية البرد والإنفلونزا والحساسية
  {
    key: 'ph-congestal',
    category: 'pharmacies',
    group: 'cold_allergy',
    name: 'كونجستال أقراص للبرد والصداع (Congestal)',
    size: 'شريط 10 أقراص',
    price: 30,
    image: 'https://images.unsplash.com/photo-1584017911766-d451b3d0e843?w=600&auto=format&fit=crop&q=80',
    brand: 'Sigma',
    genericName: 'Paracetamol + Chlorpheniramine + Pseudoephedrine',
  },
  {
    key: 'ph-comtrex',
    category: 'pharmacies',
    group: 'cold_allergy',
    name: 'كومتركس أقراص للإنفلونزا (Comtrex)',
    size: 'شريط 10 أقراص',
    price: 35,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    brand: 'GSK',
    genericName: 'Acetaminophen + Brompheniramine + Pseudoephedrine',
  },
  {
    key: 'ph-123-tablets',
    category: 'pharmacies',
    group: 'cold_allergy',
    name: '123 أقراص للرشح والزكام',
    size: 'شريط 10 أقراص',
    price: 25,
    image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80',
    brand: 'Hikma',
    genericName: 'Paracetamol + Chlorpheniramine + Pseudoephedrine',
  },
  {
    key: 'ph-zyrtec-10',
    category: 'pharmacies',
    group: 'cold_allergy',
    name: 'زيرتك 10 مجم مضاد للحساسية (Zyrtec)',
    size: 'شريط 10 أقراص',
    price: 55,
    image: 'https://images.unsplash.com/photo-1576602976047-174e57a47881?w=600&auto=format&fit=crop&q=80',
    brand: 'GSK',
    genericName: 'Cetirizine Hydrochloride 10mg',
  },
  {
    key: 'ph-claritine-10',
    category: 'pharmacies',
    group: 'cold_allergy',
    name: 'كلاريتين 10 مجم بدون نعاس (Claritine)',
    size: 'شريط 10 أقراص',
    price: 65,
    image: 'https://images.unsplash.com/photo-1576602976047-174e57a47881?w=600&auto=format&fit=crop&q=80',
    brand: 'Bayer',
    genericName: 'Loratadine 10mg',
  },
  {
    key: 'ph-telfast-120',
    category: 'pharmacies',
    group: 'cold_allergy',
    name: 'تلفاست 120 مجم للحساسية (Telfast)',
    size: 'شريط 10 أقراص',
    price: 75,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    brand: 'Sanofi',
    genericName: 'Fexofenadine HCl 120mg',
  },
  {
    key: 'ph-otrivin-adult',
    category: 'pharmacies',
    group: 'cold_allergy',
    name: 'أوتريفين بخاخ أنف للكبار (Otrivin 0.1%)',
    size: 'زجاجة بخاخ 10 مل',
    price: 25,
    image: 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&auto=format&fit=crop&q=80',
    brand: 'GSK',
    genericName: 'Xylometazoline HCl 0.1%',
  },
  {
    key: 'ph-otrivin-baby',
    category: 'pharmacies',
    group: 'cold_allergy',
    name: 'أوتريفين بيبي سلاين بخاخ أطفال (Baby Saline)',
    size: 'بخاخ ملحي 15 مل',
    price: 22,
    image: 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&auto=format&fit=crop&q=80',
    brand: 'GSK',
    genericName: 'Isotonic Sodium Chloride Solution',
  },

  // المعدة والقولون والحموضة
  {
    key: 'ph-antodine-20',
    category: 'pharmacies',
    group: 'digestive',
    name: 'أنتودين 20 مجم للحموضة (Antodine)',
    size: 'شريط 10 أقراص',
    price: 30,
    image: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&auto=format&fit=crop&q=80',
    brand: 'Amoun',
    genericName: 'Famotidine 20mg',
  },
  {
    key: 'ph-omeprazole-20',
    category: 'pharmacies',
    group: 'digestive',
    name: 'أوميبرازول 20 مجم لارتجاع المريء',
    size: 'شريط 7 كبسولات',
    price: 35,
    image: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&auto=format&fit=crop&q=80',
    brand: 'SEDICO',
    genericName: 'Omeprazole 20mg',
  },
  {
    key: 'ph-controloc-40',
    category: 'pharmacies',
    group: 'digestive',
    name: 'كونترولوك 40 مجم لحماية المعدة (Controloc)',
    size: 'شريط 14 قرص',
    price: 110,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    brand: 'Takeda',
    genericName: 'Pantoprazole 40mg',
  },
  {
    key: 'ph-gaviscon-syrup',
    category: 'pharmacies',
    group: 'digestive',
    name: 'جافيسكون شراب بالنعناع للحموضة (Gaviscon)',
    size: 'زجاجة 150 مل',
    price: 65,
    image: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=600&auto=format&fit=crop&q=80',
    brand: 'Reckitt',
    genericName: 'Sodium Alginate + Sodium Bicarbonate',
  },
  {
    key: 'ph-colona-tablets',
    category: 'pharmacies',
    group: 'digestive',
    name: 'كولونا أقراص لتهدئة القولون والتقلصات (Colona)',
    size: 'شريط 10 أقراص',
    price: 45,
    image: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=600&auto=format&fit=crop&q=80',
    brand: 'Rameda',
    genericName: 'Mebeverine HCl + Sulpiride',
  },
  {
    key: 'ph-spasmopyralgin',
    category: 'pharmacies',
    group: 'digestive',
    name: 'سبازموبيرالجان للتقلصات والمغص الحاد',
    size: 'شريط 10 أقراص',
    price: 30,
    image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80',
    brand: 'Kahira',
    genericName: 'Camwylophene + Metamizole',
  },
  {
    key: 'ph-motilium-10',
    category: 'pharmacies',
    group: 'digestive',
    name: 'موتيليوم 10 مجم للغثيان وعسر الهضم (Motilium)',
    size: 'شريط 10 أقراص',
    price: 42,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    brand: 'Janssen',
    genericName: 'Domperidone 10mg',
  },
  {
    key: 'ph-digestin',
    category: 'pharmacies',
    group: 'digestive',
    name: 'ديجستين أقراص مهضمة وفاتحة للشهية',
    size: 'شريط 10 أقراص',
    price: 22,
    image: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=600&auto=format&fit=crop&q=80',
    brand: 'Pharco',
    genericName: 'Digestive Enzymes (Papain + Sanzyme)',
  },

  // المضادات الحيوية والمطهرات
  {
    key: 'ph-augmentin-1g',
    category: 'pharmacies',
    group: 'antibiotics',
    name: 'أوجمنتين 1 جم مضاد حيوي (Augmentin 1g)',
    size: 'شريط 7 أقراص',
    price: 95,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    brand: 'GSK',
    genericName: 'Amoxicillin 875mg + Clavulanic Acid 125mg',
  },
  {
    key: 'ph-hibiotic-1g',
    category: 'pharmacies',
    group: 'antibiotics',
    name: 'هاي بيوتك 1 جم واسع المجال (Hibiotic 1g)',
    size: 'شريط 8 أقراص',
    price: 85,
    image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80',
    brand: 'Amoun',
    genericName: 'Amoxicillin + Clavulanic Acid',
  },
  {
    key: 'ph-flagyl-500',
    category: 'pharmacies',
    group: 'antibiotics',
    name: 'فلاجيل 500 مجم مطهر معوي (Flagyl 500mg)',
    size: 'شريط 10 أقراص',
    price: 30,
    image: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&auto=format&fit=crop&q=80',
    brand: 'Sanofi',
    genericName: 'Metronidazole 500mg',
  },
  {
    key: 'ph-septazole',
    category: 'pharmacies',
    group: 'antibiotics',
    name: 'سيبتازول أقراص مطهر للمسالك والبكتيريا',
    size: 'شريط 10 أقراص',
    price: 25,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    brand: 'Alexandria',
    genericName: 'Trimethoprim + Sulfamethoxazole',
  },
  {
    key: 'ph-betadine-120',
    category: 'pharmacies',
    group: 'antibiotics',
    name: 'بيتادين مطهر جروح وحروق 10% (Betadine)',
    size: 'زجاجة 120 مل',
    price: 45,
    image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=600&auto=format&fit=crop&q=80',
    brand: 'Mundipharma',
    genericName: 'Povidone Iodine 10%',
  },

  // الفيتامينات والمكملات الغذائية
  {
    key: 'ph-vitaminc-1000',
    category: 'pharmacies',
    group: 'vitamins',
    name: 'فيتامين سي 1000 مجم فوار لتقوية المناعة',
    size: 'أنبوبة 10 أقراص فوارة',
    price: 40,
    image: 'https://images.unsplash.com/photo-1616671285442-f8313437e5c6?w=600&auto=format&fit=crop&q=80',
    brand: 'C-Retard',
    genericName: 'Ascorbic Acid (Vitamin C 1000mg)',
  },
  {
    key: 'ph-omega3-plus',
    category: 'pharmacies',
    group: 'vitamins',
    name: 'أوميجا 3 بلس كبسولات زيت سمك نقي',
    size: 'شريط 10 كبسولات جيلاتينية',
    price: 50,
    image: 'https://images.unsplash.com/photo-1577401239170-897942555fb3?w=600&auto=format&fit=crop&q=80',
    brand: 'SEDICO',
    genericName: 'Fish Oil 1000mg + Wheat Germ Oil 100mg',
  },
  {
    key: 'ph-neuroton',
    category: 'pharmacies',
    group: 'vitamins',
    name: 'نيوروتون أقراص فيتامين ب مركب للأعصاب',
    size: 'شريط 10 أقراص',
    price: 45,
    image: 'https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=600&auto=format&fit=crop&q=80',
    brand: 'Amoun',
    genericName: 'Vitamin B1, B6, B12 + Folic Acid',
  },
  {
    key: 'ph-calcium-d3',
    category: 'pharmacies',
    group: 'vitamins',
    name: 'كالسيوم د3 للعظام والأسنان (Cal-D-3)',
    size: 'شريط 10 أقراص',
    price: 35,
    image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80',
    brand: 'EVA Pharma',
    genericName: 'Calcium Carbonate + Cholecalciferol (Vit D3)',
  },
  {
    key: 'ph-feroglobin',
    category: 'pharmacies',
    group: 'vitamins',
    name: 'فيروجلوبين كبسولات حديد لعلاج الأنيميا',
    size: 'شريط 15 كبسولة',
    price: 85,
    image: 'https://images.unsplash.com/photo-1577401239170-897942555fb3?w=600&auto=format&fit=crop&q=80',
    brand: 'Vitabiotics',
    genericName: 'Iron + Vitamin B12 + Zinc + Folic Acid',
  },
  {
    key: 'ph-zinctron',
    category: 'pharmacies',
    group: 'vitamins',
    name: 'زنكترون كبسولات زنك ومعادن للمناعة والشعر',
    size: 'شريط 10 كبسولات',
    price: 40,
    image: 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=600&auto=format&fit=crop&q=80',
    brand: 'Nerhadou',
    genericName: 'Zinc Amino Acid Chelate + Copper + Vitamin C',
  },

  // عناية الأطفال والإسعافات الأولية
  {
    key: 'ph-cetal-syrup',
    category: 'pharmacies',
    group: 'baby_firstaid',
    name: 'سيتال شراب للأطفال خافض حرارة ومسكن',
    size: 'زجاجة 60 مل',
    price: 20,
    image: 'https://images.unsplash.com/photo-1514733670139-4d87a1941d55?w=600&auto=format&fit=crop&q=80',
    brand: 'EIPICO',
    genericName: 'Paracetamol Pediatric Suspension',
  },
  {
    key: 'ph-brufen-syrup',
    category: 'pharmacies',
    group: 'baby_firstaid',
    name: 'بروفين شراب مسكن ومضاد للالتهاب للأطفال',
    size: 'زجاجة 110 مل',
    price: 32,
    image: 'https://images.unsplash.com/photo-1514733670139-4d87a1941d55?w=600&auto=format&fit=crop&q=80',
    brand: 'Abbott',
    genericName: 'Ibuprofen Suspension 100mg/5ml',
  },
  {
    key: 'ph-gripe-water',
    category: 'pharmacies',
    group: 'baby_firstaid',
    name: 'ماء غريب الأصلي لمغص وغازات الرضع',
    size: 'زجاجة 120 مل',
    price: 30,
    image: 'https://images.unsplash.com/photo-1514733670139-4d87a1941d55?w=600&auto=format&fit=crop&q=80',
    brand: 'Woodwards',
    genericName: 'Terpeneless Dill Seed Oil + Sodium Bicarbonate',
  },
  {
    key: 'ph-sudocrem-60',
    category: 'pharmacies',
    group: 'baby_firstaid',
    name: 'سودوكريم الأصلي لتسلخات والتهابات الحفاض',
    size: 'عبوة 60 جم',
    price: 140,
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop&q=80',
    brand: 'Sudocrem',
    genericName: 'Zinc Oxide Antiseptic Healing Cream',
  },
  {
    key: 'ph-panthenol-cream',
    category: 'pharmacies',
    group: 'baby_firstaid',
    name: 'كريم بانثينول 2% لترطيب وتجديد الجلد',
    size: 'أنبوبة 50 جم',
    price: 30,
    image: 'https://images.unsplash.com/photo-1608248597359-5561b369c02a?w=600&auto=format&fit=crop&q=80',
    brand: 'Nile Pharma',
    genericName: 'D-Panthenol 2% Topical Cream',
  },
  {
    key: 'ph-medical-cotton',
    category: 'pharmacies',
    group: 'baby_firstaid',
    name: 'قطن طبي معقم فائق النعومة',
    size: 'كيس 100 جم',
    price: 25,
    image: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=600&auto=format&fit=crop&q=80',
    brand: 'Pure Cotton',
    genericName: '100% Sterile Absorbent Medical Cotton',
  },
  {
    key: 'ph-sterile-gauze',
    category: 'pharmacies',
    group: 'baby_firstaid',
    name: 'شاش فازلين معقم للجروح والحروق',
    size: 'قطعة مغلفة 10×10 سم',
    price: 15,
    image: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=600&auto=format&fit=crop&q=80',
    brand: 'Jelonet',
    genericName: 'Paraffin Gauze Dressing',
  },
  {
    key: 'ph-adhesive-plasters',
    category: 'pharmacies',
    group: 'baby_firstaid',
    name: 'لاصق طبي مشكل للجروح الصغيرة',
    size: 'علبة 20 لاصقة معقمة',
    price: 20,
    image: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=600&auto=format&fit=crop&q=80',
    brand: 'Band-Aid',
    genericName: 'Sterile Adhesive Strips',
  },
  {
    key: 'ph-dettol-liquid',
    category: 'pharmacies',
    group: 'baby_firstaid',
    name: 'ديتول مطهر ومنظف الجروح الأصلي',
    size: 'زجاجة 250 مل',
    price: 55,
    image: 'https://images.unsplash.com/photo-1584744982491-665216d95f8b?w=600&auto=format&fit=crop&q=80',
    brand: 'Dettol',
    genericName: 'Chloroxylenol Antiseptic Disinfectant',
  },
];

// -----------------------------------------------------------------------------
// 2. SUPERMARKET CATALOG (16 أقسام متكاملة مع البراندات والأحجام الحقيقية من السوق المصري)
// -----------------------------------------------------------------------------
export const SUPERMARKET_GROUPS: TemplateGroup[] = [
  {
    key: 'dairy',
    name: 'الألبان والأجبان والزبادي والبيض',
    image: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'pantry',
    name: 'البقالة والزيوت والمكرونة والأرز',
    image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'beverages',
    name: 'المشروبات والعصائر والصودا والمياه',
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'hot_drinks',
    name: 'الشاي والقهوة والنسكافيه والأعشاب',
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'bakery',
    name: 'المخبوزات والحلويات الطازجة',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'meat_fish',
    name: 'اللحوم والدواجن والأسماك الطازجة',
    image: 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'frozen',
    name: 'المجمدات واللحوم والدواجن المصنعة',
    image: 'https://images.unsplash.com/photo-1588964895597-cfccd6e2dbf9?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'produce',
    name: 'الخضروات والفواكه والتمور الطازجة',
    image: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'canned',
    name: 'المعلبات والمحفوظات والصلصات والعسل',
    image: 'https://images.unsplash.com/photo-1528751014936-863e6e7a319c?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'spices',
    name: 'التوابل والبهارات والخلطات والملح',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'snacks',
    name: 'الشيبس والمقرمشات والسناكس',
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'chocolates',
    name: 'الشوكولاتة والحلويات والسبريد',
    image: 'https://images.unsplash.com/photo-1511381939415-e44015466834?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'biscuits',
    name: 'البسكويت والويفر والكوكيز',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'baking_sugar',
    name: 'السكر ومستلزمات الحلويات والخبز',
    image: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'cleaning',
    name: 'المنظفات والمناديل والعناية المنزلية',
    image: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'personal_care',
    name: 'العناية الشخصية والشعر والبشرة',
    image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop&q=80',
  },
];

export const SUPERMARKET_ITEMS: TemplateItem[] = ALL_SUPERMARKET_ITEMS;

// -----------------------------------------------------------------------------
// 3. RESTAURANT & CAFE CATALOG (المطاعم والكافيهات)
// -----------------------------------------------------------------------------
export const RESTAURANT_GROUPS: TemplateGroup[] = [
  {
    key: 'burgers',
    name: 'وجبات وساندوتشات البرجر والدجاج',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'pizza',
    name: 'البيتزا والفطائر الإيطالية والشرقية',
    image: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'grills',
    name: 'المشويات والشاورما والوجبات الشرقية',
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'crepes',
    name: 'الكريب والساندوتشات السريعة',
    image: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'drinks',
    name: 'المشروبات والعصائر الطبيعية والقهوة',
    image: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'desserts',
    name: 'الحلويات الشرقية والغربية والتحلية',
    image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
  },
];

export const RESTAURANT_ITEMS: TemplateItem[] = [
  // البرجر والدجاج السريع
  {
    key: 'rst-burger-classic-single',
    category: 'restaurants',
    group: 'burgers',
    name: 'ساندوتش برجر كلاسيك لحم سنجل',
    size: 'قطعة لحم بلدي 150 جم مع شيدر وخس وطماطم وصوص خاص',
    price: 85,
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-burger-double-cheese',
    category: 'restaurants',
    group: 'burgers',
    name: 'ساندوتش برجر دبل لحم بالجبنة الشيدر السايحة',
    size: 'شريحتين لحم مشوي فحم مع شيدر دوبل وصوص باربيكيو',
    price: 125,
    image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-burger-mushroom-bacon',
    category: 'restaurants',
    group: 'burgers',
    name: 'برجر مشروم بيف بيكون مدخن',
    size: 'لحم مشوي مع شرائح بيف بيكون وصوص المشروم الكريمي',
    price: 110,
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-chicken-zinger-crunchy',
    category: 'restaurants',
    group: 'burgers',
    name: 'ساندوتش تشيكن زنجر كرسبي مقرمش حار',
    size: 'صدر دجاج مقرمش ذهبي مع مايونيز وخس وتركي مدخن',
    price: 80,
    image: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-fried-chicken-4pcs',
    category: 'restaurants',
    group: 'burgers',
    name: 'وجبة فرايد تشيكن كرسبي 4 قطع',
    size: '4 قطع دجاج كرسبي + بطاطس مقلية + كول سلو + ثومية وخبز',
    price: 145,
    image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-fried-chicken-8pcs',
    category: 'restaurants',
    group: 'burgers',
    name: 'وجبة فرايد تشيكن عائلية 8 قطع سوبر',
    size: '8 قطع دجاج مقرمش + 2 بطاطس كبير + لتر كوكاكولا + كول سلو عائلي',
    price: 280,
    image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-chicken-strips-5p',
    category: 'restaurants',
    group: 'burgers',
    name: 'وجبة تشيكن استربس مقرمش 5 قطع',
    size: '5 قطع صدور دجاج كرسبي مع بطاطس وصوص رانش وثومية',
    price: 130,
    image: 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80',
  },

  // البيتزا والفطائر
  {
    key: 'rst-pizza-margherita-m',
    category: 'restaurants',
    group: 'pizza',
    name: 'بيتزا مارجريتا إيطالي وسط',
    size: 'حجم وسط 28 سم (موتزاريلا طبيعية وصوص إيطالي وزعتر)',
    price: 95,
    image: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-pizza-margherita-l',
    category: 'restaurants',
    group: 'pizza',
    name: 'بيتزا مارجريتا إيطالي كبير',
    size: 'حجم كبير 33 سم (موتزاريلا إضافية وريحان طازج)',
    price: 135,
    image: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-pizza-pepperoni-l',
    category: 'restaurants',
    group: 'pizza',
    name: 'بيتزا بيبروني وسجق شرقي كبير',
    size: 'حجم كبير 33 سم (شرائح بيبروني مدخن وسجق بلدي وموتزاريلا)',
    price: 175,
    image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-pizza-bbq-chicken-m',
    category: 'restaurants',
    group: 'pizza',
    name: 'بيتزا باربيكيو تشيكن دجاج وسط',
    size: 'حجم وسط 28 سم (دجاج متبل، صوص باربيكيو، موتزاريلا وبصل)',
    price: 125,
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-pizza-supreme-l',
    category: 'restaurants',
    group: 'pizza',
    name: 'بيتزا سوبر سوبريم ميكس لحوم كبير',
    size: 'حجم كبير 33 سم (لحم مفروم، بيبروني، سجق، فطر وزيتون)',
    price: 190,
    image: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-feteer-meshaltet-m',
    category: 'restaurants',
    group: 'pizza',
    name: 'فطير مشلتت فلاحي مورق سمن بلدي وسط',
    size: 'حجم وسط (يقدم مع طبق عسل أبيض وقشطة بلدي)',
    price: 90,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-feteer-meshaltet-l',
    category: 'restaurants',
    group: 'pizza',
    name: 'فطير مشلتت فلاحي مورق سمن بلدي كبير',
    size: 'حجم كبير عائلي (مع عسل نحل وقشطة وجبنة قديمة)',
    price: 140,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-feteer-shawarma-cheese',
    category: 'restaurants',
    group: 'pizza',
    name: 'فطيرة حادقة ميكس جبن وشاورما فراخ',
    size: 'حجم كبير (شاورما دجاج، جبنة كيري، موتزاريلا، فلفل وزيتون)',
    price: 160,
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
  },

  // المشويات والشاورما
  {
    key: 'rst-kebab-kofta-half',
    category: 'restaurants',
    group: 'grills',
    name: 'وجبة كباب وكفتة ضاني مشوية نصف كيلو',
    size: 'نصف كجم فحم + أرز بسمتي بالمكسرات + سلطات وطحينة وعيش',
    price: 340,
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-kofta-quarter',
    category: 'restaurants',
    group: 'grills',
    name: 'وجبة كفتة مشوية على الفحم ربع كيلو',
    size: 'ربع كجم كفتة بلدي متبلة + أرز بسمتي + طحينة وسلطة خضراء وعيش',
    price: 140,
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-grilled-chicken-full',
    category: 'restaurants',
    group: 'grills',
    name: 'فرخة مشوية على الفحم متبلة كاملة',
    size: 'فرخة كاملة مشوية فحم + 2 أرز بسمتي + سلطات وطحينة وعيش سخن',
    price: 240,
    image: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-shish-tawook-meal',
    category: 'restaurants',
    group: 'grills',
    name: 'وجبة شيش طاووق متبل على الفحم',
    size: 'أسياخ شيش طاووق فحم + بطاطس وودجز + صوص ثومية وأرز',
    price: 135,
    image: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-shawarma-syrian-large',
    category: 'restaurants',
    group: 'grills',
    name: 'ساندوتش شاورما فراخ سوري صاج صاروخ',
    size: 'حجم كبير صاروخ (دجاج متبل، ثومية، مخلل في عيش صاج محمص)',
    price: 75,
    image: 'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-shawarma-syrian-reg',
    category: 'restaurants',
    group: 'grills',
    name: 'ساندوتش شاورما فراخ سوري صاج عادي',
    size: 'حجم عادي في عيش صاج سوري مقرمش',
    price: 55,
    image: 'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-shawarma-fatteh-mix',
    category: 'restaurants',
    group: 'grills',
    name: 'فتة شاورما ميكس دجاج ولحم فاخرة',
    size: 'طبق كبير (أرز أصفر + شاورما ميكس + عيش شامي مقرمش + ثومية)',
    price: 125,
    image: 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-hawawshi-baladi',
    category: 'restaurants',
    group: 'grills',
    name: 'ساندوتش حواوشي بلدي مخصوص على الفحم',
    size: 'رغيف كامل بلدي محشي لحم مفروم بالخلطة والجبنة الموتزاريلا',
    price: 55,
    image: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=600&auto=format&fit=crop&q=80',
  },

  // الكريب والساندوتشات السريعة
  {
    key: 'rst-crepe-crunchy-hot',
    category: 'restaurants',
    group: 'crepes',
    name: 'كريب كرانشي حار ودجاج سوبريم',
    size: 'كريب حجم كبير مثلث (قطع دجاج كرسبي مع موتزاريلا وصوصات)',
    price: 90,
    image: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-crepe-mix-meat',
    category: 'restaurants',
    group: 'crepes',
    name: 'كريب ميكس لحوم وسجق بلدي',
    size: 'كريب كبير (سجق بلدي، برجر، بيف بيكون، موتزاريلا وباربيكيو)',
    price: 95,
    image: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-crepe-fries-cheese',
    category: 'restaurants',
    group: 'crepes',
    name: 'كريب بطاطس محمرة وميكس جبن سايحة',
    size: 'كريب كبير (بطاطس مقلية ذهبية مع موتزاريلا ورومي وكيري)',
    price: 60,
    image: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-crepe-nutella-banana',
    category: 'restaurants',
    group: 'crepes',
    name: 'كريب نوتيلا بالموز والشوكولاتة والمكسرات',
    size: 'كريب حلو كبير (شوكولاتة نوتيلا أصلية مع شرائح موز ومكسرات)',
    price: 75,
    image: 'https://images.unsplash.com/photo-1584776296944-ab6fb57b0bdd?w=600&auto=format&fit=crop&q=80',
  },

  // المشروبات والعصائر الطبيعية
  {
    key: 'rst-mango-juice-large',
    category: 'restaurants',
    group: 'drinks',
    name: 'عصير مانجو طبيعي فريش قطع كبير',
    size: 'كأس كبير 400 مل مثلج',
    price: 40,
    image: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-mango-juice-med',
    category: 'restaurants',
    group: 'drinks',
    name: 'عصير مانجو طبيعي فريش وسط',
    size: 'كأس وسط 300 مل',
    price: 30,
    image: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-strawberry-juice',
    category: 'restaurants',
    group: 'drinks',
    name: 'عصير فراولة بلدي طبيعي باللبن',
    size: 'كأس كبير 400 مل',
    price: 35,
    image: 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-lemon-mint',
    category: 'restaurants',
    group: 'drinks',
    name: 'عصير ليمون بالنعناع فريش مثلج منعش',
    size: 'كأس كبير 400 مل',
    price: 28,
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-oreo-milkshake',
    category: 'restaurants',
    group: 'drinks',
    name: 'ميلك شيك شوكولاتة وأوريو كريمي مثلج',
    size: 'كأس كبير 400 مل مع كريمة مخفوقة وصوص شوكولاتة',
    price: 50,
    image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-lotus-smoothie',
    category: 'restaurants',
    group: 'drinks',
    name: 'سموذي لوتس كراميل مع بسكويت لوتس',
    size: 'كأس كبير 400 مل',
    price: 55,
    image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-turkish-coffee',
    category: 'restaurants',
    group: 'drinks',
    name: 'قهوة تركي بن محوج بالححبهان فاخرة',
    size: 'فنجان على الريحة أو مظبوط أو زيادة',
    price: 25,
    image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-cappuccino-mug',
    category: 'restaurants',
    group: 'drinks',
    name: 'كابتشينو برغوة الحليب الغنية',
    size: 'مج كبير مع رشة كاكاو أو قرفة',
    price: 45,
    image: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=600&auto=format&fit=crop&q=80',
  },

  // الحلويات والتحلية
  {
    key: 'rst-molten-nutella-cake',
    category: 'restaurants',
    group: 'desserts',
    name: 'طاجن نوتيلا شوكولاتة كيك سايحة سخن',
    size: 'طاجن فخار ساخن مع بولة آيس كريم فانيليا',
    price: 65,
    image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-om-ali-nuts',
    category: 'restaurants',
    group: 'desserts',
    name: 'أم علي بالمكسرات والقشطة والسمن البلدي في الفرن',
    size: 'طاجن فخار ساخن محمر في الفرن',
    price: 50,
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-kunafa-mango',
    category: 'restaurants',
    group: 'desserts',
    name: 'كنافة بالمانجو والكريمة الفاخرة',
    size: 'طبق وسط مغطى بقطع المانجو والكريمة',
    price: 55,
    image: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-cheesecake-blueberry',
    category: 'restaurants',
    group: 'desserts',
    name: 'تشيز كيك توت أزرق (بلوبيري) غني',
    size: 'مثلث تشيز كيك كريمي بارد',
    price: 60,
    image: 'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=600&auto=format&fit=crop&q=80',
  },
  {
    key: 'rst-brownies-icecream',
    category: 'restaurants',
    group: 'desserts',
    name: 'كيك براونيز شوكولاتة فادج مع آيس كريم',
    size: 'قطعة براونيز دافئة مع بولة آيس كريم فانيليا',
    price: 55,
    image: 'https://images.unsplash.com/photo-1589218436045-ee320057f443?w=600&auto=format&fit=crop&q=80',
  },
];

// -----------------------------------------------------------------------------
// CATALOG LOOKUP AND CONFIG REGISTRY
// -----------------------------------------------------------------------------
export const ALL_TEMPLATE_ITEMS: TemplateItem[] = [
  ...PHARMACY_ITEMS,
  ...SUPERMARKET_ITEMS,
  ...RESTAURANT_ITEMS,
];

export const ALL_TEMPLATE_GROUPS: TemplateGroup[] = [
  ...PHARMACY_GROUPS,
  ...SUPERMARKET_GROUPS,
  ...RESTAURANT_GROUPS,
];

export const CATEGORY_CATALOGS: Record<string, CategoryCatalogConfig> = {
  pharmacies: {
    category: 'pharmacies',
    title: 'كتالوج الصيدلية الجاهز (أدوية ومستلزمات طبية)',
    subtitle:
      'اختر أشهر الأدوية والمستلزمات المتوفرة بصيدليتك بالاسم التجاري والعلمي وحدد سعرك والكمية.',
    badge: 'صيدلية',
    groups: PHARMACY_GROUPS,
    items: PHARMACY_ITEMS,
  },
  supermarkets: {
    category: 'supermarkets',
    title: 'كتالوج السوبر ماركت الجاهز (براندات وسلع بأحجام ونكهات)',
    subtitle:
      'اختر السلع المتوفرة بمتجرك بالبراند والوزن والعبوة المناسبة وحدد سعر البيع والكمية.',
    badge: 'سوبر ماركت',
    groups: SUPERMARKET_GROUPS,
    items: SUPERMARKET_ITEMS,
  },
  restaurants: {
    category: 'restaurants',
    title: 'كتالوج المطاعم والكافيهات الجاهز (أكلات ومشروبات وحلويات)',
    subtitle:
      'اختر الأطباق والمشروبات التي تقدمها في مطعمك مع صور حقيقية يمكنك تعديلها أو استبدالها بأي وقت.',
    badge: 'مطاعم وكافيهات',
    groups: RESTAURANT_GROUPS,
    items: RESTAURANT_ITEMS,
  },
};

export function getCategoryCatalog(category: string): CategoryCatalogConfig | null {
  return CATEGORY_CATALOGS[category] ?? null;
}

export function isCategorySupportedForCatalog(category: string): boolean {
  return category in CATEGORY_CATALOGS;
}

export function findTemplateItem(key: string): TemplateItem | undefined {
  return ALL_TEMPLATE_ITEMS.find((i) => i.key === key);
}

export function findTemplateGroup(groupKey: string): TemplateGroup | undefined {
  return ALL_TEMPLATE_GROUPS.find((g) => g.key === groupKey);
}

export function findTemplateImage(keyOrGroup: string): string | null {
  const item = findTemplateItem(keyOrGroup);
  if (item?.image) return item.image;
  const group = findTemplateGroup(keyOrGroup);
  return group?.image ?? null;
}

export function resolveProductImageUrl(url: string | null | undefined, category?: string): string | null {
  if (!url) return null;
  if (url.startsWith('/catalog/items/')) {
    return url;
  }
  if (url.startsWith('https://mawgood.app/catalog/items/')) {
    return url.replace('https://mawgood.app', '');
  }
  if (url.startsWith('/catalog/')) {
    const map: Record<string, string> = {
      '/catalog/dairy.jpg': 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&auto=format&fit=crop&q=80',
      '/catalog/pantry.jpg': 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80',
      '/catalog/canned.jpg': 'https://images.unsplash.com/photo-1528751014936-863e6e7a319c?w=600&auto=format&fit=crop&q=80',
      '/catalog/drinks.jpg': 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
      '/catalog/cleaning.jpg': 'https://images.unsplash.com/photo-1585421514738-01798e348b17?w=600&auto=format&fit=crop&q=80',
      '/catalog/snacks.jpg': 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop&q=80',
    };
    return map[url] ?? getDefaultCategoryFallbackImage(category);
  }
  return url;
}

export function getDefaultCategoryFallbackImage(category?: string): string {
  if (category === 'pharmacies') {
    return 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80';
  }
  if (category === 'restaurants') {
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80';
  }
  return 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&auto=format&fit=crop&q=80';
}
