import type { GrowthStageKey } from '../types';
import type { CropSpec, GrowthProfile, RGB } from './specs';

/**
 * Pure, deterministic mapping from the crop model's stage to visual parameters for
 * the non-paddy crops. Keyframes describe the plant at the boundaries of the five
 * generic stages (establishment → vegetative → flowering → yield formation →
 * maturity); within a stage we ease between neighbouring keyframes, so
 * (stage i, progress 1) == (stage i+1, progress 0) and scrubbing is stable.
 */
export interface CropVisual {
  /** 0 = nothing sown yet, 1 = full stand. */
  presence: number;
  /** Height as a share of the mature plant. */
  scale: number;
  /** Share of leaves that have unfolded (bottom first). */
  leaves: number;
  /** Share of leaves that are dead (oldest first). */
  senescence: number;
  /** Flowers open up to this order threshold; those below `flowerDrop` have fallen. */
  flower: number;
  flowerDrop: number;
  /** Fruits set up to this threshold; `fruitSize` is their growth. */
  fruit: number;
  fruitSize: number;
  /** 0 = unripe, 1 = fully ripe / dry. */
  ripe: number;
  /** Inflorescence emergence (tassel, millet head, sunflower head, banana bunch). */
  head: number;
  /** Heads nodding, pods hanging, onion tops falling. */
  droop: number;
  leafColor: RGB;
  /** Far-canopy cover of the dominant top colour (blooms, open bolls, ripe heads). */
  bloomCover: number;
  bloomColor: RGB;
}

interface Key {
  scale: number; leaves: number; sen: number; flower: number; drop: number;
  fruit: number; size: number; ripe: number; head: number; droop: number;
  /** 0 young → 1 mature → 2 ripening → 3 dead. */
  tone: number;
}

const K = (k: Partial<Key>, base: Key): Key => ({ ...base, ...k });
const ZERO: Key = { scale: 0, leaves: 0, sen: 0, flower: 0, drop: 0, fruit: 0, size: 0, ripe: 0, head: 0, droop: 0, tone: 0 };

/** Six keyframes: start of establishment, then the end of each of the five stages. */
function chain(...parts: Array<Partial<Key>>): Key[] {
  const out: Key[] = [];
  let prev = ZERO;
  for (const p of parts) {
    prev = K(p, prev);
    out.push(prev);
  }
  return out;
}

