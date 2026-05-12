/**
 * Blessing of the Goddess / Blessing of the Demon stat definitions.
 *
 * - ocrNames: all OCR text variations that map to this stat.  The first entry
 *   is the canonical name used in the UI.
 * - exactMatch: when true the OCR hit must be an exact whole-word match so
 *   "Speed %" does not match "Attack Speed %" or "Casting Speed %".
 * - valuesGoddess / valuesDemon: all possible numeric values per blessing type.
 * - values: union of both, deduplicated and sorted ascending – used for the
 *   value dropdown when the blessing type is unknown / "auto".
 */
export type AwakenStatDefinition = {
  id: string;
  label: string;
  ocrNames: string[];
  exactMatch: boolean;
  isPercent: boolean;
  valuesGoddess: number[];
  valuesDemon: number[];
  values: number[];
};

const make = (
  id: string,
  label: string,
  ocrNames: string[],
  valuesGoddess: number[],
  valuesDemon: number[],
  opts: { exactMatch?: boolean; isPercent?: boolean } = {},
): AwakenStatDefinition => {
  const union = Array.from(new Set([...valuesGoddess, ...valuesDemon])).sort(
    (a, b) => a - b,
  );
  return {
    id,
    label,
    ocrNames,
    exactMatch: opts.exactMatch ?? false,
    isPercent: opts.isPercent ?? false,
    valuesGoddess,
    valuesDemon,
    values: union,
  };
};

export const AWAKEN_STATS: AwakenStatDefinition[] = [
  make("STR", "STR (+)", ["STR"], [1, 2, 3, 4], [0, 1, 2, 3, 4, 5]),
  make("DEX", "DEX (+)", ["DEX"], [1, 2, 3, 4], [0, 1, 2, 3, 4, 5]),
  make("INT", "INT (+)", ["INT"], [1, 2, 3, 4], [0, 1, 2, 3, 4, 5]),
  make("STA", "STA (+)", ["STA"], [1, 2, 3, 4], [0, 1, 2, 3, 4, 5]),
  make(
    "CriticalChance",
    "Critical Chance (%)",
    ["Critical Chance %", "Critical Chance"],
    [0.5, 1.0, 1.5, 2.0],
    [0.0, 0.5, 1.0, 1.5, 2.0, 2.5],
    { isPercent: true },
  ),
  make(
    "CriticalDamage",
    "Critical Damage (%)",
    ["Critical Damage %", "Critical Damage"],
    [0.5, 1.0, 1.5, 2.0],
    [0.0, 0.5, 1.0, 1.5, 2.0, 2.5],
    { isPercent: true },
  ),
  // exactMatch = true: "Speed %" must not match "Attack Speed %" / "Casting Speed %"
  make(
    "Speed",
    "Speed (%)",
    ["Speed %", "Speed"],
    [1.0, 2.0],
    [0.0, 1.0, 2.0, 3.0],
    { exactMatch: true, isPercent: true },
  ),
  make(
    "AttackSpeed",
    "Attack Speed (%)",
    ["Attack Speed %", "Attack Speed"],
    [1.0, 2.0],
    [0.0, 1.0, 2.0, 3.0],
    { exactMatch: true, isPercent: true },
  ),
  make(
    "CastingSpeed",
    "Casting Speed (%)",
    ["Casting Speed %", "Casting Speed"],
    [1.0, 2.0],
    [0.0, 1.0, 2.0, 3.0],
    { exactMatch: true, isPercent: true },
  ),
  make(
    "Defense",
    "Defense (+)",
    ["Defense"],
    [2, 6, 10, 14],
    [0, 2, 6, 10, 14, 18],
  ),
  make(
    "MagicDefense",
    "Magic Defense (+)",
    ["Magic Defense"],
    [2, 6, 10, 14],
    [0, 2, 6, 10, 14, 18],
  ),
  make(
    "Attack",
    "Attack (+)",
    ["Attack"],
    [5, 9, 13, 17],
    [0, 5, 9, 13, 17, 21],
  ),
  make("HP", "HP (+)", ["HP"], [12, 20, 28, 37], [0, 12, 20, 28, 37, 46]),
  make("MP", "MP (+)", ["MP"], [12, 20, 28, 37], [0, 12, 20, 28, 37, 46]),
  make("FP", "FP (+)", ["FP"], [12, 20, 28, 37], [0, 12, 20, 28, 37, 46]),
  make(
    "Parry",
    "Parry (%)",
    ["Parry %", "Parry"],
    [1.0, 2.0],
    [0.0, 1.0, 2.0, 3.0],
    { isPercent: true },
  ),
  make(
    "MeleeBlock",
    "Melee Block (%)",
    ["Melee Block %", "Melee Block"],
    [1.0, 2.0],
    [0.0, 1.0, 2.0, 3.0],
    { isPercent: true },
  ),
  make(
    "RangedBlock",
    "Ranged Block (%)",
    ["Ranged Block %", "Ranged Block"],
    [1.0, 2.0],
    [0.0, 1.0, 2.0, 3.0],
    { isPercent: true },
  ),
  make(
    "PvEDamage",
    "PvE Damage (+)",
    ["PvE Damage"],
    [10, 15, 20, 25],
    [0, 10, 15, 20, 25, 30],
  ),
  make(
    "PvEDmgResist",
    "PvE Dmg Resist (+)",
    ["PvE Dmg Resist", "PvE Damage Resist"],
    [10, 15, 20, 25],
    [0, 10, 15, 20, 25, 30],
  ),
];

export const AWAKEN_STAT_BY_ID = Object.fromEntries(
  AWAKEN_STATS.map((s) => [s.id, s]),
);

/**
 * Exact-word-aware match: checks whether the OCR line contains the candidate
 * stat name as a standalone token (not inside a longer stat name).
 */
export const ocrLineMatchesStat = (
  line: string,
  stat: AwakenStatDefinition,
): boolean => {
  const normalizedLine = line.trim();
  for (const ocrName of stat.ocrNames) {
    if (stat.exactMatch) {
      // Require ocrName to appear at a word boundary – not preceded or
      // followed by alpha chars. Simple and fast without regex look-behind.
      const idx = normalizedLine.indexOf(ocrName);
      if (idx === -1) continue;
      const before = idx === 0 ? "" : normalizedLine[idx - 1];
      const after =
        idx + ocrName.length >= normalizedLine.length
          ? ""
          : normalizedLine[idx + ocrName.length];
      const beforeOk = before === "" || !/[A-Za-z]/.test(before);
      const afterOk = after === "" || !/[A-Za-z]/.test(after);
      if (beforeOk && afterOk) {
        return true;
      }
    } else {
      if (normalizedLine.includes(ocrName)) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Parse a numeric value from an OCR token that may look like:
 *   "3", "+3", "2.5", "2.5%", "1.00%", "0"
 */
export const parseOcrValue = (token: string): number | null => {
  const cleaned = token.replace(/[+%]/g, "").trim();
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
};
