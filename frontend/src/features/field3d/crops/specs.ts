/**
 * Visual specs for every plannable non-paddy crop in the catalogue
 * (backend/app/seed/crops.py). Spacing follows the Tamil Nadu Crop Production
 * Guides (TNAU, Agriculture & Horticulture) for the common irrigated practice;
 * heights and spreads are typical mature values. They drive an illustration of the
 * crop model — not a measurement of the farmer's field.
 *
 * | slug           | model            | row × plant (cm) | height (m) | ground  |
 * |----------------|------------------|------------------|------------|---------|
 * | maize          | maize            | 60 × 25          | 2.2        | ridges  |
 * | sorghum        | sorghum          | 45 × 15          | 1.9        | ridges  |
 * | pearl-millet   | pearl_millet     | 45 × 15          | 1.9        | ridges  |
 * | sugarcane      | sugarcane        | 150 × 30         | 3.0        | ridges  |
 * | finger-millet  | finger_millet    | 22.5 × 10        | 0.9        | flat    |
 * | foxtail-millet | foxtail_millet   | 22.5 × 10        | 1.0        | flat    |
 * | little-millet  | little_millet    | 22.5 × 10        | 0.9        | flat    |
 * | kodo-millet    | kodo_millet      | 22.5 × 10        | 0.8        | flat    |
 * | groundnut      | groundnut        | 30 × 10          | 0.35       | flat    |
 * | black-gram     | trifoliate_pulse | 30 × 10          | 0.4        | flat    |
 * | green-gram     | trifoliate_pulse | 30 × 10          | 0.5        | flat    |
 * | cowpea         | trifoliate_pulse | 45 × 15          | 0.6        | flat    |
 * | red-gram       | red_gram         | 90 × 30          | 1.8        | ridges  |
 * | bengal-gram    | bengal_gram      | 30 × 10          | 0.45       | flat    |
 * | sesame         | sesame           | 30 × 30          | 1.2        | flat    |
 * | sunflower      | sunflower        | 60 × 30          | 1.8        | ridges  |
 * | castor         | castor           | 90 × 60          | 2.0        | ridges  |
 * | cotton         | cotton           | 90 × 60          | 1.3        | ridges  |
 * | tomato         | tomato           | 60 × 45          | 0.9        | beds    |
 * | brinjal        | brinjal          | 60 × 60          | 0.9        | beds    |
 * | chilli         | chilli           | 60 × 45          | 0.8        | beds    |
 * | bhendi         | bhendi           | 45 × 30          | 1.5        | ridges  |
 * | small-onion    | onion            | 22.5 × 10        | 0.4        | ridges  |
 * | turmeric       | turmeric         | 45 × 15          | 0.9        | ridges  |
 * | tapioca        | tapioca          | 90 × 90          | 2.2        | ridges  |
 * | banana         | banana           | 180 × 180        | 3.0        | flat    |
 */

export type RGB = readonly [number, number, number];

export type Archetype = 'tall_grass' | 'tuft_grass' | 'bush_legume' | 'oilseed' | 'vegetable' | 'broadleaf_tall';

export type PlantModel =
  | 'maize' | 'sorghum' | 'pearl_millet' | 'sugarcane'
  | 'finger_millet' | 'foxtail_millet' | 'little_millet' | 'kodo_millet'
  | 'groundnut' | 'trifoliate_pulse' | 'red_gram' | 'bengal_gram'
  | 'sesame' | 'sunflower' | 'castor' | 'cotton'
  | 'tomato' | 'brinjal' | 'chilli' | 'bhendi' | 'onion'
  | 'banana' | 'turmeric' | 'tapioca';

/** Shape of the stage → appearance curve (see cropGrowth.ts). */
export type GrowthProfile = 'cereal' | 'cane' | 'dicot' | 'vegetable' | 'onion' | 'banana' | 'rhizome' | 'tuber';

export type GroundSpec =
  | { kind: 'flat' }
  | { kind: 'ridges'; heightM: number }
  /** Raised beds carrying two plant rows, with a narrow furrow between beds. */
  | { kind: 'beds'; heightM: number };

