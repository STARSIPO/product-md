/**
 * Administrative divisions of the Republic of Moldova.
 *
 * 32 raions + 5 municipalities (Chișinău, Bălți, Bender, Comrat, Ceadîr-Lunga) +
 * UTA Găgăuzia. Ids are stable latin kebab-case slugs so they can appear in URLs
 * and inside JSON columns (Company.deliveryZones) without a lookup.
 *
 * Locality ids are namespaced by district (`${districtId}-${slug}`) because names
 * repeat across the country — Rîșcani is both a Chișinău sector and a northern raion
 * centre.
 *
 * Coordinates: districts carry real approximate centres. A locality flagged `isMajor`
 * is the administrative centre and inherits that exact point; the remaining villages
 * get a small deterministic offset around it, which is accurate enough for a map
 * pin and a distance filter in demo data.
 */

export type DistrictKind = 'MUNICIPIU' | 'RAION' | 'UTA'
export type LocalityKind = 'MUNICIPIU' | 'ORAS' | 'SAT' | 'COMUNA'

export interface DistrictSeed {
  id: string
  nameRu: string
  nameRo: string
  kind: DistrictKind
  latitude: number
  longitude: number
}

export interface LocalitySeed {
  id: string
  districtId: string
  nameRu: string
  nameRo: string
  kind: LocalityKind
  latitude: number
  longitude: number
  isMajor: boolean
}

