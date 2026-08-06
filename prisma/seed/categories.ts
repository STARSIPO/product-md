/**
 * The Product.md taxonomy: tree, bilingual translations, synonyms and dependent
 * attributes.
 *
 * Synonyms are the important part. A Moldovan buyer types «помидоры» when the листинг
 * says «Томаты», writes "rosii" without diacritics, or misspells «картошка». Every one
 * of those has to land on the same node, so each category carries:
 *   weight 100 — the canonical name in that locale
 *   weight  80 — a strong synonym («томаты» for «помидоры»)
 *   weight  60 — colloquial usage («молочка», «кура»)
 *   weight  40 — a common misspelling, flagged isMisspelling so the suggester can
 *                penalise it and still find it
 *
 * Attributes are declared on the highest node they make sense on and inherited by the
 * subtree (`inherited: true`), which is why «Мясо → Говядина → Охлаждённая» still asks
 * for «вид мяса» defined once on «Мясо».
 */

import type { PrismaClient } from '@prisma/client'
import { normalize } from '../../src/lib/normalize'

export type Locale = 'ru' | 'ro'

/** [locale, term, weight?, isMisspelling?] */
export type SynonymSpec = readonly [Locale, string, number?, boolean?]

export interface AttributeOptionSpec {
  value: string
  ru: string
  ro: string
}

export interface AttributeSpec {
  key: string
  type: 'TEXT' | 'NUMBER' | 'SELECT' | 'MULTISELECT' | 'BOOL' | 'DATE'
  unit?: string
  isRequired?: boolean
  isFilterable?: boolean
  appliesTo?: 'PRODUCT' | 'REQUEST' | 'BOTH'
  inherited?: boolean
  ru: { label: string; hint?: string }
  ro: { label: string; hint?: string }
  options?: readonly AttributeOptionSpec[]
}

export interface CategorySpec {
  /** Globally unique latin slug; also the ru translation slug. */
  slug: string
  /** Romanian translation slug — unique within the ro locale. */
  roSlug: string
  ru: string
  ro: string
  defaultUnit: string
  isPopular?: boolean
  icon?: string
  syn?: readonly SynonymSpec[]
  attrs?: readonly AttributeSpec[]
  children?: readonly CategorySpec[]
}

// ---------------------------------------------------------------------------
// Attribute groups (declared once, attached to the node that owns them)
// ---------------------------------------------------------------------------

const MEAT_ATTRS: readonly AttributeSpec[] = [
  {
    key: 'meat_kind',
    type: 'SELECT',
    isRequired: true,
    isFilterable: true,
    ru: { label: 'Вид мяса', hint: 'Животное, от которого получено мясо' },
    ro: { label: 'Tipul cărnii', hint: 'Animalul de la care provine carnea' },
    options: [
      { value: 'BEEF', ru: 'Говядина', ro: 'Carne de vită' },
      { value: 'PORK', ru: 'Свинина', ro: 'Carne de porc' },
      { value: 'LAMB', ru: 'Баранина', ro: 'Carne de oaie' },
      { value: 'VEAL', ru: 'Телятина', ro: 'Carne de vițel' },
      { value: 'RABBIT', ru: 'Кролик', ro: 'Carne de iepure' },
    ],
  },
  {
    key: 'meat_cut',
    type: 'SELECT',
    isFilterable: true,
    ru: { label: 'Часть / отруб', hint: 'Разделка туши' },
    ro: { label: 'Tranșa / tăietura', hint: 'Modul de tranșare a carcasei' },
    options: [
      { value: 'CARCASS', ru: 'Туша / полутуша', ro: 'Carcasă / semicarcasă' },
      { value: 'TENDERLOIN', ru: 'Вырезка', ro: 'Mușchiuleț' },
      { value: 'SHOULDER', ru: 'Лопатка', ro: 'Spată' },
      { value: 'BRISKET', ru: 'Грудинка', ro: 'Piept' },
      { value: 'RIBS', ru: 'Рёбра', ro: 'Coaste' },
      { value: 'LEG', ru: 'Окорок / задняя часть', ro: 'Pulpă' },
      { value: 'NECK', ru: 'Шея', ro: 'Ceafă' },
      { value: 'MINCED', ru: 'Фарш', ro: 'Carne tocată' },
    ],
  },
  {
    key: 'thermal_state',
    type: 'SELECT',
    isRequired: true,
    isFilterable: true,
    ru: { label: 'Охлаждённое / замороженное', hint: 'Термическое состояние партии' },
    ro: { label: 'Refrigerat / congelat', hint: 'Starea termică a lotului' },
    options: [
      { value: 'CHILLED', ru: 'Охлаждённое', ro: 'Refrigerat' },
      { value: 'FROZEN', ru: 'Замороженное', ro: 'Congelat' },
      { value: 'DEFROSTED', ru: 'Размороженное', ro: 'Decongelat' },
    ],
  },
  {
    key: 'piece_weight',
    type: 'NUMBER',
    unit: 'kg',
    ru: { label: 'Вес единицы', hint: 'Средний вес одной единицы, кг' },
    ro: { label: 'Greutatea unei unități', hint: 'Greutatea medie a unei unități, kg' },
  },
  {
    key: 'shelf_life_days',
    type: 'NUMBER',
    unit: 'days',
    ru: { label: 'Срок годности', hint: 'Количество дней с даты производства' },
    ro: { label: 'Termen de valabilitate', hint: 'Număr de zile de la data producerii' },
  },
  {
    key: 'storage_temp',
    type: 'TEXT',
    ru: { label: 'Температура хранения', hint: 'Например: от 0 °C до +4 °C' },
    ro: { label: 'Temperatura de păstrare', hint: 'De exemplu: de la 0 °C la +4 °C' },
  },
  {
    key: 'vet_certificate',
    type: 'BOOL',
    isFilterable: true,
    ru: { label: 'Наличие ветеринарного сертификата', hint: 'Ветеринарно-санитарный сертификат ANSA' },
    ro: { label: 'Certificat veterinar disponibil', hint: 'Certificat sanitar-veterinar ANSA' },
  },
]

const VEGETABLE_ATTRS: readonly AttributeSpec[] = [
  {
    key: 'variety',
    type: 'TEXT',
    ru: { label: 'Сорт', hint: 'Например: Гала, Ред Скарлет, Бычье сердце' },
    ro: { label: 'Soiul', hint: 'De exemplu: Gala, Red Scarlett, Inimă de bou' },
  },
  {
    key: 'harvest_year',
    type: 'NUMBER',
    isFilterable: true,
    ru: { label: 'Год урожая', hint: 'Год сбора урожая' },
    ro: { label: 'Anul recoltei', hint: 'Anul în care a fost recoltat' },
  },
  {
    key: 'calibre',
    type: 'SELECT',
    isFilterable: true,
    ru: { label: 'Калибр', hint: 'Размерная фракция партии' },
    ro: { label: 'Calibrul', hint: 'Fracția dimensională a lotului' },
    options: [
      { value: 'SMALL', ru: 'Мелкий (до 50 мм)', ro: 'Mic (până la 50 mm)' },
      { value: 'MEDIUM', ru: 'Средний (50–70 мм)', ro: 'Mediu (50–70 mm)' },
      { value: 'LARGE', ru: 'Крупный (70–90 мм)', ro: 'Mare (70–90 mm)' },
      { value: 'EXTRA', ru: 'Экстра (более 90 мм)', ro: 'Extra (peste 90 mm)' },
      { value: 'MIXED', ru: 'Смешанный', ro: 'Amestecat' },
    ],
  },
  {
    key: 'origin_country',
    type: 'TEXT',
    isFilterable: true,
    ru: { label: 'Страна происхождения', hint: 'Например: Молдова' },
    ro: { label: 'Țara de origine', hint: 'De exemplu: Moldova' },
  },
  {
    key: 'produce_packaging',
    type: 'SELECT',
    isFilterable: true,
    ru: { label: 'Упаковка', hint: 'В чём отгружается партия' },
    ro: { label: 'Ambalajul', hint: 'În ce se livrează lotul' },
    options: [
      { value: 'BIGBAG', ru: 'Биг-бэг', ro: 'Big-bag' },
      { value: 'NET', ru: 'Сетка', ro: 'Plasă' },
      { value: 'BOX', ru: 'Ящик', ro: 'Ladă' },
      { value: 'CRATE', ru: 'Пластиковый лоток', ro: 'Navetă de plastic' },
      { value: 'PALLET', ru: 'Паллета', ro: 'Palet' },
      { value: 'BULK', ru: 'Навалом', ro: 'Vrac' },
    ],
  },
]