export interface CropColors {
  leafYoung: RGB;
  leaf: RGB;
  /** Leaves as the crop ripens (before they die). */
  leafRipe: RGB;
  leafDead: RGB;
  stem: RGB;
  /** Stem colour at maturity (e.g. cane turning purple-yellow, dry stalks). */
  stemRipe: RGB;
  flower: RGB;
  fruit: RGB;
  fruitRipe: RGB;
  head: RGB;
  headRipe: RGB;
}

export interface CropSpec {
  slug: string;
  archetype: Archetype;
  model: PlantModel;
  profile: GrowthProfile;
  /** Spacing between rows and between plants within a row (metres). */
  rowM: number;
  plantM: number;
  /** Mature height and canopy radius of one plant (metres). */
  heightM: number;
  spreadM: number;
  ground: GroundSpec;
  soil: 'red' | 'black' | 'brown';
  /** Black plastic mulch on the beds when the farmer irrigates by drip (TN vegetable practice). */
  mulchWithDrip?: boolean;
  colors: CropColors;
  /** 0 = sways freely, 1 = rigid. */
  stiffness: number;
  /** All plants face one way (sunflower heads face east). */
  facing?: 'east';
  /** What dominates the view from above once it appears, for the far canopy. */
  topBloom: 'flower' | 'fruit' | 'head' | null;
  /** How much of the canopy the top bloom covers seen from afar (small groundnut flowers vs sunflower heads). */
  bloomStrength?: number;
  /** Birds attracted at maturity: parakeets to grain heads, mynas elsewhere. */
  birds: 'parakeet' | 'myna';
  /** Model-specific knobs (pod colour variant, leaflet count, etc.). */
  variant?: 'black_gram' | 'green_gram' | 'cowpea';
}

const c = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const DEAD = c('#b49464');
const GRASS_COLORS = {
  leafYoung: c('#8cc04e'), leaf: c('#4f8a2c'), leafRipe: c('#9a9a45'), leafDead: DEAD,
  stem: c('#6f9a3a'), stemRipe: c('#c9b07a'),
};
const BROAD_COLORS = {
  leafYoung: c('#86bf4a'), leaf: c('#3f7f2a'), leafRipe: c('#8c9a40'), leafDead: c('#8a6e45'),
  stem: c('#5f8a34'), stemRipe: c('#8a7048'),
};