export const DISTRICTS: DistrictSeed[] = [
  // --- municipalities ---------------------------------------------------------
  { id: 'chisinau', nameRu: 'Кишинёв', nameRo: 'Chișinău', kind: 'MUNICIPIU', latitude: 47.0105, longitude: 28.8638 },
  { id: 'balti', nameRu: 'Бельцы', nameRo: 'Bălți', kind: 'MUNICIPIU', latitude: 47.7615, longitude: 27.9294 },
  { id: 'bender', nameRu: 'Бендеры', nameRo: 'Bender', kind: 'MUNICIPIU', latitude: 46.8228, longitude: 29.4614 },
  { id: 'comrat', nameRu: 'Комрат', nameRo: 'Comrat', kind: 'MUNICIPIU', latitude: 46.2966, longitude: 28.6580 },
  { id: 'ceadir-lunga', nameRu: 'Чадыр-Лунга', nameRo: 'Ceadîr-Lunga', kind: 'MUNICIPIU', latitude: 46.0553, longitude: 28.8317 },

  // --- autonomous territorial unit --------------------------------------------
  { id: 'gagauzia', nameRu: 'Гагаузия', nameRo: 'UTA Găgăuzia', kind: 'UTA', latitude: 46.2000, longitude: 28.6600 },

  // --- raions -----------------------------------------------------------------
  { id: 'anenii-noi', nameRu: 'Анений Ной', nameRo: 'Anenii Noi', kind: 'RAION', latitude: 46.8785, longitude: 29.2306 },
  { id: 'basarabeasca', nameRu: 'Бессарабка', nameRo: 'Basarabeasca', kind: 'RAION', latitude: 46.3306, longitude: 28.9636 },
  { id: 'briceni', nameRu: 'Бричаны', nameRo: 'Briceni', kind: 'RAION', latitude: 48.3628, longitude: 27.0783 },
  { id: 'cahul', nameRu: 'Кагул', nameRo: 'Cahul', kind: 'RAION', latitude: 45.9081, longitude: 28.1944 },
  { id: 'cantemir', nameRu: 'Кантемир', nameRo: 'Cantemir', kind: 'RAION', latitude: 46.2783, longitude: 28.2019 },
  { id: 'calarasi', nameRu: 'Калараш', nameRo: 'Călărași', kind: 'RAION', latitude: 47.2553, longitude: 28.3097 },
  { id: 'causeni', nameRu: 'Каушаны', nameRo: 'Căușeni', kind: 'RAION', latitude: 46.6408, longitude: 29.4097 },
  { id: 'cimislia', nameRu: 'Чимишлия', nameRo: 'Cimișlia', kind: 'RAION', latitude: 46.5231, longitude: 28.7758 },
  { id: 'criuleni', nameRu: 'Криуляны', nameRo: 'Criuleni', kind: 'RAION', latitude: 47.2131, longitude: 29.1569 },
  { id: 'donduseni', nameRu: 'Дондюшаны', nameRo: 'Dondușeni', kind: 'RAION', latitude: 48.2261, longitude: 27.6006 },
  { id: 'drochia', nameRu: 'Дрокия', nameRo: 'Drochia', kind: 'RAION', latitude: 48.0361, longitude: 27.8125 },
  { id: 'dubasari', nameRu: 'Дубоссары', nameRo: 'Dubăsari', kind: 'RAION', latitude: 47.2653, longitude: 29.1631 },
  { id: 'edinet', nameRu: 'Единцы', nameRo: 'Edineț', kind: 'RAION', latitude: 48.1681, longitude: 27.3053 },
  { id: 'falesti', nameRu: 'Фалешты', nameRo: 'Fălești', kind: 'RAION', latitude: 47.5714, longitude: 27.7092 },
  { id: 'floresti', nameRu: 'Флорешты', nameRo: 'Florești', kind: 'RAION', latitude: 47.8925, longitude: 28.3006 },
  { id: 'glodeni', nameRu: 'Глодяны', nameRo: 'Glodeni', kind: 'RAION', latitude: 47.7742, longitude: 27.5178 },
  { id: 'hincesti', nameRu: 'Хынчешты', nameRo: 'Hîncești', kind: 'RAION', latitude: 46.8281, longitude: 28.5883 },
  { id: 'ialoveni', nameRu: 'Яловены', nameRo: 'Ialoveni', kind: 'RAION', latitude: 46.9364, longitude: 28.7772 },
  { id: 'leova', nameRu: 'Леова', nameRo: 'Leova', kind: 'RAION', latitude: 46.4783, longitude: 28.2542 },
  { id: 'nisporeni', nameRu: 'Ниспорены', nameRo: 'Nisporeni', kind: 'RAION', latitude: 47.0806, longitude: 28.1758 },
  { id: 'ocnita', nameRu: 'Окница', nameRo: 'Ocnița', kind: 'RAION', latitude: 48.3853, longitude: 27.4544 },
  { id: 'orhei', nameRu: 'Оргеев', nameRo: 'Orhei', kind: 'RAION', latitude: 47.3831, longitude: 28.8231 },
  { id: 'rezina', nameRu: 'Резина', nameRo: 'Rezina', kind: 'RAION', latitude: 47.7458, longitude: 28.9636 },
  { id: 'riscani', nameRu: 'Рышканы', nameRo: 'Rîșcani', kind: 'RAION', latitude: 47.9494, longitude: 27.5556 },
  { id: 'singerei', nameRu: 'Сынджерей', nameRo: 'Sîngerei', kind: 'RAION', latitude: 47.6367, longitude: 28.1381 },
  { id: 'soroca', nameRu: 'Сорока', nameRo: 'Soroca', kind: 'RAION', latitude: 48.1553, longitude: 28.2867 },
  { id: 'straseni', nameRu: 'Страшены', nameRo: 'Strășeni', kind: 'RAION', latitude: 47.1442, longitude: 28.6119 },
  { id: 'soldanesti', nameRu: 'Шолданешты', nameRo: 'Șoldănești', kind: 'RAION', latitude: 47.8161, longitude: 28.7975 },
  { id: 'stefan-voda', nameRu: 'Штефан Водэ', nameRo: 'Ștefan Vodă', kind: 'RAION', latitude: 46.5147, longitude: 29.6614 },
  { id: 'taraclia', nameRu: 'Тараклия', nameRo: 'Taraclia', kind: 'RAION', latitude: 45.9003, longitude: 28.6667 },
  { id: 'telenesti', nameRu: 'Теленешты', nameRo: 'Telenești', kind: 'RAION', latitude: 47.5017, longitude: 28.3661 },
  { id: 'ungheni', nameRu: 'Унгены', nameRo: 'Ungheni', kind: 'RAION', latitude: 47.2089, longitude: 27.8006 },
]

