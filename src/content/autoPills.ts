export const resolveMatchedHpPercent = (matchedHp: number[]): number | null => {
  if (matchedHp.length === 0) {
    return null;
  }

  return Math.min(...matchedHp);
};