const PACKAGING_ATTRS: readonly AttributeSpec[] = [
  {
    key: 'material',
    type: 'SELECT',
    isRequired: true,
    isFilterable: true,
    ru: { label: 'Материал', hint: 'Основной материал изделия' },
    ro: { label: 'Materialul', hint: 'Materialul principal al produsului' },
    options: [
      { value: 'CARDBOARD', ru: 'Картон', ro: 'Carton' },
      { value: 'CORRUGATED', ru: 'Гофрокартон', ro: 'Carton ondulat' },
      { value: 'PAPER', ru: 'Бумага', ro: 'Hârtie' },
      { value: 'PP', ru: 'Полипропилен (PP)', ro: 'Polipropilenă (PP)' },
      { value: 'PET', ru: 'ПЭТ', ro: 'PET' },
      { value: 'HDPE', ru: 'Полиэтилен (HDPE)', ro: 'Polietilenă (HDPE)' },
      { value: 'ALUMINIUM', ru: 'Алюминий', ro: 'Aluminiu' },
      { value: 'BIODEGRADABLE', ru: 'Биоразлагаемый материал', ro: 'Material biodegradabil' },
    ],
  },
  {
    key: 'dimensions',
    type: 'TEXT',
    ru: { label: 'Размер', hint: 'Например: 320×320×40 мм' },
    ro: { label: 'Dimensiunea', hint: 'De exemplu: 320×320×40 mm' },
  },
  {
    key: 'capacity_ml',
    type: 'NUMBER',
    unit: 'ml',
    ru: { label: 'Вместимость', hint: 'Объём одной единицы, мл' },
    ro: { label: 'Capacitatea', hint: 'Volumul unei unități, ml' },
  },
  {
    key: 'units_per_pack',
    type: 'NUMBER',
    unit: 'pcs',
    ru: { label: 'Количество в упаковке', hint: 'Штук в одной упаковке' },
    ro: { label: 'Cantitatea per ambalaj', hint: 'Bucăți într-un ambalaj' },
  },
  {
    key: 'custom_print',
    type: 'BOOL',
    isFilterable: true,
    ru: { label: 'Нанесение логотипа', hint: 'Возможна печать логотипа заказчика' },
    ro: { label: 'Personalizare cu logo', hint: 'Este posibilă imprimarea logoului clientului' },
  },
]

const DAIRY_ATTRS: readonly AttributeSpec[] = [
  {
    key: 'fat_percent',
    type: 'NUMBER',
    unit: '%',
    isRequired: true,
    isFilterable: true,
    ru: { label: 'Жирность, %', hint: 'Массовая доля жира' },
    ro: { label: 'Grăsime, %', hint: 'Conținutul de grăsime' },
  },
  {
    key: 'pasteurization',
    type: 'SELECT',
    isFilterable: true,
    ru: { label: 'Пастеризация', hint: 'Способ термической обработки' },
    ro: { label: 'Pasteurizare', hint: 'Metoda de tratament termic' },
    options: [
      { value: 'RAW', ru: 'Сырое (непастеризованное)', ro: 'Crud (nepasteurizat)' },
      { value: 'PASTEURIZED', ru: 'Пастеризованное', ro: 'Pasteurizat' },
      { value: 'UHT', ru: 'Ультрапастеризованное (UHT)', ro: 'Ultrapasteurizat (UHT)' },
      { value: 'STERILIZED', ru: 'Стерилизованное', ro: 'Sterilizat' },
    ],
  },
  {
    key: 'shelf_life_days',
    type: 'NUMBER',
    unit: 'days',
    ru: { label: 'Срок годности', hint: 'Количество дней с даты производства' },
    ro: { label: 'Termen de valabilitate', hint: 'Număr de zile de la data producerii' },
  },
  {
    key: 'dairy_packaging',
    type: 'SELECT',
    isFilterable: true,
    ru: { label: 'Упаковка', hint: 'Тип потребительской упаковки' },
    ro: { label: 'Ambalajul', hint: 'Tipul ambalajului de consum' },
    options: [
      { value: 'TETRAPAK', ru: 'Тетра Пак', ro: 'Tetra Pak' },
      { value: 'PET_BOTTLE', ru: 'ПЭТ-бутылка', ro: 'Sticlă PET' },
      { value: 'FILM_PACK', ru: 'Плёночный пакет', ro: 'Pungă de folie' },
      { value: 'BUCKET', ru: 'Ведро', ro: 'Găleată' },
      { value: 'VACUUM', ru: 'Вакуумная упаковка', ro: 'Ambalaj vidat' },
      { value: 'BULK', ru: 'Весовая (без упаковки)', ro: 'La cântar (fără ambalaj)' },
    ],
  },
]

const FISH_ATTRS: readonly AttributeSpec[] = [
  {
    key: 'fish_kind',
    type: 'SELECT',
    isRequired: true,
    isFilterable: true,
    ru: { label: 'Вид рыбы', hint: 'Порода или группа' },
    ro: { label: 'Specia de pește', hint: 'Specia sau grupul' },
    options: [
      { value: 'CARP', ru: 'Карп', ro: 'Crap' },
      { value: 'SILVER_CARP', ru: 'Толстолобик', ro: 'Sânger' },
      { value: 'TROUT', ru: 'Форель', ro: 'Păstrăv' },
      { value: 'HERRING', ru: 'Сельдь', ro: 'Scrumbie' },
      { value: 'MACKEREL', ru: 'Скумбрия', ro: 'Macrou' },
      { value: 'SALMON', ru: 'Лосось', ro: 'Somon' },
      { value: 'HAKE', ru: 'Хек', ro: 'Merluciu' },
      { value: 'SHRIMP', ru: 'Креветка', ro: 'Creveți' },
    ],
  },
  {
    key: 'thermal_state',
    type: 'SELECT',
    isRequired: true,
    isFilterable: true,
    ru: { label: 'Охлаждённая / замороженная', hint: 'Термическое состояние партии' },
    ro: { label: 'Refrigerat / congelat', hint: 'Starea termică a lotului' },
    options: [
      { value: 'LIVE', ru: 'Живая', ro: 'Viu' },
      { value: 'CHILLED', ru: 'Охлаждённая', ro: 'Refrigerat' },
      { value: 'FROZEN', ru: 'Замороженная', ro: 'Congelat' },
    ],
  },
  {
    key: 'catch_method',
    type: 'SELECT',
    isFilterable: true,
    ru: { label: 'Способ вылова', hint: 'Дикий вылов или аквакультура' },
    ro: { label: 'Modul de obținere', hint: 'Pescuit sălbatic sau acvacultură' },
    options: [
      { value: 'WILD', ru: 'Дикий вылов', ro: 'Pescuit sălbatic' },
      { value: 'FARMED', ru: 'Аквакультура', ro: 'Acvacultură' },
      { value: 'POND', ru: 'Прудовое хозяйство', ro: 'Iaz piscicol' },
    ],
  },
  {
    key: 'origin_country',
    type: 'TEXT',
    isFilterable: true,
    ru: { label: 'Страна происхождения', hint: 'Например: Молдова, Норвегия' },
    ro: { label: 'Țara de origine', hint: 'De exemplu: Moldova, Norvegia' },
  },
]

const HORECA_ATTRS: readonly AttributeSpec[] = [
  {
    key: 'equipment_condition',
    type: 'SELECT',
    isFilterable: true,
    ru: { label: 'Состояние', hint: 'Новое или бывшее в употреблении' },
    ro: { label: 'Starea', hint: 'Nou sau second-hand' },
    options: [
      { value: 'NEW', ru: 'Новое', ro: 'Nou' },
      { value: 'USED', ru: 'Б/у', ro: 'Second-hand' },
      { value: 'REFURBISHED', ru: 'После восстановления', ro: 'Recondiționat' },
    ],
  },
  {
    key: 'warranty_months',
    type: 'NUMBER',
    unit: 'months',
    ru: { label: 'Гарантия', hint: 'Срок гарантии в месяцах' },
    ro: { label: 'Garanția', hint: 'Durata garanției în luni' },
  },
  {
    key: 'manufacturer_country',
    type: 'TEXT',
    ru: { label: 'Страна производителя', hint: 'Например: Италия, Турция' },
    ro: { label: 'Țara producătorului', hint: 'De exemplu: Italia, Turcia' },
  },
]

const BEVERAGE_ATTRS: readonly AttributeSpec[] = [
  {
    key: 'volume_l',
    type: 'NUMBER',
    unit: 'l',
    isFilterable: true,
    ru: { label: 'Объём тары', hint: 'Литров в одной единице' },
    ro: { label: 'Volumul ambalajului', hint: 'Litri într-o unitate' },
  },
  {
    key: 'beverage_packaging',
    type: 'SELECT',
    isFilterable: true,
    ru: { label: 'Тип тары', hint: 'В чём разлит напиток' },
    ro: { label: 'Tipul ambalajului', hint: 'În ce este îmbuteliată băutura' },
    options: [
      { value: 'PET', ru: 'ПЭТ-бутылка', ro: 'Sticlă PET' },
      { value: 'GLASS', ru: 'Стеклянная бутылка', ro: 'Sticlă de sticlă' },
      { value: 'CAN', ru: 'Банка', ro: 'Doză' },
      { value: 'TETRAPAK', ru: 'Тетра Пак', ro: 'Tetra Pak' },
      { value: 'KEG', ru: 'Кег', ro: 'Keg' },
    ],
  },
]