export const DISTRICTS_BY_ID = new Map(DISTRICTS.map((district) => [district.id, district]))

/** [slug, nameRu, nameRo, kind, isCentre?] */
type LocalityRow = readonly [string, string, string, LocalityKind, boolean?]

const RAW_LOCALITIES: Record<string, readonly LocalityRow[]> = {
  chisinau: [
    ['centru', 'Центру', 'Centru', 'MUNICIPIU', true],
    ['botanica', 'Ботаника', 'Botanica', 'MUNICIPIU'],
    ['riscani', 'Рышкановка', 'Rîșcani', 'MUNICIPIU'],
    ['ciocana', 'Чеканы', 'Ciocana', 'MUNICIPIU'],
    ['buiucani', 'Буюканы', 'Buiucani', 'MUNICIPIU'],
    ['durlesti', 'Дурлешты', 'Durlești', 'ORAS'],
    ['codru', 'Кодру', 'Codru', 'ORAS'],
    ['stauceni', 'Стэучень', 'Stăuceni', 'COMUNA'],
  ],
  balti: [
    ['balti', 'Бельцы', 'Bălți', 'MUNICIPIU', true],
    ['elizaveta', 'Елизавета', 'Elizaveta', 'SAT'],
    ['sadovoe', 'Садовое', 'Sadovoe', 'SAT'],
  ],
  bender: [
    ['bender', 'Бендеры', 'Bender', 'MUNICIPIU', true],
    ['proteagailovca', 'Протягайловка', 'Proteagailovca', 'SAT'],
    ['gisca', 'Гыска', 'Gîsca', 'SAT'],
  ],
  comrat: [
    ['comrat', 'Комрат', 'Comrat', 'MUNICIPIU', true],
    ['ferapontievca', 'Ферапонтьевка', 'Ferapontievca', 'SAT'],
    ['dezghingea', 'Дезгинжа', 'Dezghingea', 'SAT'],
  ],
  'ceadir-lunga': [
    ['ceadir-lunga', 'Чадыр-Лунга', 'Ceadîr-Lunga', 'MUNICIPIU', true],
    ['besalma', 'Бешалма', 'Beșalma', 'SAT'],
    ['tomai', 'Томай', 'Tomai', 'SAT'],
  ],
  gagauzia: [
    ['vulcanesti', 'Вулканешты', 'Vulcănești', 'ORAS', true],
    ['congaz', 'Конгаз', 'Congaz', 'SAT'],
    ['copceac', 'Копчак', 'Copceac', 'SAT'],
    ['avdarma', 'Авдарма', 'Avdarma', 'SAT'],
    ['cazaclia', 'Казаклия', 'Cazaclia', 'SAT'],
  ],
  'anenii-noi': [
    ['anenii-noi', 'Анений Ной', 'Anenii Noi', 'ORAS', true],
    ['bulboaca', 'Булбоака', 'Bulboaca', 'SAT'],
    ['varnita', 'Варница', 'Varnița', 'COMUNA'],
    ['puhaceni', 'Пухачень', 'Puhăceni', 'SAT'],
    ['gura-bicului', 'Гура-Быкулуй', 'Gura Bîcului', 'SAT'],
  ],
  basarabeasca: [
    ['basarabeasca', 'Бессарабка', 'Basarabeasca', 'ORAS', true],
    ['abaclia', 'Абаклия', 'Abaclia', 'SAT'],
    ['iordanovca', 'Иордановка', 'Iordanovca', 'SAT'],
    ['sadaclia', 'Садаклия', 'Sadaclia', 'SAT'],
  ],
  briceni: [
    ['briceni', 'Бричаны', 'Briceni', 'ORAS', true],
    ['lipcani', 'Липканы', 'Lipcani', 'ORAS'],
    ['criva', 'Крива', 'Criva', 'SAT'],
    ['coteala', 'Котяла', 'Colicăuți', 'SAT'],
  ],
  cahul: [
    ['cahul', 'Кагул', 'Cahul', 'MUNICIPIU', true],
    ['giurgiulesti', 'Джюрджюлешты', 'Giurgiulești', 'SAT'],
    ['vadul-lui-isac', 'Вадул-луй-Исак', 'Vadul lui Isac', 'SAT'],
    ['slobozia-mare', 'Слобозия-Маре', 'Slobozia Mare', 'SAT'],
    ['moscovei', 'Московей', 'Moscovei', 'SAT'],
  ],
  cantemir: [
    ['cantemir', 'Кантемир', 'Cantemir', 'ORAS', true],
    ['baimaclia', 'Баймаклия', 'Baimaclia', 'SAT'],
    ['ciobalaccia', 'Чобалакчия', 'Ciobalaccia', 'SAT'],
    ['goteşti', 'Готешты', 'Gotești', 'SAT'],
  ],
  calarasi: [
    ['calarasi', 'Калараш', 'Călărași', 'ORAS', true],
    ['bravicea', 'Бравичя', 'Bravicea', 'SAT'],
    ['sipoteni', 'Сипотены', 'Sipoteni', 'SAT'],
    ['tuzara', 'Тузара', 'Tuzara', 'SAT'],
  ],
  causeni: [
    ['causeni', 'Каушаны', 'Căușeni', 'ORAS', true],
    ['chitcani', 'Кицканы', 'Chițcani', 'SAT'],
    ['zaim', 'Заим', 'Zaim', 'SAT'],
    ['copanca', 'Копанка', 'Copanca', 'SAT'],
  ],
  cimislia: [
    ['cimislia', 'Чимишлия', 'Cimișlia', 'ORAS', true],
    ['gura-galbenei', 'Гура-Галбеней', 'Gura Galbenei', 'SAT'],
    ['ecaterinovca', 'Екатериновка', 'Ecaterinovca', 'SAT'],
    ['satul-nou', 'Сатул-Ноу', 'Satul Nou', 'SAT'],
  ],
  criuleni: [
    ['criuleni', 'Криуляны', 'Criuleni', 'ORAS', true],
    ['dubasarii-vechi', 'Дубэсарий-Векь', 'Dubăsarii Vechi', 'SAT'],
    ['hrusova', 'Хрушова', 'Hrușova', 'SAT'],
    ['ohrincea', 'Охринча', 'Ohrincea', 'SAT'],
  ],
  donduseni: [
    ['donduseni', 'Дондюшаны', 'Dondușeni', 'ORAS', true],
    ['tirnova', 'Тырново', 'Tîrnova', 'SAT'],
    ['climauti', 'Климэуць', 'Climăuți', 'SAT'],
    ['baraboi', 'Барабой', 'Baraboi', 'SAT'],
  ],
  drochia: [
    ['drochia', 'Дрокия', 'Drochia', 'ORAS', true],
    ['chetrosu', 'Кетросу', 'Chetrosu', 'SAT'],
    ['sofia', 'София', 'Sofia', 'SAT'],
    ['pelinia', 'Пелиния', 'Pelinia', 'SAT'],
  ],
  dubasari: [
    ['cocieri', 'Кочиеры', 'Cocieri', 'SAT', true],
    ['molovata-noua', 'Моловата-Ноуэ', 'Molovata Nouă', 'SAT'],
    ['ustia', 'Устья', 'Ustia', 'SAT'],
    ['coșnița', 'Кошница', 'Coșnița', 'SAT'],
  ],
  edinet: [
    ['edinet', 'Единцы', 'Edineț', 'ORAS', true],
    ['cupcini', 'Купчинь', 'Cupcini', 'ORAS'],
    ['brinzeni', 'Брынзены', 'Brînzeni', 'SAT'],
    ['zabriceni', 'Забричаны', 'Zăbriceni', 'SAT'],
  ],
  falesti: [
    ['falesti', 'Фалешты', 'Fălești', 'ORAS', true],
    ['glinjeni', 'Глинжены', 'Glinjeni', 'SAT'],
    ['pirlita', 'Пырлица', 'Pîrlița', 'SAT'],
    ['risipeni', 'Рисипень', 'Risipeni', 'SAT'],
  ],
  floresti: [
    ['floresti', 'Флорешты', 'Florești', 'ORAS', true],
    ['ghindesti', 'Гиндешты', 'Ghindești', 'ORAS'],
    ['marculesti', 'Маркулешты', 'Mărculești', 'ORAS'],
    ['prodanesti', 'Проданешты', 'Prodănești', 'SAT'],
  ],
  glodeni: [
    ['glodeni', 'Глодяны', 'Glodeni', 'ORAS', true],
    ['balatina', 'Балатина', 'Balatina', 'SAT'],
    ['cuhnesti', 'Кухнешты', 'Cuhnești', 'SAT'],
    ['limbenii-noi', 'Лимбений-Ной', 'Limbenii Noi', 'SAT'],
  ],
  hincesti: [
    ['hincesti', 'Хынчешты', 'Hîncești', 'ORAS', true],
    ['lapusna', 'Лапушна', 'Lăpușna', 'SAT'],
    ['sarata-galbena', 'Сэрата-Галбенэ', 'Sărata-Galbenă', 'SAT'],
    ['bujor', 'Бужор', 'Bujor', 'SAT'],
  ],
  ialoveni: [
    ['ialoveni', 'Яловены', 'Ialoveni', 'ORAS', true],
    ['costesti', 'Костешты', 'Costești', 'SAT'],
    ['bardar', 'Бардар', 'Bardar', 'SAT'],
    ['puhoi', 'Пухой', 'Puhoi', 'SAT'],
    ['ruseștii-noi', 'Русештий-Ной', 'Ruseștii Noi', 'SAT'],
  ],
  leova: [
    ['leova', 'Леова', 'Leova', 'ORAS', true],
    ['iargara', 'Яргара', 'Iargara', 'ORAS'],
    ['filipeni', 'Филипень', 'Filipeni', 'SAT'],
    ['tomai-leova', 'Томай', 'Tomai', 'SAT'],
  ],
  nisporeni: [
    ['nisporeni', 'Ниспорены', 'Nisporeni', 'ORAS', true],
    ['varzaresti', 'Варзарешты', 'Vărzărești', 'SAT'],
    ['bolțun', 'Болцун', 'Bolțun', 'SAT'],
    ['ciorești', 'Чорешты', 'Ciorești', 'SAT'],
  ],
  ocnita: [
    ['ocnita', 'Окница', 'Ocnița', 'ORAS', true],
    ['otaci', 'Атаки', 'Otaci', 'ORAS'],
    ['frunza', 'Фрунзэ', 'Frunză', 'SAT'],
    ['sauca', 'Шаука', 'Șauca', 'SAT'],
  ],
  orhei: [
    ['orhei', 'Оргеев', 'Orhei', 'MUNICIPIU', true],
    ['ivancea', 'Иванча', 'Ivancea', 'SAT'],
    ['peresecina', 'Пересечина', 'Peresecina', 'SAT'],
    ['bratuseni', 'Брэтушень', 'Brăviceni', 'SAT'],
    ['trebujeni', 'Требужены', 'Trebujeni', 'SAT'],
  ],
  rezina: [
    ['rezina', 'Резина', 'Rezina', 'ORAS', true],
    ['saharna', 'Сахарна', 'Saharna', 'SAT'],
    ['ignatei', 'Игнэцей', 'Ignăței', 'SAT'],
    ['solonceni', 'Солончены', 'Solonceni', 'SAT'],
  ],
  riscani: [
    ['riscani', 'Рышканы', 'Rîșcani', 'ORAS', true],
    ['costesti-riscani', 'Костешты', 'Costești', 'SAT'],
    ['nihoreni', 'Нихорень', 'Nihoreni', 'SAT'],
    ['zaicani', 'Зэйкань', 'Zăicani', 'SAT'],
  ],
  singerei: [
    ['singerei', 'Сынджерей', 'Sîngerei', 'ORAS', true],
    ['biruinta', 'Бируинца', 'Biruința', 'ORAS'],
    ['copaceni', 'Копэчень', 'Copăceni', 'SAT'],
    ['prepelita', 'Препелица', 'Prepelița', 'SAT'],
  ],
  soroca: [
    ['soroca', 'Сорока', 'Soroca', 'MUNICIPIU', true],
    ['vasilcau', 'Васильков', 'Vasilcău', 'SAT'],
    ['cosauti', 'Косэуць', 'Cosăuți', 'SAT'],
    ['rublenita', 'Рубленица', 'Rublenița', 'SAT'],
  ],
  straseni: [
    ['straseni', 'Страшены', 'Strășeni', 'ORAS', true],
    ['bucovat', 'Буковэц', 'Bucovăț', 'SAT'],
    ['micleuseni', 'Миклеушень', 'Micleușeni', 'SAT'],
    ['romanesti', 'Романешты', 'Romănești', 'SAT'],
  ],
  soldanesti: [
    ['soldanesti', 'Шолданешты', 'Șoldănești', 'ORAS', true],
    ['cotiujenii-mari', 'Котюжений-Марь', 'Cotiujenii Mari', 'SAT'],
    ['oliscani', 'Олишкань', 'Olișcani', 'SAT'],
    ['sipca', 'Шипка', 'Șipca', 'SAT'],
  ],
  'stefan-voda': [
    ['stefan-voda', 'Штефан Водэ', 'Ștefan Vodă', 'ORAS', true],
    ['purcari', 'Пуркары', 'Purcari', 'SAT'],
    ['olanesti', 'Оланешты', 'Olănești', 'SAT'],
    ['talmaza', 'Талмаза', 'Talmaza', 'SAT'],
  ],
  taraclia: [
    ['taraclia', 'Тараклия', 'Taraclia', 'ORAS', true],
    ['tvardita', 'Твардица', 'Tvardița', 'ORAS'],
    ['cairaclia', 'Кайраклия', 'Cairaclia', 'SAT'],
    ['valea-perjei', 'Валя-Пержей', 'Valea Perjei', 'SAT'],
  ],
  telenesti: [
    ['telenesti', 'Теленешты', 'Telenești', 'ORAS', true],
    ['ciulucani', 'Чулукань', 'Ciulucani', 'SAT'],
    ['leuseni-telenesti', 'Леушень', 'Leușeni', 'SAT'],
    ['negureni', 'Негурень', 'Negureni', 'SAT'],
  ],
  ungheni: [
    ['ungheni', 'Унгены', 'Ungheni', 'MUNICIPIU', true],
    ['corneşti', 'Корнешты', 'Cornești', 'ORAS'],
    ['petresti', 'Петрешты', 'Petrești', 'SAT'],
    ['sculeni', 'Скулень', 'Sculeni', 'SAT'],
    ['zagarancea', 'Загаранча', 'Zagarancea', 'SAT'],
  ],
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

export const LOCALITIES: LocalitySeed[] = Object.entries(RAW_LOCALITIES).flatMap(
  ([districtId, rows]) => {
    const district = DISTRICTS_BY_ID.get(districtId)
    if (!district) throw new Error(`geo: unknown district "${districtId}"`)

    return rows.map((row, index) => {
      const [slug, nameRu, nameRo, kind, isCentre = false] = row
      // Centres sit on the district point; the rest fan out on a small fixed grid.
      const latOffset = isCentre ? 0 : ((index % 3) - 1) * 0.075 + 0.02
      const lngOffset = isCentre ? 0 : (Math.floor(index / 3) - 1) * 0.11 + 0.03

      return {
        id: `${districtId}-${slug}`,
        districtId,
        nameRu,
        nameRo,
        kind,
        latitude: round4(district.latitude + latOffset),
        longitude: round4(district.longitude + lngOffset),
        isMajor: isCentre,
      }
    })
  },
)

export const LOCALITIES_BY_ID = new Map(LOCALITIES.map((locality) => [locality.id, locality]))

/** Convenience for the demo seed: the administrative centre of a district. */
export function centreOf(districtId: string): LocalitySeed {
  const centre = LOCALITIES.find((locality) => locality.districtId === districtId && locality.isMajor)
  if (!centre) throw new Error(`geo: district "${districtId}" has no centre`)
  return centre
}