const PROFILES: Record<GrowthProfile, Key[]> = {
  cereal: chain(
    { scale: 0.05, leaves: 0.12 },
    { scale: 0.16, leaves: 0.3, tone: 0.4 },
    // Heads stay in the boot until flowering.
    { scale: 0.82, leaves: 0.95, head: 0, tone: 1 },
    { scale: 1, leaves: 1, head: 1, flower: 1, drop: 0.2, fruit: 0.35, size: 0.3 },
    { fruit: 1, size: 1, ripe: 0.3, drop: 1, sen: 0.3, droop: 0.45, tone: 1.4 },
    { ripe: 1, sen: 0.9, droop: 1, tone: 2.6 },
  ),
  // Sugarcane: germination → tillering → (no flowering) → grand growth → ripening.
  cane: chain(
    { scale: 0.03, leaves: 0.2 },
    { scale: 0.1, leaves: 0.4, tone: 0.5 },
    { scale: 0.35, leaves: 1, tone: 1 },
    { scale: 0.36 },
    { scale: 0.95, sen: 0.45, ripe: 0.3, tone: 1.1 },
    { scale: 1, sen: 0.6, ripe: 1, tone: 1.4 },
  ),
  dicot: chain(
    { scale: 0.06, leaves: 0.1 },
    { scale: 0.2, leaves: 0.3, tone: 0.5 },
    { scale: 0.75, leaves: 0.85, flower: 0.1, head: 0.1, tone: 1 },
    { scale: 0.95, leaves: 1, flower: 1, drop: 0.5, fruit: 0.35, size: 0.35, head: 1 },
    { scale: 1, drop: 1, fruit: 1, size: 1, ripe: 0.45, sen: 0.3, droop: 0.4, tone: 1.3 },
    { ripe: 1, sen: 0.85, droop: 1, tone: 2.5 },
  ),
  // Vegetables are transplanted seedlings and keep fruiting through repeated pickings.
  vegetable: chain(
    { scale: 0.12, leaves: 0.25 },
    { scale: 0.25, leaves: 0.4, tone: 0.6 },
    { scale: 0.75, leaves: 0.9, flower: 0.15, head: 0.1, tone: 1 },
    { scale: 0.95, leaves: 1, flower: 1, drop: 0.4, fruit: 0.4, size: 0.4, head: 1 },
    { scale: 1, drop: 0.8, fruit: 1, size: 1, ripe: 0.6, sen: 0.15, tone: 1.1 },
    { ripe: 1, sen: 0.35, tone: 1.5 },
  ),
  // Small onion: leaves, then bulbing; tops fall over and dry at maturity.
  onion: chain(
    { scale: 0.1, leaves: 0.2 },
    { scale: 0.3, leaves: 0.5, tone: 0.5 },
    { scale: 0.85, leaves: 1, fruit: 0.3, size: 0.2, tone: 1 },
    { scale: 1, fruit: 0.6, size: 0.5 },
    // Tops stay green while bulbs fill; they only fall and dry once the crop matures.
    { fruit: 1, size: 1, droop: 0.2, sen: 0.06, ripe: 0.5, tone: 1.15 },
    { droop: 1, sen: 0.9, ripe: 1, tone: 2.4 },
  ),
  // Banana: "flowering" is shooting of the bunch; harvested green-mature.
  banana: chain(
    { scale: 0.08, leaves: 0.3 },
    { scale: 0.25, leaves: 0.5, tone: 0.6 },
    { scale: 0.85, leaves: 1, tone: 1 },
    { scale: 1, head: 1, flower: 1, fruit: 0.3, size: 0.3 },
    { fruit: 1, size: 1, sen: 0.3, ripe: 0.2, tone: 1.1 },
    { ripe: 0.45, sen: 0.5, tone: 1.3 },
  ),
  // Turmeric: leaves yellow and dry completely when the rhizomes are ready.
  rhizome: chain(
    { scale: 0.05, leaves: 0.15 },
    { scale: 0.2, leaves: 0.35, tone: 0.5 },
    { scale: 0.8, leaves: 0.9, tone: 1 },
    { scale: 1, leaves: 1 },
    { sen: 0.3, tone: 1.2 },
    { scale: 0.9, sen: 1, ripe: 1, tone: 2.8 },
  ),
  // Tapioca: tall stems, lower leaves shed as roots bulk up.
  tuber: chain(
    { scale: 0.05, leaves: 0.2 },
    { scale: 0.15, leaves: 0.35, tone: 0.5 },
    { scale: 0.6, leaves: 0.8, tone: 1 },
    { scale: 0.8, leaves: 1 },
    { scale: 1, sen: 0.25, tone: 1.1 },
    { sen: 0.55, tone: 1.6 },
  ),
};

/** Profiles whose dead leaves fall off (pulses defoliate at maturity, tapioca sheds lower leaves). */
export function shedsLeaves(profile: GrowthProfile): boolean {
  return profile === 'dicot' || profile === 'tuber';
}

/** Applies a crop's senescence cap: leaves yellow less and fewer of them die. */
function capSenescence(spec: CropSpec, k: Key): Key {
  const cap = spec.maxSenescence;
  if (cap == null) return k;
  return { ...k, sen: Math.min(k.sen, cap), tone: Math.min(k.tone, 1 + cap * 2) };
}

/** Backend generic stage keys, in order. */
export const GENERIC_STAGES = ['establishment', 'vegetative', 'flowering', 'yield_formation', 'maturity'] as const;

