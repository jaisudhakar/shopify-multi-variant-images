// Shared (client + server) types and helpers for the colour -> images mapping.

export const METAFIELD_NAMESPACE = "$app";
export const METAFIELD_KEY = "variant_images";

/** Option names that are treated as "colour" when auto-detecting. */
export const COLOR_OPTION_NAMES = [
  "color",
  "colour",
  "colors",
  "colours",
  "couleur",
  "farbe",
  "kleur",
  "colore",
  "cor",
  "färg",
  "farve",
  "farge",
  "väri",
  "kolor",
  "renk",
  "色",
  "カラー",
  "색상",
];

export interface VariantImagesValue {
  /** ProductOptionValue GID — stable even if the value is renamed. */
  id: string;
  /** Option value name at save time, used as a fallback for matching. */
  name: string;
  /** Ordered list of Media GIDs (e.g. gid://shopify/MediaImage/123). */
  media: string[];
}

/** JSON stored in the product metafield `$app.variant_images`. */
export interface VariantImagesConfig {
  version: 1;
  optionId: string;
  optionName: string;
  values: VariantImagesValue[];
  updatedAt?: string;
}

export interface ProductOptionValue {
  id: string;
  name: string;
  hasVariants?: boolean;
  swatchColor?: string | null;
}

export interface ProductOption {
  id: string;
  name: string;
  position: number;
  optionValues: ProductOptionValue[];
}

export interface ProductMedia {
  id: string;
  alt: string;
  url: string | null;
  mediaContentType: string;
}

export function isColorOptionName(name: string) {
  return COLOR_OPTION_NAMES.includes(name.trim().toLowerCase());
}

/** Returns the option that most likely represents colour, or null. */
export function detectColorOption<T extends { name: string }>(options: T[]) {
  return options.find((option) => isColorOptionName(option.name)) ?? null;
}

export function parseConfig(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VariantImagesConfig;
    if (!parsed || !Array.isArray(parsed.values)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Number of colour values that have at least one image assigned. */
export function countConfiguredValues(config: VariantImagesConfig | null) {
  return config?.values.filter((value) => value.media.length > 0).length ?? 0;
}

/**
 * Builds a `{ [optionValueId]: mediaIds[] }` selection for `option` from a
 * stored config. Matches on option value ID first, then on name, so mappings
 * survive renames as well as values being deleted and re-created.
 */
export function selectionFromConfig(
  option: ProductOption,
  config: VariantImagesConfig | null,
  media: ProductMedia[],
) {
  const validMedia = new Set(media.map((item) => item.id));
  const selection: Record<string, string[]> = {};

  for (const value of option.optionValues) {
    const stored =
      config?.values.find((entry) => entry.id === value.id) ??
      config?.values.find(
        (entry) => entry.name.toLowerCase() === value.name.toLowerCase(),
      );
    // Drop images that were deleted from the product since the last save.
    selection[value.id] = (stored?.media ?? []).filter((id) =>
      validMedia.has(id),
    );
  }

  return selection;
}

function normalizeForMatch(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9À-￿]+/g, " ")
    .trim();
}

/**
 * Suggests images for each colour by looking for the colour name in the
 * image alt text or file name ("navy-blue-front.jpg" -> "Navy Blue").
 * Longer colour names win so "Light Blue" isn't also matched to "Blue".
 */
export function autoAssignByName(option: ProductOption, media: ProductMedia[]) {
  const values = [...option.optionValues].sort(
    (a, b) => b.name.length - a.name.length,
  );
  const result: Record<string, string[]> = Object.fromEntries(
    option.optionValues.map((value) => [value.id, []]),
  );

  for (const item of media) {
    const fileName = item.url
      ? decodeURIComponent(item.url.split("?")[0].split("/").pop() ?? "")
      : "";
    const haystack = ` ${normalizeForMatch(`${item.alt} ${fileName}`)} `;
    const match = values.find((value) => {
      const needle = normalizeForMatch(value.name);
      return needle && haystack.includes(` ${needle} `);
    });
    if (match) result[match.id].push(item.id);
  }

  return result;
}

export function buildConfig(
  option: ProductOption,
  selection: Record<string, string[]>,
): VariantImagesConfig {
  return {
    version: 1,
    optionId: option.id,
    optionName: option.name,
    values: option.optionValues.map((value) => ({
      id: value.id,
      name: value.name,
      media: selection[value.id] ?? [],
    })),
    updatedAt: new Date().toISOString(),
  };
}

export function numericId(gid: string) {
  return gid.split("/").pop() ?? gid;
}