export const ATTRIBUTE_GROUPS = {
  MEAT_ATTRS,
  VEGETABLE_ATTRS,
  PACKAGING_ATTRS,
  DAIRY_ATTRS,
  FISH_ATTRS,
  HORECA_ATTRS,
  BEVERAGE_ATTRS,
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

export const CATEGORY_TREE: readonly CategorySpec[] = [
  {
    slug: 'vegetables',
    roSlug: 'legume-si-verdeturi',
    ru: 'Овощи и зелень',
    ro: 'Legume și verdețuri',
    defaultUnit: 'KG',
    isPopular: true,
    icon: 'carrot',
    attrs: VEGETABLE_ATTRS,
    syn: [
      ['ru', 'овощи', 100],
      ['ru', 'зелень', 80],
      ['ru', 'овощная продукция', 80],
      ['ru', 'овощи оптом', 60],
      ['ru', 'авощи', 40, true],
      ['ro', 'legume', 100],
      ['ro', 'verdețuri', 80],
      ['ro', 'verdeturi', 60],
      ['ro', 'zarzavaturi', 60],
      ['ro', 'legume proaspete', 60],
    ],
    children: [
      {
        slug: 'potatoes',
        roSlug: 'cartofi',
        ru: 'Картофель',
        ro: 'Cartofi',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'картофель', 100],
          ['ru', 'картошка', 80],
          ['ru', 'бульба', 60],
          ['ru', 'картофель продовольственный', 60],
          ['ru', 'кортошка', 40, true],
          ['ro', 'cartofi', 100],
          ['ro', 'cartof', 80],
          ['ro', 'cartofi de masă', 60],
          ['ro', 'kartofi', 40, true],
        ],
      },
      {
        slug: 'tomatoes',
        roSlug: 'rosii',
        ru: 'Помидоры',
        ro: 'Roșii',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'помидоры', 100],
          ['ru', 'томаты', 80],
          ['ru', 'помидор', 80],
          ['ru', 'помидоры грунтовые', 60],
          ['ru', 'памидоры', 40, true],
          ['ru', 'помедоры', 40, true],
          ['ro', 'roșii', 100],
          ['ro', 'rosii', 90],
          ['ro', 'tomate', 80],
          ['ro', 'roșii de seră', 60],
          ['ro', 'rosi', 40, true],
        ],
      },
      {
        slug: 'cucumbers',
        roSlug: 'castraveti',
        ru: 'Огурцы',
        ro: 'Castraveți',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'огурцы', 100],
          ['ru', 'огурец', 80],
          ['ru', 'огурцы тепличные', 60],
          ['ru', 'агурцы', 40, true],
          ['ro', 'castraveți', 100],
          ['ro', 'castraveti', 90],
          ['ro', 'castravete', 80],
          ['ro', 'castraveti de sera', 60],
        ],
      },
      {
        slug: 'onions',
        roSlug: 'ceapa',
        ru: 'Лук',
        ro: 'Ceapă',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'лук', 100],
          ['ru', 'лук репчатый', 80],
          ['ru', 'лук жёлтый', 60],
          ['ru', 'лук-репка', 60],
          ['ro', 'ceapă', 100],
          ['ro', 'ceapa', 90],
          ['ro', 'ceapă galbenă', 60],
          ['ro', 'ceapa uscata', 60],
        ],
      },
      {
        slug: 'carrots',
        roSlug: 'morcovi',
        ru: 'Морковь',
        ro: 'Morcovi',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'морковь', 100],
          ['ru', 'морковка', 60],
          ['ru', 'морковь столовая', 60],
          ['ru', 'морква', 40, true],
          ['ro', 'morcovi', 100],
          ['ro', 'morcov', 80],
          ['ro', 'morcovi de masă', 60],
        ],
      },
      {
        slug: 'cabbage',
        roSlug: 'varza',
        ru: 'Капуста',
        ro: 'Varză',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'капуста', 100],
          ['ru', 'капуста белокочанная', 80],
          ['ru', 'капуста свежая', 60],
          ['ru', 'копуста', 40, true],
          ['ro', 'varză', 100],
          ['ro', 'varza', 90],
          ['ro', 'varză albă', 60],
          ['ro', 'varza alba', 60],
        ],
      },
      {
        slug: 'greens',
        roSlug: 'verdeturi',
        ru: 'Зелень',
        ro: 'Verdețuri',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'зелень', 100],
          ['ru', 'укроп', 80],
          ['ru', 'петрушка', 80],
          ['ru', 'зелёный лук', 60],
          ['ru', 'кинза', 60],
          ['ro', 'verdețuri', 100],
          ['ro', 'verdeturi', 90],
          ['ro', 'mărar', 80],
          ['ro', 'pătrunjel', 80],
          ['ro', 'marar', 60],
          ['ro', 'patrunjel', 60],
        ],
      },
    ],
  },
  {
    slug: 'fruits',
    roSlug: 'fructe-si-pomusoare',
    ru: 'Фрукты и ягоды',
    ro: 'Fructe și pomușoare',
    defaultUnit: 'KG',
    isPopular: true,
    icon: 'apple',
    attrs: VEGETABLE_ATTRS,
    syn: [
      ['ru', 'фрукты', 100],
      ['ru', 'ягоды', 80],
      ['ru', 'фрукты оптом', 60],
      ['ru', 'фрухты', 40, true],
      ['ro', 'fructe', 100],
      ['ro', 'pomușoare', 80],
      ['ro', 'pomusoare', 60],
      ['ro', 'fructe proaspete', 60],
    ],
    children: [
      {
        slug: 'apples',
        roSlug: 'mere',
        ru: 'Яблоки',
        ro: 'Mere',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'яблоки', 100],
          ['ru', 'яблоко', 80],
          ['ru', 'яблоки молдавские', 60],
          ['ru', 'ябллоки', 40, true],
          ['ro', 'mere', 100],
          ['ro', 'măr', 80],
          ['ro', 'mar', 60],
          ['ro', 'mere de Moldova', 60],
        ],
      },
      {
        slug: 'pears',
        roSlug: 'pere',
        ru: 'Груши',
        ro: 'Pere',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'груши', 100],
          ['ru', 'груша', 80],
          ['ru', 'груши оптом', 60],
          ['ro', 'pere', 100],
          ['ro', 'pară', 80],
          ['ro', 'para', 60],
        ],
      },
      {
        slug: 'grapes',
        roSlug: 'struguri',
        ru: 'Виноград',
        ro: 'Struguri',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'виноград', 100],
          ['ru', 'виноград столовый', 80],
          ['ru', 'виноград оптом', 60],
          ['ru', 'винаград', 40, true],
          ['ro', 'struguri', 100],
          ['ro', 'strugure', 80],
          ['ro', 'struguri de masă', 60],
          ['ro', 'struguri de masa', 60],
        ],
      },
      {
        slug: 'plums',
        roSlug: 'prune',
        ru: 'Сливы',
        ro: 'Prune',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'сливы', 100],
          ['ru', 'слива', 80],
          ['ru', 'чернослив', 60],
          ['ro', 'prune', 100],
          ['ro', 'prună', 80],
          ['ro', 'pruna', 60],
        ],
      },
      {
        slug: 'berries',
        roSlug: 'pomusoare',
        ru: 'Ягоды',
        ro: 'Pomușoare',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'ягоды', 100],
          ['ru', 'клубника', 80],
          ['ru', 'малина', 80],
          ['ru', 'смородина', 60],
          ['ru', 'черешня', 60],
          ['ro', 'pomușoare', 100],
          ['ro', 'căpșuni', 80],
          ['ro', 'capsuni', 70],
          ['ro', 'zmeură', 80],
          ['ro', 'zmeura', 60],
          ['ro', 'coacăză', 60],
        ],
      },
    ],
  },
  {
    slug: 'meat',
    roSlug: 'carne',
    ru: 'Мясо',
    ro: 'Carne',
    defaultUnit: 'KG',
    isPopular: true,
    icon: 'beef',
    attrs: MEAT_ATTRS,
    syn: [
      ['ru', 'мясо', 100],
      ['ru', 'мясная продукция', 80],
      ['ru', 'мясо оптом', 60],
      ['ru', 'мяса', 40, true],
      ['ro', 'carne', 100],
      ['ro', 'produse din carne', 80],
      ['ro', 'carne proaspătă', 60],
      ['ro', 'carne proaspata', 60],
    ],
    children: [
      {
        slug: 'beef',
        roSlug: 'carne-de-vita',
        ru: 'Говядина',
        ro: 'Carne de vită',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'говядина', 100],
          ['ru', 'мясо говяжье', 80],
          ['ru', 'говядина оптом', 60],
          ['ru', 'гавядина', 40, true],
          ['ro', 'carne de vită', 100],
          ['ro', 'carne de vita', 90],
          ['ro', 'carne vita', 80],
          ['ro', 'vită', 80],
          ['ro', 'vita', 60],
        ],
        children: [
          {
            slug: 'beef-chilled',
            roSlug: 'carne-de-vita-refrigerata',
            ru: 'Охлаждённая говядина',
            ro: 'Carne de vită refrigerată',
            defaultUnit: 'KG',
            syn: [
              ['ru', 'охлаждённая говядина', 100],
              ['ru', 'говядина охлаждённая', 90],
              ['ru', 'говядина свежая', 60],
              ['ro', 'carne de vită refrigerată', 100],
              ['ro', 'carne de vita refrigerata', 90],
              ['ro', 'vită refrigerată', 60],
            ],
          },
          {
            slug: 'beef-frozen',
            roSlug: 'carne-de-vita-congelata',
            ru: 'Замороженная говядина',
            ro: 'Carne de vită congelată',
            defaultUnit: 'KG',
            syn: [
              ['ru', 'замороженная говядина', 100],
              ['ru', 'говядина замороженная', 90],
              ['ru', 'говядина заморозка', 60],
              ['ro', 'carne de vită congelată', 100],
              ['ro', 'carne de vita congelata', 90],
              ['ro', 'vită congelată', 60],
            ],
          },
        ],
      },
      {
        slug: 'pork',
        roSlug: 'carne-de-porc',
        ru: 'Свинина',
        ro: 'Carne de porc',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'свинина', 100],
          ['ru', 'мясо свиное', 80],
          ['ru', 'свинина оптом', 60],
          ['ru', 'свенина', 40, true],
          ['ro', 'carne de porc', 100],
          ['ro', 'carne porc', 80],
          ['ro', 'porc', 80],
        ],
      },
      {
        slug: 'lamb',
        roSlug: 'carne-de-oaie',
        ru: 'Баранина',
        ro: 'Carne de oaie',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'баранина', 100],
          ['ru', 'мясо баранье', 80],
          ['ru', 'ягнятина', 60],
          ['ro', 'carne de oaie', 100],
          ['ro', 'carne de miel', 80],
          ['ro', 'miel', 60],
          ['ro', 'oaie', 60],
        ],
      },
      {
        slug: 'veal',
        roSlug: 'carne-de-vitel',
        ru: 'Телятина',
        ro: 'Carne de vițel',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'телятина', 100],
          ['ru', 'мясо телячье', 80],
          ['ru', 'телятина охлаждённая', 60],
          ['ro', 'carne de vițel', 100],
          ['ro', 'carne de vitel', 90],
          ['ro', 'vițel', 60],
        ],
      },
    ],
  },
  {
    slug: 'poultry',
    roSlug: 'carne-de-pasare',
    ru: 'Птица',
    ro: 'Carne de pasăre',
    defaultUnit: 'KG',
    icon: 'drumstick',
    attrs: MEAT_ATTRS,
    syn: [
      ['ru', 'птица', 100],
      ['ru', 'мясо птицы', 90],
      ['ru', 'куриное мясо', 80],
      ['ru', 'кура', 60],
      ['ru', 'куриця', 40, true],
      ['ro', 'carne de pasăre', 100],
      ['ro', 'carne de pasare', 90],
      ['ro', 'pasăre', 60],
      ['ro', 'pui', 60],
    ],
    children: [
      {
        slug: 'chicken',
        roSlug: 'pui',
        ru: 'Курица',
        ro: 'Pui',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'курица', 100],
          ['ru', 'куриное филе', 80],
          ['ru', 'бройлер', 60],
          ['ru', 'курятина', 60],
          ['ru', 'кура', 60],
          ['ru', 'курица оптом', 60],
          ['ro', 'pui', 100],
          ['ro', 'carne de pui', 90],
          ['ro', 'piept de pui', 80],
          ['ro', 'găină', 60],
          ['ro', 'gaina', 60],
        ],
        children: [
          {
            slug: 'chicken-chilled',
            roSlug: 'pui-refrigerat',
            ru: 'Охлаждённая курица',
            ro: 'Pui refrigerat',
            defaultUnit: 'KG',
            syn: [
              ['ru', 'охлаждённая курица', 100],
              ['ru', 'курица охлаждённая', 90],
              ['ru', 'тушка охлаждённая', 60],
              ['ro', 'pui refrigerat', 100],
              ['ro', 'carne de pui refrigerata', 80],
            ],
          },
          {
            slug: 'chicken-frozen',
            roSlug: 'pui-congelat',
            ru: 'Замороженная курица',
            ro: 'Pui congelat',
            defaultUnit: 'KG',
            syn: [
              ['ru', 'замороженная курица', 100],
              ['ru', 'курица заморозка', 80],
              ['ru', 'тушка замороженная', 60],
              ['ro', 'pui congelat', 100],
              ['ro', 'carne de pui congelata', 80],
            ],
          },
        ],
      },
      {
        slug: 'turkey',
        roSlug: 'curcan',
        ru: 'Индейка',
        ro: 'Curcan',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'индейка', 100],
          ['ru', 'мясо индейки', 80],
          ['ru', 'индюшка', 60],
          ['ro', 'curcan', 100],
          ['ro', 'carne de curcan', 80],
        ],
      },
      {
        slug: 'duck',
        roSlug: 'rata',
        ru: 'Утка',
        ro: 'Rață',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'утка', 100],
          ['ru', 'мясо утки', 80],
          ['ru', 'гусь', 60],
          ['ro', 'rață', 100],
          ['ro', 'rata', 90],
          ['ro', 'carne de rață', 80],
        ],
      },
    ],
  },
  {
    slug: 'dairy',
    roSlug: 'lactate',
    ru: 'Молочные продукты',
    ro: 'Lactate',
    defaultUnit: 'L',
    isPopular: true,
    icon: 'milk',
    attrs: DAIRY_ATTRS,
    syn: [
      ['ru', 'молочные продукты', 100],
      ['ru', 'молочная продукция', 90],
      ['ru', 'молочка', 60],
      ['ru', 'молочные изделия', 60],
      ['ru', 'малочка', 40, true],
      ['ro', 'lactate', 100],
      ['ro', 'produse lactate', 90],
      ['ro', 'produse din lapte', 80],
      ['ro', 'lactata', 40, true],
    ],
    children: [
      {
        slug: 'milk',
        roSlug: 'lapte',
        ru: 'Молоко',
        ro: 'Lapte',
        defaultUnit: 'L',
        syn: [
          ['ru', 'молоко', 100],
          ['ru', 'молоко коровье', 80],
          ['ru', 'молоко сырое', 60],
          ['ru', 'молоко пастеризованное', 60],
          ['ru', 'малако', 40, true],
          ['ro', 'lapte', 100],
          ['ro', 'lapte de vacă', 80],
          ['ro', 'lapte de vaca', 70],
          ['ro', 'lapte crud', 60],
        ],
      },
      {
        slug: 'cheese',
        roSlug: 'branza',
        ru: 'Сыр',
        ro: 'Brânză',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'сыр', 100],
          ['ru', 'сыры', 90],
          ['ru', 'брынза', 60],
          ['ru', 'сыр твёрдый', 60],
          ['ru', 'сыр оптом', 60],
          ['ro', 'brânză', 100],
          ['ro', 'branza', 90],
          ['ro', 'cașcaval', 80],
          ['ro', 'cascaval', 70],
          ['ro', 'brinza', 40, true],
        ],
      },
      {
        slug: 'cottage-cheese',
        roSlug: 'branza-de-vaci',
        ru: 'Творог',
        ro: 'Brânză de vaci',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'творог', 100],
          ['ru', 'творожная масса', 60],
          ['ru', 'тварог', 40, true],
          ['ro', 'brânză de vaci', 100],
          ['ro', 'branza de vaci', 90],
          ['ro', 'urdă', 60],
        ],
      },
      {
        slug: 'sour-cream',
        roSlug: 'smantana',
        ru: 'Сметана',
        ro: 'Smântână',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'сметана', 100],
          ['ru', 'сметана 20%', 60],
          ['ru', 'сметана оптом', 60],
          ['ro', 'smântână', 100],
          ['ro', 'smantana', 90],
          ['ro', 'smîntînă', 60],
        ],
      },
      {
        slug: 'butter',
        roSlug: 'unt',
        ru: 'Масло сливочное',
        ro: 'Unt',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'масло сливочное', 100],
          ['ru', 'сливочное масло', 90],
          ['ru', 'масло 82.5', 60],
          ['ru', 'масло крестьянское', 60],
          ['ro', 'unt', 100],
          ['ro', 'unt de vacă', 80],
          ['ro', 'unt 82%', 60],
        ],
      },
      {
        slug: 'yogurt',
        roSlug: 'iaurt',
        ru: 'Йогурт',
        ro: 'Iaurt',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'йогурт', 100],
          ['ru', 'йогурты', 90],
          ['ru', 'кефир', 60],
          ['ru', 'ряженка', 60],
          ['ro', 'iaurt', 100],
          ['ro', 'iaurt natural', 80],
          ['ro', 'chefir', 60],
        ],
      },
    ],
  },
  {
    slug: 'eggs',
    roSlug: 'oua',
    ru: 'Яйца',
    ro: 'Ouă',
    defaultUnit: 'PCS',
    icon: 'egg',
    syn: [
      ['ru', 'яйца', 100],
      ['ru', 'яйцо', 80],
      ['ru', 'яйца куриные', 80],
      ['ru', 'яйцо столовое', 60],
      ['ru', 'яица', 40, true],
      ['ro', 'ouă', 100],
      ['ro', 'oua', 90],
      ['ro', 'ou', 80],
      ['ro', 'ouă de găină', 80],
      ['ro', 'oua de gaina', 60],
    ],
    children: [
      {
        slug: 'chicken-eggs',
        roSlug: 'oua-de-gaina',
        ru: 'Яйца куриные',
        ro: 'Ouă de găină',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'яйца куриные', 100],
          ['ru', 'яйцо С0', 60],
          ['ru', 'яйцо С1', 60],
          ['ru', 'яйца отборные', 60],
          ['ro', 'ouă de găină', 100],
          ['ro', 'oua de gaina', 90],
          ['ro', 'ouă categoria A', 60],
        ],
      },
      {
        slug: 'quail-eggs',
        roSlug: 'oua-de-prepelita',
        ru: 'Яйца перепелиные',
        ro: 'Ouă de prepeliță',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'яйца перепелиные', 100],
          ['ru', 'перепелиные яйца', 90],
          ['ro', 'ouă de prepeliță', 100],
          ['ro', 'oua de prepelita', 90],
        ],
      },
    ],
  },
  {
    slug: 'fish',
    roSlug: 'peste-si-fructe-de-mare',
    ru: 'Рыба и морепродукты',
    ro: 'Pește și fructe de mare',
    defaultUnit: 'KG',
    isPopular: true,
    icon: 'fish',
    attrs: FISH_ATTRS,
    syn: [
      ['ru', 'рыба', 100],
      ['ru', 'морепродукты', 80],
      ['ru', 'рыбная продукция', 80],
      ['ru', 'рыба оптом', 60],
      ['ru', 'риба', 40, true],
      ['ro', 'pește', 100],
      ['ro', 'peste', 90],
      ['ro', 'fructe de mare', 80],
      ['ro', 'produse din pește', 60],
    ],
    children: [
      {
        slug: 'fish-fresh',
        roSlug: 'peste-proaspat',
        ru: 'Свежая рыба',
        ro: 'Pește proaspăt',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'свежая рыба', 100],
          ['ru', 'рыба охлаждённая', 80],
          ['ru', 'живая рыба', 60],
          ['ru', 'карп живой', 60],
          ['ro', 'pește proaspăt', 100],
          ['ro', 'peste proaspat', 90],
          ['ro', 'pește viu', 60],
        ],
      },
      {
        slug: 'fish-frozen',
        roSlug: 'peste-congelat',
        ru: 'Замороженная рыба',
        ro: 'Pește congelat',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'замороженная рыба', 100],
          ['ru', 'рыба заморозка', 80],
          ['ru', 'рыба свежемороженая', 60],
          ['ro', 'pește congelat', 100],
          ['ro', 'peste congelat', 90],
        ],
      },
      {
        slug: 'seafood',
        roSlug: 'fructe-de-mare',
        ru: 'Морепродукты',
        ro: 'Fructe de mare',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'морепродукты', 100],
          ['ru', 'креветки', 80],
          ['ru', 'мидии', 80],
          ['ru', 'кальмары', 60],
          ['ro', 'fructe de mare', 100],
          ['ro', 'creveți', 80],
          ['ro', 'creveti', 70],
          ['ro', 'midii', 80],
          ['ro', 'calamar', 60],
        ],
      },
      {
        slug: 'fish-salted',
        roSlug: 'peste-sarat',
        ru: 'Солёная рыба',
        ro: 'Pește sărat',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'солёная рыба', 100],
          ['ru', 'сельдь солёная', 80],
          ['ru', 'рыба копчёная', 60],
          ['ro', 'pește sărat', 100],
          ['ro', 'peste sarat', 90],
          ['ro', 'scrumbie sărată', 60],
        ],
      },
    ],
  },
  {
    slug: 'grains',
    roSlug: 'cereale-si-boabe',
    ru: 'Крупы и зерно',
    ro: 'Cereale și boabe',
    defaultUnit: 'KG',
    icon: 'wheat',
    syn: [
      ['ru', 'крупы', 100],
      ['ru', 'зерно', 80],
      ['ru', 'крупа', 80],
      ['ru', 'зерновые', 60],
      ['ru', 'крупы оптом', 60],
      ['ro', 'cereale', 100],
      ['ro', 'boabe', 80],
      ['ro', 'crupe', 80],
      ['ro', 'cereale boabe', 60],
    ],
    children: [
      {
        slug: 'rice',
        roSlug: 'orez',
        ru: 'Рис',
        ro: 'Orez',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'рис', 100],
          ['ru', 'рис круглозёрный', 60],
          ['ru', 'рис длиннозёрный', 60],
          ['ro', 'orez', 100],
          ['ro', 'orez cu bob rotund', 60],
        ],
      },
      {
        slug: 'buckwheat',
        roSlug: 'hrisca',
        ru: 'Гречка',
        ro: 'Hrișcă',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'гречка', 100],
          ['ru', 'гречневая крупа', 90],
          ['ru', 'греча', 60],
          ['ro', 'hrișcă', 100],
          ['ro', 'hrisca', 90],
          ['ro', 'crupe de hrișcă', 60],
        ],
      },
      {
        slug: 'wheat-grain',
        roSlug: 'grau',
        ru: 'Пшеница',
        ro: 'Grâu',
        defaultUnit: 'T',
        syn: [
          ['ru', 'пшеница', 100],
          ['ru', 'зерно пшеницы', 80],
          ['ru', 'пшеница фуражная', 60],
          ['ro', 'grâu', 100],
          ['ro', 'grau', 90],
          ['ro', 'grâu furajer', 60],
        ],
      },
      {
        slug: 'legumes',
        roSlug: 'leguminoase',
        ru: 'Бобовые',
        ro: 'Leguminoase',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'бобовые', 100],
          ['ru', 'фасоль', 80],
          ['ru', 'горох', 80],
          ['ru', 'нут', 60],
          ['ru', 'чечевица', 60],
          ['ro', 'leguminoase', 100],
          ['ro', 'fasole', 80],
          ['ro', 'mazăre', 80],
          ['ro', 'mazare', 60],
          ['ro', 'linte', 60],
        ],
      },
    ],
  },
  {
    slug: 'flour',
    roSlug: 'faina',
    ru: 'Мука',
    ro: 'Făină',
    defaultUnit: 'KG',
    icon: 'wheat',
    syn: [
      ['ru', 'мука', 100],
      ['ru', 'мука пшеничная', 80],
      ['ru', 'мука оптом', 60],
      ['ru', 'мукка', 40, true],
      ['ro', 'făină', 100],
      ['ro', 'faina', 90],
      ['ro', 'făină de grâu', 80],
      ['ro', 'faina de grau', 60],
    ],
    children: [
      {
        slug: 'wheat-flour',
        roSlug: 'faina-de-grau',
        ru: 'Мука пшеничная',
        ro: 'Făină de grâu',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'мука пшеничная', 100],
          ['ru', 'мука высший сорт', 80],
          ['ru', 'мука в/с', 60],
          ['ro', 'făină de grâu', 100],
          ['ro', 'faina de grau', 90],
          ['ro', 'făină calitate superioară', 60],
        ],
      },
      {
        slug: 'corn-flour',
        roSlug: 'faina-de-porumb',
        ru: 'Мука кукурузная',
        ro: 'Făină de porumb',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'мука кукурузная', 100],
          ['ru', 'кукурузная мука', 90],
          ['ru', 'мамалыжная мука', 60],
          ['ro', 'făină de porumb', 100],
          ['ro', 'faina de porumb', 90],
          ['ro', 'mălai', 80],
          ['ro', 'malai', 60],
        ],
      },
    ],
  },
  {
    slug: 'bakery',
    roSlug: 'paine-si-panificatie',
    ru: 'Хлеб и выпечка',
    ro: 'Pâine și panificație',
    defaultUnit: 'PCS',
    icon: 'bread',
    syn: [
      ['ru', 'хлеб', 100],
      ['ru', 'выпечка', 80],
      ['ru', 'хлебобулочные изделия', 80],
      ['ru', 'булочки', 60],
      ['ru', 'хлеп', 40, true],
      ['ro', 'pâine', 100],
      ['ro', 'paine', 90],
      ['ro', 'panificație', 80],
      ['ro', 'panificatie', 70],
      ['ro', 'produse de panificație', 60],
    ],
    children: [
      {
        slug: 'bread',
        roSlug: 'paine',
        ru: 'Хлеб',
        ro: 'Pâine',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'хлеб', 100],
          ['ru', 'хлеб белый', 80],
          ['ru', 'хлеб ржаной', 60],
          ['ru', 'батон', 60],
          ['ro', 'pâine', 100],
          ['ro', 'paine', 90],
          ['ro', 'pâine albă', 60],
          ['ro', 'pâine de secară', 60],
        ],
      },
      {
        slug: 'pastry',
        roSlug: 'patiserie',
        ru: 'Выпечка',
        ro: 'Patiserie',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'выпечка', 100],
          ['ru', 'булочки', 80],
          ['ru', 'круассаны', 60],
          ['ru', 'слойки', 60],
          ['ro', 'patiserie', 100],
          ['ro', 'cornuri', 80],
          ['ro', 'croissante', 60],
          ['ro', 'plăcinte', 60],
        ],
      },
    ],
  },
  {
    slug: 'oils',
    roSlug: 'uleiuri',
    ru: 'Масла',
    ro: 'Uleiuri',
    defaultUnit: 'L',
    icon: 'droplet',
    syn: [
      ['ru', 'масла', 100],
      ['ru', 'масло растительное', 90],
      ['ru', 'растительное масло', 80],
      ['ru', 'подсолнечное масло', 80],
      ['ru', 'масло оптом', 60],
      ['ro', 'uleiuri', 100],
      ['ro', 'ulei', 90],
      ['ro', 'ulei vegetal', 80],
      ['ro', 'ulei de floarea soarelui', 80],
    ],
    children: [
      {
        slug: 'sunflower-oil',
        roSlug: 'ulei-de-floarea-soarelui',
        ru: 'Масло подсолнечное',
        ro: 'Ulei de floarea-soarelui',
        defaultUnit: 'L',
        syn: [
          ['ru', 'масло подсолнечное', 100],
          ['ru', 'подсолнечное масло', 90],
          ['ru', 'масло рафинированное', 60],
          ['ro', 'ulei de floarea-soarelui', 100],
          ['ro', 'ulei de floarea soarelui', 90],
          ['ro', 'ulei rafinat', 60],
        ],
      },
      {
        slug: 'olive-oil',
        roSlug: 'ulei-de-masline',
        ru: 'Масло оливковое',
        ro: 'Ulei de măsline',
        defaultUnit: 'L',
        syn: [
          ['ru', 'масло оливковое', 100],
          ['ru', 'оливковое масло', 90],
          ['ru', 'масло extra virgin', 60],
          ['ro', 'ulei de măsline', 100],
          ['ro', 'ulei de masline', 90],
        ],
      },
    ],
  },
  {
    slug: 'spices',
    roSlug: 'condimente-si-sosuri',
    ru: 'Специи и соусы',
    ro: 'Condimente și sosuri',
    defaultUnit: 'KG',
    icon: 'pepper',
    syn: [
      ['ru', 'специи', 100],
      ['ru', 'приправы', 90],
      ['ru', 'соусы', 80],
      ['ru', 'пряности', 60],
      ['ru', 'специи оптом', 60],
      ['ro', 'condimente', 100],
      ['ro', 'sosuri', 80],
      ['ro', 'mirodenii', 80],
      ['ro', 'condimente si sosuri', 60],
    ],
    children: [
      {
        slug: 'spices-dry',
        roSlug: 'condimente',
        ru: 'Специи и приправы',
        ro: 'Condimente',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'специи', 100],
          ['ru', 'приправы', 90],
          ['ru', 'перец чёрный', 60],
          ['ru', 'паприка', 60],
          ['ro', 'condimente', 100],
          ['ro', 'mirodenii', 90],
          ['ro', 'piper negru', 60],
          ['ro', 'boia', 60],
        ],
      },
      {
        slug: 'sauces',
        roSlug: 'sosuri',
        ru: 'Соусы',
        ro: 'Sosuri',
        defaultUnit: 'L',
        syn: [
          ['ru', 'соусы', 100],
          ['ru', 'кетчуп', 80],
          ['ru', 'майонез', 80],
          ['ru', 'горчица', 60],
          ['ro', 'sosuri', 100],
          ['ro', 'ketchup', 80],
          ['ro', 'maioneză', 80],
          ['ro', 'muștar', 60],
        ],
      },
    ],
  },
  {
    slug: 'beverages',
    roSlug: 'bauturi',
    ru: 'Напитки',
    ro: 'Băuturi',
    defaultUnit: 'L',
    isPopular: true,
    icon: 'cup',
    attrs: BEVERAGE_ATTRS,
    syn: [
      ['ru', 'напитки', 100],
      ['ru', 'вода', 80],
      ['ru', 'соки', 80],
      ['ru', 'напитки оптом', 60],
      ['ru', 'напидки', 40, true],
      ['ro', 'băuturi', 100],
      ['ro', 'bauturi', 90],
      ['ro', 'apă', 80],
      ['ro', 'sucuri', 80],
    ],
    children: [
      {
        slug: 'water',
        roSlug: 'apa',
        ru: 'Вода',
        ro: 'Apă',
        defaultUnit: 'L',
        syn: [
          ['ru', 'вода', 100],
          ['ru', 'вода питьевая', 90],
          ['ru', 'вода минеральная', 80],
          ['ru', 'вада', 40, true],
          ['ro', 'apă', 100],
          ['ro', 'apa', 90],
          ['ro', 'apă potabilă', 80],
          ['ro', 'apa minerala', 70],
        ],
        children: [
          {
            slug: 'water-still',
            roSlug: 'apa-plata',
            ru: 'Вода негазированная',
            ro: 'Apă plată',
            defaultUnit: 'L',
            syn: [
              ['ru', 'вода негазированная', 100],
              ['ru', 'вода без газа', 80],
              ['ro', 'apă plată', 100],
              ['ro', 'apa plata', 90],
            ],
          },
          {
            slug: 'water-sparkling',
            roSlug: 'apa-carbogazoasa',
            ru: 'Вода газированная',
            ro: 'Apă carbogazoasă',
            defaultUnit: 'L',
            syn: [
              ['ru', 'вода газированная', 100],
              ['ru', 'вода с газом', 80],
              ['ro', 'apă carbogazoasă', 100],
              ['ro', 'apa carbogazoasa', 90],
              ['ro', 'apă minerală gazoasă', 60],
            ],
          },
        ],
      },
      {
        slug: 'juices',
        roSlug: 'sucuri',
        ru: 'Соки',
        ro: 'Sucuri',
        defaultUnit: 'L',
        syn: [
          ['ru', 'соки', 100],
          ['ru', 'сок', 90],
          ['ru', 'сок яблочный', 60],
          ['ru', 'нектар', 60],
          ['ro', 'sucuri', 100],
          ['ro', 'suc', 90],
          ['ro', 'suc de mere', 60],
          ['ro', 'nectar', 60],
        ],
      },
      {
        slug: 'soft-drinks',
        roSlug: 'bauturi-racoritoare',
        ru: 'Безалкогольные напитки',
        ro: 'Băuturi răcoritoare',
        defaultUnit: 'L',
        syn: [
          ['ru', 'безалкогольные напитки', 100],
          ['ru', 'лимонад', 80],
          ['ru', 'газировка', 60],
          ['ro', 'băuturi răcoritoare', 100],
          ['ro', 'bauturi racoritoare', 90],
          ['ro', 'limonadă', 60],
        ],
      },
      {
        slug: 'coffee',
        roSlug: 'cafea',
        ru: 'Кофе',
        ro: 'Cafea',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'кофе', 100],
          ['ru', 'кофе в зёрнах', 80],
          ['ru', 'кофе молотый', 60],
          ['ro', 'cafea', 100],
          ['ro', 'cafea boabe', 80],
          ['ro', 'cafea măcinată', 60],
        ],
      },
      {
        slug: 'tea',
        roSlug: 'ceai',
        ru: 'Чай',
        ro: 'Ceai',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'чай', 100],
          ['ru', 'чай чёрный', 80],
          ['ru', 'чай зелёный', 60],
          ['ro', 'ceai', 100],
          ['ro', 'ceai negru', 80],
          ['ro', 'ceai verde', 60],
        ],
      },
    ],
  },
  {
    slug: 'frozen',
    roSlug: 'produse-congelate',
    ru: 'Замороженные продукты',
    ro: 'Produse congelate',
    defaultUnit: 'KG',
    icon: 'snowflake',
    syn: [
      ['ru', 'замороженные продукты', 100],
      ['ru', 'заморозка', 80],
      ['ru', 'полуфабрикаты', 60],
      ['ru', 'шоковая заморозка', 60],
      ['ro', 'produse congelate', 100],
      ['ro', 'congelate', 90],
      ['ro', 'semipreparate congelate', 60],
    ],
    children: [
      {
        slug: 'frozen-vegetables',
        roSlug: 'legume-congelate',
        ru: 'Замороженные овощи',
        ro: 'Legume congelate',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'замороженные овощи', 100],
          ['ru', 'овощи заморозка', 80],
          ['ru', 'овощная смесь', 60],
          ['ro', 'legume congelate', 100],
          ['ro', 'amestec de legume', 60],
        ],
      },
      {
        slug: 'frozen-berries',
        roSlug: 'pomusoare-congelate',
        ru: 'Замороженные ягоды',
        ro: 'Pomușoare congelate',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'замороженные ягоды', 100],
          ['ru', 'ягоды заморозка', 80],
          ['ro', 'pomușoare congelate', 100],
          ['ro', 'fructe congelate', 80],
        ],
      },
      {
        slug: 'semi-finished',
        roSlug: 'semipreparate',
        ru: 'Полуфабрикаты',
        ro: 'Semipreparate',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'полуфабрикаты', 100],
          ['ru', 'пельмени', 80],
          ['ru', 'вареники', 60],
          ['ru', 'котлеты', 60],
          ['ro', 'semipreparate', 100],
          ['ro', 'pelmeni', 60],
          ['ro', 'chiftele', 60],
        ],
      },
    ],
  },
  {
    slug: 'honey',
    roSlug: 'miere',
    ru: 'Мёд',
    ro: 'Miere',
    defaultUnit: 'KG',
    icon: 'honey',
    syn: [
      ['ru', 'мёд', 100],
      ['ru', 'мед', 90],
      ['ru', 'мёд натуральный', 80],
      ['ru', 'медовая продукция', 60],
      ['ru', 'мет', 40, true],
      ['ro', 'miere', 100],
      ['ro', 'miere naturală', 80],
      ['ro', 'miere de albine', 80],
      ['ro', 'mere de albine', 40, true],
    ],
    children: [
      {
        slug: 'honey-acacia',
        roSlug: 'miere-de-salcam',
        ru: 'Мёд акациевый',
        ro: 'Miere de salcâm',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'мёд акациевый', 100],
          ['ru', 'акациевый мёд', 90],
          ['ro', 'miere de salcâm', 100],
          ['ro', 'miere de salcam', 90],
        ],
      },
      {
        slug: 'honey-polyfloral',
        roSlug: 'miere-poliflora',
        ru: 'Мёд разнотравье',
        ro: 'Miere polifloră',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'мёд разнотравье', 100],
          ['ru', 'полифлорный мёд', 80],
          ['ro', 'miere polifloră', 100],
          ['ro', 'miere poliflora', 90],
        ],
      },
    ],
  },
  {
    slug: 'canned',
    roSlug: 'conserve',
    ru: 'Консервация',
    ro: 'Conserve',
    defaultUnit: 'PCS',
    icon: 'jar',
    syn: [
      ['ru', 'консервация', 100],
      ['ru', 'консервы', 90],
      ['ru', 'соленья', 60],
      ['ru', 'варенье', 60],
      ['ro', 'conserve', 100],
      ['ro', 'murături', 80],
      ['ro', 'muraturi', 70],
      ['ro', 'dulceață', 60],
    ],
    children: [
      {
        slug: 'canned-vegetables',
        roSlug: 'conserve-de-legume',
        ru: 'Овощные консервы',
        ro: 'Conserve de legume',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'овощные консервы', 100],
          ['ru', 'консервы овощные', 90],
          ['ru', 'лечо', 60],
          ['ru', 'икра кабачковая', 60],
          ['ro', 'conserve de legume', 100],
          ['ro', 'zacuscă', 80],
          ['ro', 'zacusca', 70],
        ],
      },
      {
        slug: 'jams',
        roSlug: 'dulceturi-si-gemuri',
        ru: 'Варенье и джемы',
        ro: 'Dulcețuri și gemuri',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'варенье', 100],
          ['ru', 'джем', 80],
          ['ru', 'повидло', 60],
          ['ro', 'dulceață', 100],
          ['ro', 'gem', 80],
          ['ro', 'dulceata', 70],
        ],
      },
      {
        slug: 'pickles',
        roSlug: 'muraturi',
        ru: 'Соленья',
        ro: 'Murături',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'соленья', 100],
          ['ru', 'огурцы солёные', 80],
          ['ru', 'помидоры солёные', 60],
          ['ru', 'капуста квашеная', 60],
          ['ro', 'murături', 100],
          ['ro', 'muraturi', 90],
          ['ro', 'castraveți murați', 60],
        ],
      },
    ],
  },
  {
    slug: 'packaging',
    roSlug: 'ambalaje',
    ru: 'Упаковка',
    ro: 'Ambalaje',
    defaultUnit: 'PCS',
    isPopular: true,
    icon: 'package',
    attrs: PACKAGING_ATTRS,
    syn: [
      ['ru', 'упаковка', 100],
      ['ru', 'упаковочные материалы', 90],
      ['ru', 'упаковка для еды', 80],
      ['ru', 'упаковка для продуктов', 80],
      ['ru', 'тара', 80],
      ['ru', 'упаковка оптом', 60],
      ['ru', 'упоковка', 40, true],
      ['ro', 'ambalaje', 100],
      ['ro', 'ambalaj', 90],
      ['ro', 'ambalaje alimentare', 80],
      ['ro', 'ambalaje pentru mancare', 70],
    ],
    children: [
      {
        slug: 'pizza-boxes',
        roSlug: 'cutii-pizza',
        ru: 'Коробки для пиццы',
        ro: 'Cutii pizza',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'коробки для пиццы', 100],
          ['ru', 'коробка для пиццы', 90],
          ['ru', 'коробки пицца', 80],
          ['ru', 'пиццакоробки', 60],
          ['ro', 'cutii pizza', 100],
          ['ro', 'cutii pentru pizza', 90],
          ['ro', 'cutie pizza', 80],
        ],
      },
      {
        slug: 'cardboard-packaging',
        roSlug: 'ambalaje-din-carton',
        ru: 'Картонная упаковка',
        ro: 'Ambalaje din carton',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'картонная упаковка', 100],
          ['ru', 'коробки картонные', 90],
          ['ru', 'гофрокороб', 80],
          ['ru', 'картон', 60],
          ['ro', 'ambalaje din carton', 100],
          ['ro', 'cutii de carton', 90],
          ['ro', 'carton ondulat', 60],
        ],
      },
      {
        slug: 'containers',
        roSlug: 'caserole',
        ru: 'Контейнеры',
        ro: 'Caserole',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'контейнеры', 100],
          ['ru', 'контейнеры для еды', 90],
          ['ru', 'упаковка для еды', 80],
          ['ru', 'контейнеры horeca', 80],
          ['ru', 'ланч-боксы', 60],
          ['ro', 'caserole', 100],
          ['ro', 'containere', 90],
          ['ro', 'caserole pentru mancare', 80],
          ['ro', 'ambalaje pentru mâncare', 70],
        ],
      },
      {
        slug: 'bags',
        roSlug: 'pungi',
        ru: 'Пакеты',
        ro: 'Pungi',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'пакеты', 100],
          ['ru', 'пакеты фасовочные', 80],
          ['ru', 'пакет-майка', 60],
          ['ru', 'мешки', 60],
          ['ro', 'pungi', 100],
          ['ro', 'saci', 80],
          ['ro', 'pungi de plastic', 60],
        ],
      },
      {
        slug: 'film',
        roSlug: 'folie',
        ru: 'Плёнка',
        ro: 'Folie',
        defaultUnit: 'KG',
        syn: [
          ['ru', 'плёнка', 100],
          ['ru', 'пленка', 90],
          ['ru', 'стрейч-плёнка', 80],
          ['ru', 'пищевая плёнка', 80],
          ['ro', 'folie', 100],
          ['ro', 'folie stretch', 80],
          ['ro', 'folie alimentară', 80],
        ],
      },
      {
        slug: 'labels',
        roSlug: 'etichete',
        ru: 'Этикетки',
        ro: 'Etichete',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'этикетки', 100],
          ['ru', 'самоклеящиеся этикетки', 80],
          ['ru', 'наклейки', 60],
          ['ro', 'etichete', 100],
          ['ro', 'etichete autoadezive', 80],
          ['ro', 'stickere', 60],
        ],
      },
    ],
  },
  {
    slug: 'disposables',
    roSlug: 'vesela-de-unica-folosinta',
    ru: 'Одноразовая посуда',
    ro: 'Veselă de unică folosință',
    defaultUnit: 'PCS',
    icon: 'utensils',
    syn: [
      ['ru', 'одноразовая посуда', 100],
      ['ru', 'посуда одноразовая', 90],
      ['ru', 'одноразовая', 80],
      ['ru', 'стаканчики', 60],
      ['ro', 'veselă de unică folosință', 100],
      ['ro', 'vesela de unica folosinta', 90],
      ['ro', 'veselă unică', 60],
      ['ro', 'pahare de unica folosinta', 60],
    ],
    children: [
      {
        slug: 'disposable-tableware',
        roSlug: 'farfurii-si-pahare',
        ru: 'Тарелки и стаканы',
        ro: 'Farfurii și pahare',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'тарелки одноразовые', 100],
          ['ru', 'стаканы одноразовые', 90],
          ['ru', 'стаканчики бумажные', 60],
          ['ro', 'farfurii de unică folosință', 100],
          ['ro', 'pahare de carton', 80],
        ],
      },
      {
        slug: 'disposable-cutlery',
        roSlug: 'tacamuri-de-unica-folosinta',
        ru: 'Одноразовые приборы',
        ro: 'Tacâmuri de unică folosință',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'одноразовые приборы', 100],
          ['ru', 'вилки одноразовые', 80],
          ['ru', 'трубочки', 60],
          ['ro', 'tacâmuri de unică folosință', 100],
          ['ro', 'tacamuri de unica folosinta', 90],
          ['ro', 'paie', 60],
        ],
      },
    ],
  },
  {
    slug: 'cleaning',
    roSlug: 'produse-de-curatenie',
    ru: 'Товары для уборки',
    ro: 'Produse de curățenie',
    defaultUnit: 'PCS',
    icon: 'spray',
    syn: [
      ['ru', 'товары для уборки', 100],
      ['ru', 'моющие средства', 90],
      ['ru', 'бытовая химия', 80],
      ['ru', 'уборка', 80],
      ['ro', 'produse de curățenie', 100],
      ['ro', 'produse de curatenie', 90],
      ['ro', 'detergenți', 80],
      ['ro', 'chimie de uz casnic', 60],
    ],
    children: [
      {
        slug: 'detergents',
        roSlug: 'detergenti',
        ru: 'Моющие средства',
        ro: 'Detergenți',
        defaultUnit: 'L',
        syn: [
          ['ru', 'моющие средства', 100],
          ['ru', 'детергенты', 80],
          ['ru', 'средство для мытья посуды', 60],
          ['ro', 'detergenți', 100],
          ['ro', 'detergenti', 90],
          ['ro', 'detergent de vase', 60],
        ],
      },
      {
        slug: 'paper-products',
        roSlug: 'produse-din-hartie',
        ru: 'Бумажная продукция',
        ro: 'Produse din hârtie',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'бумажные полотенца', 100],
          ['ru', 'салфетки', 80],
          ['ru', 'туалетная бумага', 80],
          ['ro', 'prosoape de hârtie', 100],
          ['ro', 'șervețele', 80],
          ['ro', 'hârtie igienică', 80],
        ],
      },
    ],
  },
  {
    slug: 'horeca',
    roSlug: 'echipament-horeca',
    ru: 'Оборудование HoReCa',
    ro: 'Echipament HoReCa',
    defaultUnit: 'PCS',
    isPopular: true,
    icon: 'chef-hat',
    attrs: HORECA_ATTRS,
    syn: [
      ['ru', 'оборудование horeca', 100],
      ['ru', 'horeca', 90],
      ['ru', 'оборудование для ресторанов', 80],
      ['ru', 'кухонное оборудование', 80],
      ['ru', 'хорека', 60],
      ['ro', 'echipament horeca', 100],
      ['ro', 'echipamente horeca', 90],
      ['ro', 'utilaj pentru restaurante', 80],
      ['ro', 'horeca', 90],
    ],
    children: [
      {
        slug: 'horeca-equipment',
        roSlug: 'utilaje',
        ru: 'Оборудование',
        ro: 'Utilaje',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'оборудование', 100],
          ['ru', 'холодильное оборудование', 80],
          ['ru', 'печи', 60],
          ['ru', 'плиты', 60],
          ['ro', 'utilaje', 100],
          ['ro', 'echipament frigorific', 80],
          ['ro', 'cuptoare', 60],
        ],
      },
      {
        slug: 'horeca-inventory',
        roSlug: 'inventar',
        ru: 'Инвентарь',
        ro: 'Inventar',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'инвентарь', 100],
          ['ru', 'посуда профессиональная', 80],
          ['ru', 'гастроёмкости', 60],
          ['ru', 'ножи', 60],
          ['ro', 'inventar', 100],
          ['ro', 'veselă profesională', 80],
          ['ro', 'cuțite', 60],
        ],
      },
      {
        slug: 'horeca-consumables',
        roSlug: 'consumabile',
        ru: 'Расходные материалы',
        ro: 'Consumabile',
        defaultUnit: 'PCS',
        syn: [
          ['ru', 'расходные материалы', 100],
          ['ru', 'расходники', 80],
          ['ru', 'перчатки', 60],
          ['ru', 'фольга', 60],
          ['ro', 'consumabile', 100],
          ['ro', 'materiale consumabile', 90],
          ['ro', 'mănuși', 60],
        ],
      },
    ],
  },
  {
    slug: 'logistics',
    roSlug: 'transport-si-livrare',
    ru: 'Транспорт и доставка',
    ro: 'Transport și livrare',
    defaultUnit: 'SET',
    icon: 'truck',
    syn: [
      ['ru', 'транспорт', 100],
      ['ru', 'доставка', 90],
      ['ru', 'логистика', 80],
      ['ru', 'перевозки', 80],
      ['ru', 'рефрижератор', 60],
      ['ro', 'transport', 100],
      ['ro', 'livrare', 90],
      ['ro', 'logistică', 80],
      ['ro', 'transport frigorific', 60],
    ],
    children: [
      {
        slug: 'refrigerated-transport',
        roSlug: 'transport-frigorific',
        ru: 'Рефрижераторные перевозки',
        ro: 'Transport frigorific',
        defaultUnit: 'SET',
        syn: [
          ['ru', 'рефрижераторные перевозки', 100],
          ['ru', 'рефрижератор', 90],
          ['ru', 'перевозка охлаждённых грузов', 60],
          ['ro', 'transport frigorific', 100],
          ['ro', 'transport refrigerat', 80],
        ],
      },
      {
        slug: 'courier-delivery',
        roSlug: 'livrare-cu-curier',
        ru: 'Курьерская доставка',
        ro: 'Livrare cu curier',
        defaultUnit: 'SET',
        syn: [
          ['ru', 'курьерская доставка', 100],
          ['ru', 'курьер', 80],
          ['ru', 'доставка по городу', 60],
          ['ro', 'livrare cu curier', 100],
          ['ro', 'curier', 80],
          ['ro', 'livrare in oras', 60],
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Flattening
// ---------------------------------------------------------------------------

export interface FlatCategory {
  id: string
  parentId: string | null
  slug: string
  roSlug: string
  ru: string
  ro: string
  path: string
  level: number
  sortOrder: number
  isPopular: boolean
  icon: string | null
  defaultUnit: string
  syn: readonly SynonymSpec[]
  attrs: readonly AttributeSpec[]
  /** slugs of this node and every ancestor, nearest first */
  ancestry: string[]
}

/** Ids are the slug itself: unique, readable in the database, stable across reseeds. */
export const FLAT_CATEGORIES: FlatCategory[] = (() => {
  const out: FlatCategory[] = []

  const walk = (
    nodes: readonly CategorySpec[],
    parent: FlatCategory | null,
    level: number,
  ): void => {
    nodes.forEach((node, index) => {
      const flat: FlatCategory = {
        id: node.slug,
        parentId: parent?.id ?? null,
        slug: node.slug,
        roSlug: node.roSlug,
        ru: node.ru,
        ro: node.ro,
        path: parent ? `${parent.path}/${node.slug}` : node.slug,
        level,
        sortOrder: index,
        isPopular: node.isPopular ?? false,
        icon: node.icon ?? null,
        defaultUnit: node.defaultUnit,
        syn: node.syn ?? [],
        attrs: node.attrs ?? [],
        ancestry: parent ? [node.slug, ...parent.ancestry] : [node.slug],
      }
      out.push(flat)
      if (node.children) walk(node.children, flat, level + 1)
    })
  }

  walk(CATEGORY_TREE, null, 0)
  return out
})()

export const CATEGORY_BY_SLUG = new Map(FLAT_CATEGORIES.map((category) => [category.slug, category]))

/** `CategoryTranslation` is unique on [locale, slug] — fail loudly rather than at insert. */
function assertSlugsUnique(): void {
  for (const locale of ['ru', 'ro'] as const) {
    const seen = new Map<string, string>()
    for (const category of FLAT_CATEGORIES) {
      const slug = locale === 'ru' ? category.slug : category.roSlug
      const previous = seen.get(slug)
      if (previous) {
        throw new Error(
          `categories: duplicate ${locale} slug "${slug}" on "${category.slug}" and "${previous}"`,
        )
      }
      seen.set(slug, category.slug)
    }
  }
}

export const attributeId = (categorySlug: string, key: string): string => `${categorySlug}__${key}`
export const optionId = (attrId: string, value: string): string => `${attrId}__${value}`

/**
 * Resolves an attribute the way the app does: own definition first, then the nearest
 * ancestor that declares the key with `inherited`.
 */
export function resolveAttribute(
  categorySlug: string,
  key: string,
): { attributeId: string; spec: AttributeSpec } | null {
  const category = CATEGORY_BY_SLUG.get(categorySlug)
  if (!category) return null

  for (const ancestorSlug of category.ancestry) {
    const ancestor = CATEGORY_BY_SLUG.get(ancestorSlug)
    const spec = ancestor?.attrs.find((attribute) => attribute.key === key)
    if (spec && (ancestorSlug === categorySlug || (spec.inherited ?? true))) {
      return { attributeId: attributeId(ancestorSlug, key), spec }
    }
  }
  return null
}

/**
 * The text a product in this category is indexed under: both names plus every synonym
 * term. Mirrors `buildProductSearchText` in src/server/services/search.ts.
 */
export function categorySearchParts(categorySlug: string): string[] {
  const category = CATEGORY_BY_SLUG.get(categorySlug)
  if (!category) return []
  return [category.ru, category.ro, ...category.syn.map(([, term]) => term)]
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

export interface CategorySeedCounts {
  categories: number
  translations: number
  synonyms: number
  attributes: number
  attributeTranslations: number
  options: number
  optionTranslations: number
}

export async function seedCategories(db: PrismaClient): Promise<CategorySeedCounts> {
  assertSlugsUnique()

  // Parents must exist before children: FLAT_CATEGORIES is already in tree order, but
  // insert level by level so the self-relation is always satisfiable.
  const maxLevel = Math.max(...FLAT_CATEGORIES.map((category) => category.level))
  for (let level = 0; level <= maxLevel; level += 1) {
    const rows = FLAT_CATEGORIES.filter((category) => category.level === level).map((category) => ({
      id: category.id,
      parentId: category.parentId,
      slug: category.slug,
      path: category.path,
      level: category.level,
      sortOrder: category.sortOrder,
      isActive: true,
      isPopular: category.isPopular,
      icon: category.icon,
      defaultUnit: category.defaultUnit,
    }))
    await db.category.createMany({ data: rows })
  }

  const translations = FLAT_CATEGORIES.flatMap((category) => [
    { id: `${category.id}__ru`, categoryId: category.id, locale: 'ru', name: category.ru, slug: category.slug },
    { id: `${category.id}__ro`, categoryId: category.id, locale: 'ro', name: category.ro, slug: category.roSlug },
  ])
  await db.categoryTranslation.createMany({ data: translations })

  // Canonical names are weight-100 synonyms in their own right; hand-written terms are
  // merged on top and deduped on (category, locale, normalized).
  const synonymRows: {
    id: string
    categoryId: string
    locale: string
    term: string
    normalized: string
    weight: number
    isMisspelling: boolean
  }[] = []
  const seenSynonyms = new Set<string>()

  const pushSynonym = (
    categoryId: string,
    locale: Locale,
    term: string,
    weight: number,
    isMisspelling: boolean,
  ): void => {
    const normalized = normalize(term)
    if (!normalized) return
    const dedupeKey = `${categoryId}|${locale}|${normalized}`
    if (seenSynonyms.has(dedupeKey)) return
    seenSynonyms.add(dedupeKey)
    synonymRows.push({
      id: `syn_${synonymRows.length}`,
      categoryId,
      locale,
      term,
      normalized,
      weight,
      isMisspelling,
    })
  }

  for (const category of FLAT_CATEGORIES) {
    pushSynonym(category.id, 'ru', category.ru, 100, false)
    pushSynonym(category.id, 'ro', category.ro, 100, false)
    for (const [locale, term, weight = 80, isMisspelling = false] of category.syn) {
      pushSynonym(category.id, locale, term, weight, isMisspelling)
    }
  }
  await db.categorySynonym.createMany({ data: synonymRows })

  const attributeRows: {
    id: string
    categoryId: string
    key: string
    type: string
    unit: string | null
    isRequired: boolean
    isFilterable: boolean
    appliesTo: string
    sortOrder: number
    inherited: boolean
  }[] = []
  const attributeTranslationRows: {
    id: string
    attributeId: string
    locale: string
    label: string
    hint: string | null
  }[] = []
  const optionRows: { id: string; attributeId: string; value: string; sortOrder: number }[] = []
  const optionTranslationRows: { id: string; optionId: string; locale: string; label: string }[] = []

  for (const category of FLAT_CATEGORIES) {
    category.attrs.forEach((spec, index) => {
      const attrId = attributeId(category.slug, spec.key)
      attributeRows.push({
        id: attrId,
        categoryId: category.id,
        key: spec.key,
        type: spec.type,
        unit: spec.unit ?? null,
        isRequired: spec.isRequired ?? false,
        // SELECT and BOOL make good facets; free text and numbers do not.
        isFilterable:
          spec.isFilterable ?? (spec.type === 'SELECT' || spec.type === 'BOOL'),
        appliesTo: spec.appliesTo ?? 'BOTH',
        sortOrder: index,
        inherited: spec.inherited ?? true,
      })

      attributeTranslationRows.push(
        { id: `${attrId}__ru`, attributeId: attrId, locale: 'ru', label: spec.ru.label, hint: spec.ru.hint ?? null },
        { id: `${attrId}__ro`, attributeId: attrId, locale: 'ro', label: spec.ro.label, hint: spec.ro.hint ?? null },
      )

      spec.options?.forEach((option, optionIndex) => {
        const optId = optionId(attrId, option.value)
        optionRows.push({ id: optId, attributeId: attrId, value: option.value, sortOrder: optionIndex })
        optionTranslationRows.push(
          { id: `${optId}__ru`, optionId: optId, locale: 'ru', label: option.ru },
          { id: `${optId}__ro`, optionId: optId, locale: 'ro', label: option.ro },
        )
      })
    })
  }

  await db.categoryAttribute.createMany({ data: attributeRows })
  await db.categoryAttributeTranslation.createMany({ data: attributeTranslationRows })
  await db.categoryAttributeOption.createMany({ data: optionRows })
  await db.categoryAttributeOptionTranslation.createMany({ data: optionTranslationRows })

  return {
    categories: FLAT_CATEGORIES.length,
    translations: translations.length,
    synonyms: synonymRows.length,
    attributes: attributeRows.length,
    attributeTranslations: attributeTranslationRows.length,
    options: optionRows.length,
    optionTranslations: optionTranslationRows.length,
  }
}