export const CROP_SPECS: Record<string, CropSpec> = {
  maize: {
    slug: 'maize', archetype: 'tall_grass', model: 'maize', profile: 'cereal',
    rowM: 0.6, plantM: 0.25, heightM: 2.2, spreadM: 0.5, ground: { kind: 'ridges', heightM: 0.18 }, soil: 'red',
    colors: { ...GRASS_COLORS, leaf: c('#3f7d2a'), flower: c('#e6cf8a'), fruit: c('#7fa650'), fruitRipe: c('#b89c68'), head: c('#c2b061'), headRipe: c('#a88a52') },
    stiffness: 0.35, topBloom: 'head', birds: 'parakeet',
  },
  sorghum: {
    slug: 'sorghum', archetype: 'tall_grass', model: 'sorghum', profile: 'cereal',
    rowM: 0.45, plantM: 0.15, heightM: 1.9, spreadM: 0.35, ground: { kind: 'ridges', heightM: 0.15 }, soil: 'black',
    colors: { ...GRASS_COLORS, flower: c('#efe3a8'), fruit: c('#9fb560'), fruitRipe: c('#a4502e'), head: c('#a8b866'), headRipe: c('#a4502e') },
    stiffness: 0.4, topBloom: 'head', birds: 'parakeet',
  },
  'pearl-millet': {
    slug: 'pearl-millet', archetype: 'tall_grass', model: 'pearl_millet', profile: 'cereal',
    rowM: 0.45, plantM: 0.15, heightM: 1.9, spreadM: 0.35, ground: { kind: 'ridges', heightM: 0.15 }, soil: 'red',
    colors: { ...GRASS_COLORS, flower: c('#e9dc9a'), fruit: c('#9db063'), fruitRipe: c('#b8a46a'), head: c('#9fb266'), headRipe: c('#a89567') },
    stiffness: 0.4, topBloom: 'head', birds: 'parakeet',
  },
  sugarcane: {
    slug: 'sugarcane', archetype: 'tall_grass', model: 'sugarcane', profile: 'cane',
    rowM: 1.5, plantM: 0.3, heightM: 3.0, spreadM: 0.8, ground: { kind: 'ridges', heightM: 0.25 }, soil: 'brown',
    colors: { ...GRASS_COLORS, leaf: c('#4e8a30'), stem: c('#8fa84c'), stemRipe: c('#8a5a6a'), flower: c('#ddd6c4'), fruit: c('#8fa84c'), fruitRipe: c('#8a5a6a'), head: c('#ddd6c4'), headRipe: c('#ddd6c4') },
    stiffness: 0.3, topBloom: null, birds: 'myna',
  },
  'finger-millet': {
    slug: 'finger-millet', archetype: 'tuft_grass', model: 'finger_millet', profile: 'cereal',
    rowM: 0.225, plantM: 0.1, heightM: 0.9, spreadM: 0.16, ground: { kind: 'flat' }, soil: 'red',
    colors: { ...GRASS_COLORS, flower: c('#e3dca8'), fruit: c('#7d9a45'), fruitRipe: c('#8a5a3a'), head: c('#7d9a45'), headRipe: c('#8a5a3a') },
    stiffness: 0.15, topBloom: 'head', birds: 'parakeet',
  },
  'foxtail-millet': {
    slug: 'foxtail-millet', archetype: 'tuft_grass', model: 'foxtail_millet', profile: 'cereal',
    rowM: 0.225, plantM: 0.1, heightM: 1.0, spreadM: 0.15, ground: { kind: 'flat' }, soil: 'red',
    colors: { ...GRASS_COLORS, flower: c('#e6dca0'), fruit: c('#9ab35a'), fruitRipe: c('#d1b46a'), head: c('#9ab35a'), headRipe: c('#d1b46a') },
    stiffness: 0.12, topBloom: 'head', birds: 'parakeet',
  },
  'little-millet': {
    slug: 'little-millet', archetype: 'tuft_grass', model: 'little_millet', profile: 'cereal',
    rowM: 0.225, plantM: 0.1, heightM: 0.9, spreadM: 0.14, ground: { kind: 'flat' }, soil: 'red',
    colors: { ...GRASS_COLORS, flower: c('#e6dca0'), fruit: c('#a3b562'), fruitRipe: c('#c9b07a'), head: c('#a3b562'), headRipe: c('#c9a96a') },
    stiffness: 0.12, topBloom: 'head', birds: 'parakeet',
  },
  'kodo-millet': {
    slug: 'kodo-millet', archetype: 'tuft_grass', model: 'kodo_millet', profile: 'cereal',
    rowM: 0.225, plantM: 0.1, heightM: 0.8, spreadM: 0.14, ground: { kind: 'flat' }, soil: 'brown',
    colors: { ...GRASS_COLORS, flower: c('#ded6a0'), fruit: c('#95ad5a'), fruitRipe: c('#8a6a3e'), head: c('#95ad5a'), headRipe: c('#8a6a3e') },
    stiffness: 0.15, topBloom: 'head', birds: 'parakeet',
  },
  groundnut: {
    slug: 'groundnut', archetype: 'bush_legume', model: 'groundnut', profile: 'dicot',
    rowM: 0.3, plantM: 0.1, heightM: 0.35, spreadM: 0.17, ground: { kind: 'flat' }, soil: 'red',
    colors: { ...BROAD_COLORS, leaf: c('#3f8030'), flower: c('#f4c21c'), fruit: c('#c9b07a'), fruitRipe: c('#a88a5a'), head: c('#f4c21c'), headRipe: c('#f4c21c') },
    stiffness: 0.5, topBloom: 'flower', bloomStrength: 0.18, birds: 'myna',
  },
  'black-gram': {
    slug: 'black-gram', archetype: 'bush_legume', model: 'trifoliate_pulse', profile: 'dicot', variant: 'black_gram',
    rowM: 0.3, plantM: 0.1, heightM: 0.4, spreadM: 0.18, ground: { kind: 'flat' }, soil: 'black',
    colors: { ...BROAD_COLORS, leaf: c('#3d7a2c'), flower: c('#e8d64a'), fruit: c('#5e7a3a'), fruitRipe: c('#2a2622'), head: c('#e8d64a'), headRipe: c('#e8d64a') },
    stiffness: 0.5, topBloom: null, birds: 'myna',
  },
  'green-gram': {
    slug: 'green-gram', archetype: 'bush_legume', model: 'trifoliate_pulse', profile: 'dicot', variant: 'green_gram',
    rowM: 0.3, plantM: 0.1, heightM: 0.5, spreadM: 0.18, ground: { kind: 'flat' }, soil: 'red',
    colors: { ...BROAD_COLORS, leaf: c('#468a30'), flower: c('#e8d23a'), fruit: c('#6b8c3c'), fruitRipe: c('#3a3428'), head: c('#e8d23a'), headRipe: c('#e8d23a') },
    stiffness: 0.5, topBloom: null, birds: 'myna',
  },
  cowpea: {
    slug: 'cowpea', archetype: 'bush_legume', model: 'trifoliate_pulse', profile: 'dicot', variant: 'cowpea',
    rowM: 0.45, plantM: 0.15, heightM: 0.6, spreadM: 0.26, ground: { kind: 'flat' }, soil: 'red',
    colors: { ...BROAD_COLORS, leaf: c('#3f8a34'), flower: c('#d9b8e8'), fruit: c('#7a9a44'), fruitRipe: c('#b49a6a'), head: c('#d9b8e8'), headRipe: c('#d9b8e8') },
    stiffness: 0.45, topBloom: null, birds: 'myna',
  },
  'red-gram': {
    slug: 'red-gram', archetype: 'bush_legume', model: 'red_gram', profile: 'dicot',
    rowM: 0.9, plantM: 0.3, heightM: 1.8, spreadM: 0.45, ground: { kind: 'ridges', heightM: 0.15 }, soil: 'red',
    colors: { ...BROAD_COLORS, leaf: c('#4d7f3a'), stem: c('#6a7a3e'), stemRipe: c('#7a6545'), flower: c('#f0b02a'), fruit: c('#6f8a3c'), fruitRipe: c('#6a4a35'), head: c('#d25a2a'), headRipe: c('#d25a2a') },
    stiffness: 0.55, topBloom: 'flower', birds: 'myna',
  },
  'bengal-gram': {
    slug: 'bengal-gram', archetype: 'bush_legume', model: 'bengal_gram', profile: 'dicot',
    rowM: 0.3, plantM: 0.1, heightM: 0.45, spreadM: 0.17, ground: { kind: 'flat' }, soil: 'black',
    colors: { ...BROAD_COLORS, leaf: c('#5a8a48'), flower: c('#d898c8'), fruit: c('#7a9a50'), fruitRipe: c('#b8a072'), head: c('#d898c8'), headRipe: c('#d898c8') },
    stiffness: 0.5, topBloom: null, birds: 'myna',
  },
  sesame: {
    slug: 'sesame', archetype: 'oilseed', model: 'sesame', profile: 'dicot',
    rowM: 0.3, plantM: 0.3, heightM: 1.2, spreadM: 0.22, ground: { kind: 'flat' }, soil: 'red',
    colors: { ...BROAD_COLORS, leaf: c('#4a8436'), flower: c('#f2dde8'), fruit: c('#6f9040'), fruitRipe: c('#9a7a4a'), head: c('#f2dde8'), headRipe: c('#f2dde8') },
    stiffness: 0.45, topBloom: 'flower', birds: 'myna',
  },
  sunflower: {
    slug: 'sunflower', archetype: 'oilseed', model: 'sunflower', profile: 'dicot',
    rowM: 0.6, plantM: 0.3, heightM: 1.8, spreadM: 0.35, ground: { kind: 'ridges', heightM: 0.15 }, soil: 'black',
    colors: { ...BROAD_COLORS, leaf: c('#47822e'), flower: c('#f5b80f'), fruit: c('#5a4630'), fruitRipe: c('#3e3226'), head: c('#3b2a14'), headRipe: c('#2a2016') },
    stiffness: 0.6, facing: 'east', topBloom: 'flower', bloomStrength: 1, birds: 'parakeet',
  },
  castor: {
    slug: 'castor', archetype: 'oilseed', model: 'castor', profile: 'dicot',
    rowM: 0.9, plantM: 0.6, heightM: 2.0, spreadM: 0.55, ground: { kind: 'ridges', heightM: 0.15 }, soil: 'red',
    colors: { ...BROAD_COLORS, leaf: c('#3f6f34'), stem: c('#8a4a4a'), stemRipe: c('#6a4a3a'), flower: c('#e8d080'), fruit: c('#b84a48'), fruitRipe: c('#7a5a3a'), head: c('#b84a48'), headRipe: c('#7a5a3a') },
    stiffness: 0.65, topBloom: 'fruit', birds: 'myna',
  },
  cotton: {
    slug: 'cotton', archetype: 'broadleaf_tall', model: 'cotton', profile: 'dicot',
    rowM: 0.9, plantM: 0.6, heightM: 1.3, spreadM: 0.45, ground: { kind: 'ridges', heightM: 0.18 }, soil: 'black',
    colors: { ...BROAD_COLORS, leaf: c('#3e7a32'), leafRipe: c('#8a5a3a'), stem: c('#6a5a3a'), stemRipe: c('#5a4532'), flower: c('#f3e6b0'), fruit: c('#5f8a3a'), fruitRipe: c('#f6f3ec'), head: c('#f3e6b0'), headRipe: c('#f3e6b0') },
    stiffness: 0.65, topBloom: 'fruit', bloomStrength: 0.85, birds: 'myna',
  },
  tomato: {
    slug: 'tomato', archetype: 'vegetable', model: 'tomato', profile: 'vegetable',
    rowM: 0.6, plantM: 0.45, heightM: 0.9, spreadM: 0.38, ground: { kind: 'beds', heightM: 0.15 }, soil: 'red', mulchWithDrip: true,
    colors: { ...BROAD_COLORS, leaf: c('#3f7a30'), flower: c('#f2d22a'), fruit: c('#5e8a32'), fruitRipe: c('#c0261a'), head: c('#f2d22a'), headRipe: c('#f2d22a') },
    stiffness: 0.55, topBloom: 'fruit', birds: 'myna',
  },
  brinjal: {
    slug: 'brinjal', archetype: 'vegetable', model: 'brinjal', profile: 'vegetable',
    rowM: 0.6, plantM: 0.6, heightM: 0.9, spreadM: 0.42, ground: { kind: 'beds', heightM: 0.15 }, soil: 'red', mulchWithDrip: true,
    colors: { ...BROAD_COLORS, leaf: c('#4b7a3e'), stem: c('#5a4a5a'), flower: c('#a77ad0'), fruit: c('#5a2a5e'), fruitRipe: c('#3c1a44'), head: c('#a77ad0'), headRipe: c('#a77ad0') },
    stiffness: 0.6, topBloom: null, birds: 'myna',
  },
  chilli: {
    slug: 'chilli', archetype: 'vegetable', model: 'chilli', profile: 'vegetable',
    rowM: 0.6, plantM: 0.45, heightM: 0.8, spreadM: 0.3, ground: { kind: 'beds', heightM: 0.15 }, soil: 'red', mulchWithDrip: true,
    colors: { ...BROAD_COLORS, leaf: c('#2f7028'), stemRipe: c('#4f7a2e'), flower: c('#f6f3e6'), fruit: c('#3f8a2a'), fruitRipe: c('#c8201a'), head: c('#f6f3e6'), headRipe: c('#f6f3e6') },
    stiffness: 0.55, topBloom: 'fruit', birds: 'myna',
  },
  bhendi: {
    slug: 'bhendi', archetype: 'vegetable', model: 'bhendi', profile: 'vegetable',
    rowM: 0.45, plantM: 0.3, heightM: 1.5, spreadM: 0.3, ground: { kind: 'ridges', heightM: 0.15 }, soil: 'red',
    colors: { ...BROAD_COLORS, leaf: c('#4a8436'), stem: c('#6a8a3e'), flower: c('#f3e27a'), fruit: c('#7aa440'), fruitRipe: c('#6a8a38'), head: c('#f3e27a'), headRipe: c('#f3e27a') },
    stiffness: 0.55, topBloom: 'flower', birds: 'myna',
  },
  'small-onion': {
    slug: 'small-onion', archetype: 'vegetable', model: 'onion', profile: 'onion',
    rowM: 0.225, plantM: 0.1, heightM: 0.4, spreadM: 0.09, ground: { kind: 'ridges', heightM: 0.12 }, soil: 'red',
    colors: { ...GRASS_COLORS, leafYoung: c('#7ab05a'), leaf: c('#4f8a52'), leafRipe: c('#a0a050'), leafDead: c('#c2a46e'), flower: c('#ece6d6'), fruit: c('#b05a5a'), fruitRipe: c('#a04650'), head: c('#ece6d6'), headRipe: c('#ece6d6') },
    stiffness: 0.25, topBloom: null, birds: 'myna',
  },
  turmeric: {
    slug: 'turmeric', archetype: 'broadleaf_tall', model: 'turmeric', profile: 'rhizome',
    rowM: 0.45, plantM: 0.15, heightM: 0.9, spreadM: 0.3, ground: { kind: 'ridges', heightM: 0.18 }, soil: 'red',
    colors: { ...BROAD_COLORS, leaf: c('#4a8a34'), leafRipe: c('#b8b04a'), leafDead: c('#b09060'), flower: c('#f0ece0'), fruit: c('#e0a020'), fruitRipe: c('#e0a020'), head: c('#f0ece0'), headRipe: c('#f0ece0') },
    stiffness: 0.35, topBloom: null, birds: 'myna',
  },
  tapioca: {
    slug: 'tapioca', archetype: 'broadleaf_tall', model: 'tapioca', profile: 'tuber',
    rowM: 0.9, plantM: 0.9, heightM: 2.2, spreadM: 0.6, ground: { kind: 'ridges', heightM: 0.2 }, soil: 'red',
    colors: { ...BROAD_COLORS, leaf: c('#3a6e30'), stem: c('#8a7a5a'), stemRipe: c('#7a6a52'), flower: c('#d8d0a0'), fruit: c('#8a7a5a'), fruitRipe: c('#8a7a5a'), head: c('#d8d0a0'), headRipe: c('#d8d0a0') },
    stiffness: 0.5, topBloom: null, birds: 'myna',
  },
  banana: {
    slug: 'banana', archetype: 'broadleaf_tall', model: 'banana', profile: 'banana',
    rowM: 1.8, plantM: 1.8, heightM: 3.0, spreadM: 1.4, ground: { kind: 'flat' }, soil: 'brown',
    colors: { ...BROAD_COLORS, leafYoung: c('#9acb5a'), leaf: c('#5a9a3a'), leafRipe: c('#7a9a40'), leafDead: c('#8a7a50'), stem: c('#7e9a52'), stemRipe: c('#7a8a50'), flower: c('#6a2238'), fruit: c('#6a9a3a'), fruitRipe: c('#9ab048'), head: c('#6a2238'), headRipe: c('#5a2030') },
    stiffness: 0.7, topBloom: null, birds: 'myna',
  },
};

/** Slugs the 3D scene supports besides paddy. Coconut (perennial, not plannable) is excluded. */
export const UPLAND_SLUGS = Object.keys(CROP_SPECS);

export function specFor(slug: string | null | undefined): CropSpec | null {
  if (!slug) return null;
  return CROP_SPECS[slug] ?? null;
}

export function isPaddySlug(slug: string | null | undefined): boolean {
  return !slug || slug === 'paddy' || slug.includes('rice');
}