/** Visual (rice-vocabulary) stage → generic stage index; -1 = not sown yet, 5 = harvested. */
const FROM_VISUAL: Record<GrowthStageKey, number> = {
  fallow: -1, nursery: -1, establishment: 0, tillering: 1, stem_elongation: 1, panicle_initiation: 1,
  flowering: 2, grain_filling: 3, maturity: 4, harvested: 5,
};

/** Resolves the generic stage index from the raw backend key (preferred) or the visual key. */
export function genericStageIndex(rawKey: string | null | undefined, visual: GrowthStageKey): number {
  const i = rawKey ? (GENERIC_STAGES as readonly string[]).indexOf(rawKey) : -1;
  if (i >= 0) return i;
  return FROM_VISUAL[visual] ?? -1;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function toneColor(spec: CropSpec, tone: number): RGB {
  const { leafYoung, leaf, leafRipe, leafDead } = spec.colors;
  if (tone <= 1) return lerpRGB(leafYoung, leaf, clamp01(tone));
  if (tone <= 2) return lerpRGB(leaf, leafRipe, tone - 1);
  return lerpRGB(leafRipe, leafDead, clamp01(tone - 2));
}

function bloom(spec: CropSpec, k: Key): { cover: number; color: RGB } {
  const col = spec.colors;
  switch (spec.topBloom) {
    case 'flower':
      return { cover: clamp01(k.flower - k.drop) * (spec.bloomStrength ?? 0.4), color: col.flower };
    case 'fruit':
      return { cover: k.fruit * k.size * (0.25 + 0.75 * k.ripe) * (spec.bloomStrength ?? 0.4), color: lerpRGB(col.fruit, col.fruitRipe, k.ripe) };
    case 'head':
      return { cover: k.head * 0.55, color: lerpRGB(col.head, col.headRipe, k.ripe) };
    default:
      return { cover: 0, color: col.flower };
  }
}

export function cropVisual(spec: CropSpec, stageIndex: number, stageProgress: number): CropVisual {
  const keys = PROFILES[spec.profile];
  let k: Key;
  let presence = 1;
  if (stageIndex < 0) {
    // Field prepared and sown; nothing has emerged.
    k = keys[0]!;
    presence = 0;
  } else if (stageIndex >= GENERIC_STAGES.length) {
    k = keys[keys.length - 1]!;
  } else {
    const a = keys[stageIndex]!;
    const b = keys[stageIndex + 1]!;
    const t = ease(clamp01(stageProgress));
    k = {
      scale: lerp(a.scale, b.scale, t), leaves: lerp(a.leaves, b.leaves, t), sen: lerp(a.sen, b.sen, t),
      flower: lerp(a.flower, b.flower, t), drop: lerp(a.drop, b.drop, t), fruit: lerp(a.fruit, b.fruit, t),
      size: lerp(a.size, b.size, t), ripe: lerp(a.ripe, b.ripe, t), head: lerp(a.head, b.head, t),
      droop: lerp(a.droop, b.droop, t), tone: lerp(a.tone, b.tone, t),
    };
  }
  k = capSenescence(spec, k);
  const b = bloom(spec, k);
  return {
    presence,
    scale: k.scale,
    leaves: k.leaves,
    senescence: k.sen,
    flower: k.flower,
    flowerDrop: k.drop,
    fruit: k.fruit,
    fruitSize: k.size,
    ripe: k.ripe,
    head: k.head,
    droop: k.droop,
    leafColor: toneColor(spec, k.tone),
    bloomCover: b.cover * presence,
    bloomColor: b.color,
  };
}

/** Horizontal canopy radius of one plant (m) for the far-field canopy shader. */
export function canopyRadius(spec: CropSpec, v: CropVisual): number {
  const leafy = Math.max(0.15, v.leaves * (1 - 0.5 * v.senescence));
  return spec.spreadM * Math.min(1, 0.25 + Math.sqrt(v.scale) * 0.85) * leafy;
}
