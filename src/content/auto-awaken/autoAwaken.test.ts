import { describe, expect, it } from "vitest";
import { AWAKEN_STATS, AWAKEN_STAT_BY_ID } from "./stats";

describe("AWAKEN_STATS", () => {
  it("should have valid stat definitions", () => {
    expect(AWAKEN_STATS.length).toBeGreaterThan(0);
    expect(AWAKEN_STATS).toContainEqual(
      expect.objectContaining({
        id: expect.any(String),
        label: expect.any(String),
        ocrNames: expect.any(Array),
        values: expect.any(Array),
      }),
    );
  });

  it("should have matching AWAKEN_STAT_BY_ID index", () => {
    const byId = AWAKEN_STAT_BY_ID as Record<string, (typeof AWAKEN_STATS)[0]>;
    AWAKEN_STATS.forEach((stat) => {
      expect(byId[stat.id]).toBeDefined();
      expect(byId[stat.id].id).toBe(stat.id);
    });
  });

  it("should have valid OCR name variations", () => {
    AWAKEN_STATS.forEach((stat) => {
      expect(stat.ocrNames.length).toBeGreaterThan(0);
      stat.ocrNames.forEach((name) => {
        expect(name).toBeTruthy();
        expect(typeof name).toBe("string");
      });
    });
  });

  it("should have valid stat values", () => {
    AWAKEN_STATS.forEach((stat) => {
      expect(stat.values.length).toBeGreaterThan(0);
      // All values should be numbers
      stat.values.forEach((value) => {
        expect(typeof value).toBe("number");
        expect(value).toBeGreaterThanOrEqual(0);
      });
      // Values should be sorted
      for (let i = 1; i < stat.values.length; i++) {
        expect(stat.values[i]).toBeGreaterThanOrEqual(stat.values[i - 1]);
      }
    });
  });

  it("STR stat should have correct values", () => {
    const strStat = AWAKEN_STAT_BY_ID["STR"];
    expect(strStat).toBeDefined();
    expect(strStat.label).toBe("STR (+)");
    expect(strStat.ocrNames).toContain("STR");
    expect(strStat.valuesGoddess).toEqual([1, 2, 3, 4]);
    expect(strStat.valuesDemon).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("Critical Chance should have percent flag set", () => {
    const critStat = AWAKEN_STAT_BY_ID["CriticalChance"];
    expect(critStat).toBeDefined();
    expect(critStat.isPercent).toBe(true);
  });

  it("Speed should have exactMatch flag set", () => {
    const speedStat = AWAKEN_STAT_BY_ID["Speed"];
    expect(speedStat).toBeDefined();
    expect(speedStat.exactMatch).toBe(true);
    expect(speedStat.isPercent).toBe(true);
  });
});

describe("Auto-Awaken text parsing logic", () => {
  // Simulate the normalize and parsing functions from startAutoAwakenLoop
  const normalizeAwakenResultLabel = (value: string): string =>
    value
      .replace(/[|!]/g, "I")
      .replace(/0/g, "O")
      .replace(/5/g, "S")
      .replace(/[^A-Za-z ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const levenshtein = (a: string, b: string): number => {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const dp = Array.from({ length: a.length + 1 }, () =>
      new Array<number>(b.length + 1).fill(0),
    );
    for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }
    return dp[a.length][b.length];
  };

  it("should normalize OCR text correctly", () => {
    expect(normalizeAwakenResultLabel("STR +3")).toBe("str");
    expect(normalizeAwakenResultLabel("Critical Chance % +1.5")).toBe(
      "critical chance s",
    );
    expect(normalizeAwakenResultLabel("Defense +10")).toBe("defense o");
  });

  it("should handle confusable characters in normalization", () => {
    // 0 -> O, 5 -> S, | -> I, ! -> I
    expect(normalizeAwakenResultLabel("STR|5")).toBe("stris");
    expect(normalizeAwakenResultLabel("C0 D3F3NS3 +10")).toBe("co d f ns o");
  });

  it("should calculate levenshtein distance correctly", () => {
    expect(levenshtein("str", "str")).toBe(0);
    expect(levenshtein("str", "str!")).toBe(1);
    expect(levenshtein("attack", "attak")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("should match stat names with fuzzy logic", () => {
    const configuredCriteria = [
      { statId: "STR", statValue: 3 },
      { statId: "Defense", statValue: 10 },
    ];

    const findBestConfiguredStatId = (label: string): string | null => {
      const normalizedLabel = normalizeAwakenResultLabel(label).replace(
        /\s+/g,
        "",
      );
      if (!normalizedLabel) {
        return null;
      }

      let best: { statId: string; score: number } | null = null;
      for (const criterion of configuredCriteria) {
        const stat = AWAKEN_STAT_BY_ID[criterion.statId];
        if (!stat) continue;

        for (const name of stat.ocrNames) {
          const candidate = normalizeAwakenResultLabel(name).replace(
            /\s+/g,
            "",
          );
          if (!candidate) continue;

          let score = 0;
          if (normalizedLabel === candidate) {
            score = 1;
          } else if (normalizedLabel.includes(candidate)) {
            score = candidate.length / normalizedLabel.length;
          } else {
            const dist = levenshtein(normalizedLabel, candidate);
            score =
              1 - dist / Math.max(normalizedLabel.length, candidate.length);
          }

          if (!best || score > best.score) {
            best = { statId: criterion.statId, score };
          }
        }
      }

      return best && best.score >= 0.58 ? best.statId : null;
    };

    expect(findBestConfiguredStatId("STR")).toBe("STR");
    expect(findBestConfiguredStatId("Defense +10")).toBe("Defense");
    expect(findBestConfiguredStatId("str +3")).toBe("STR");
    // "def" alone is too short to match "defense" with >0.58 score
    expect(findBestConfiguredStatId("def +14")).toBeNull();
    expect(findBestConfiguredStatId("defense +14")).toBe("Defense");
  });
});

describe("Auto-Awaken criteria evaluation", () => {
  const evaluateCriteria = (
    stat1Criteria: Array<{ id: string; statId: string; statValue: number }>,
    stat2Criteria: Array<{ id: string; statId: string; statValue: number }>,
    occurrencesByStat: Map<string, number[]>,
  ) => {
    const hasStat1Section = stat1Criteria.length > 0;
    const hasStat2Section = stat2Criteria.length > 0;
    const singleSectionMode = hasStat1Section !== hasStat2Section;

    const sectionMatches = (
      criteria: Array<{ id: string; statId: string; statValue: number }>,
    ): boolean => {
      if (criteria.length === 0) {
        return true;
      }

      return criteria.some((criterion) => {
        const occurrences = occurrencesByStat.get(criterion.statId) ?? [];
        if (occurrences.length === 0) return false;
        if (singleSectionMode && occurrences.length >= 2) {
          const sum = occurrences.reduce((a, b) => a + b, 0);
          return sum >= criterion.statValue;
        }
        return occurrences.some((value) => value >= criterion.statValue);
      });
    };

    return (
      (hasStat1Section || hasStat2Section) &&
      sectionMatches(stat1Criteria) &&
      sectionMatches(stat2Criteria)
    );
  };

  it("should evaluate single stat criteria", () => {
    const stat1Criteria = [{ id: "c1", statId: "STR", statValue: 3 }];
    const stat2Criteria: typeof stat1Criteria = [];

    const occurrencesByStat = new Map<string, number[]>();
    occurrencesByStat.set("STR", [3]);

    const matched = evaluateCriteria(
      stat1Criteria,
      stat2Criteria,
      occurrencesByStat,
    );

    expect(matched).toBe(true);
  });

  it("should not match when stat value is below target", () => {
    const criteria = [{ id: "c1", statId: "STR", statValue: 5 }];
    const occurrencesByStat = new Map<string, number[]>();
    occurrencesByStat.set("STR", [3]);

    const matched = criteria.some((criterion) => {
      const occurrences = occurrencesByStat.get(criterion.statId) ?? [];
      return occurrences.some((value) => value >= criterion.statValue);
    });

    expect(matched).toBe(false);
  });

  it("should sum occurrences in single section mode", () => {
    const stat1Criteria = [{ id: "c1", statId: "STR", statValue: 4 }];
    const stat2Criteria: typeof stat1Criteria = [];

    const occurrencesByStat = new Map<string, number[]>();
    occurrencesByStat.set("STR", [2, 3]); // Should sum to 5 >= 4

    const matched = evaluateCriteria(
      stat1Criteria,
      stat2Criteria,
      occurrencesByStat,
    );

    expect(matched).toBe(true);
  });

  it("should use OR logic within a section", () => {
    const stat1Criteria = [
      { id: "c1", statId: "STR", statValue: 5 },
      { id: "c2", statId: "Defense", statValue: 10 },
    ];
    const stat2Criteria: typeof stat1Criteria = [];

    const occurrencesByStat = new Map<string, number[]>();
    occurrencesByStat.set("STR", [3]); // Below threshold
    occurrencesByStat.set("Defense", [12]); // Above threshold

    const matched = evaluateCriteria(
      stat1Criteria,
      stat2Criteria,
      occurrencesByStat,
    );

    expect(matched).toBe(true);
  });

  it("should require both sections when both are configured", () => {
    const stat1Criteria = [{ id: "c1", statId: "STR", statValue: 3 }];
    const stat2Criteria = [{ id: "c2", statId: "Defense", statValue: 10 }];

    const occurrencesByStat = new Map<string, number[]>();
    occurrencesByStat.set("STR", [3]);

    const matched = evaluateCriteria(
      stat1Criteria,
      stat2Criteria,
      occurrencesByStat,
    );

    expect(matched).toBe(false);
  });

  it("should match when both configured sections are satisfied", () => {
    const stat1Criteria = [{ id: "c1", statId: "STR", statValue: 3 }];
    const stat2Criteria = [{ id: "c2", statId: "Defense", statValue: 10 }];

    const occurrencesByStat = new Map<string, number[]>();
    occurrencesByStat.set("STR", [3]);
    occurrencesByStat.set("Defense", [12]);

    const matched = evaluateCriteria(
      stat1Criteria,
      stat2Criteria,
      occurrencesByStat,
    );

    expect(matched).toBe(true);
  });
});

describe("Auto-Awaken region validation", () => {
  it("should validate normalized rect bounds", () => {
    const normalizeScanRegion = (
      value: unknown,
    ): { x: number; y: number; width: number; height: number } | null => {
      if (typeof value !== "object" || value === null) {
        return null;
      }

      const parsed = value as Partial<{
        x: unknown;
        y: unknown;
        width: unknown;
        height: unknown;
      }>;
      const x = Number(parsed.x);
      const y = Number(parsed.y);
      const width = Number(parsed.width);
      const height = Number(parsed.height);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        return null;
      }

      const clampedX = Math.max(0, Math.min(x, 1));
      const clampedY = Math.max(0, Math.min(y, 1));
      const clampedWidth = Math.max(0, Math.min(width, 1 - clampedX));
      const clampedHeight = Math.max(0, Math.min(height, 1 - clampedY));

      if (clampedWidth <= 0 || clampedHeight <= 0) {
        return null;
      }

      return {
        x: clampedX,
        y: clampedY,
        width: clampedWidth,
        height: clampedHeight,
      };
    };

    expect(
      normalizeScanRegion({ x: 0.2, y: 0.3, width: 0.6, height: 0.5 }),
    ).toEqual({
      x: 0.2,
      y: 0.3,
      width: 0.6,
      height: 0.5,
    });

    expect(
      normalizeScanRegion({ x: -0.1, y: 0.3, width: 0.6, height: 0.5 }),
    ).toEqual({
      x: 0,
      y: 0.3,
      width: 0.6,
      height: 0.5,
    });

    expect(
      normalizeScanRegion({ x: 0.8, y: 0.3, width: 0.6, height: 0.5 }),
    ).toEqual({
      x: 0.8,
      y: 0.3,
      width: expect.closeTo(0.2, 5), // Clamped to prevent overflow, account for floating point
      height: 0.5,
    });

    expect(normalizeScanRegion(null)).toBeNull();
    expect(
      normalizeScanRegion({ x: 0.5, y: 0.5, width: 0, height: 0.5 }),
    ).toBeNull();
  });
});
