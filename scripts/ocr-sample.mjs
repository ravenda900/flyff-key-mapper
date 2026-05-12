import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM } from "tesseract.js";

const rootDir = process.cwd();

const references = [
  {
    file: path.join(rootDir, "public", "demon.png"),
    label: "demon",
    expected: {
      left: "Attack Speed+3%",
      right: "Magic Defense+0",
    },
  },
  {
    file: path.join(rootDir, "public", "goddess.png"),
    label: "goddess",
    expected: {
      left: "0",
      right: "0",
    },
  },
];

const cropVariants = [
  { xInset: 0.028, y: 0.796, width: 0.448, height: 0.088, scale: 4 },
  { xInset: 0.036, y: 0.812, width: 0.428, height: 0.068, scale: 4 },
  { xInset: 0.042, y: 0.822, width: 0.412, height: 0.056, scale: 5 },
  { xInset: 0.03, y: 0.804, width: 0.44, height: 0.072, scale: 5 },
  { xInset: 0.038, y: 0.818, width: 0.42, height: 0.05, scale: 6 },
];

const preprocessVariants = [
  { mode: "threshold", threshold: 150 },
  { mode: "threshold", threshold: 132 },
  { mode: "threshold", threshold: 168 },
  { mode: "bright-mask" },
  { mode: "bright-mask-strict" },
];

const normalizeText = (value) => value.replace(/\s+/g, " ").trim();

const normalizeForMatch = (value) =>
  normalizeText(value)
    .replace(/[|!]/g, "I")
    .replace(/0/g, "O")
    .replace(/5/g, "S")
    .replace(/[^A-Za-z0-9+%]/g, "")
    .toLowerCase();

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
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

const scoreAgainstExpected = (actual, expected) => {
  const normalizedActual = normalizeForMatch(actual);
  const normalizedExpected = normalizeForMatch(expected);
  if (!normalizedActual) {
    return -1;
  }
  if (normalizedActual === normalizedExpected) {
    return 10;
  }
  if (
    normalizedActual.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedActual)
  ) {
    return 8;
  }
  const distance = levenshtein(normalizedActual, normalizedExpected);
  const similarity =
    1 - distance / Math.max(normalizedActual.length, normalizedExpected.length);
  let score = similarity * 6;
  if (/\d/.test(actual)) score += 1;
  if (/[+]/.test(actual)) score += 1;
  if (/%/.test(actual)) score += 1;
  return score;
};

const applyMedianBlur3x3Binary = (source, width, height) => {
  const out = new Uint8ClampedArray(source.length);
  const values = new Array(9).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let idx = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        const sy = Math.max(0, Math.min(height - 1, y + ky));
        for (let kx = -1; kx <= 1; kx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + kx));
          values[idx++] = source[(sy * width + sx) * 4];
        }
      }
      values.sort((a, b) => a - b);
      const median = values[4];
      const dstIndex = (y * width + x) * 4;
      out[dstIndex] = median;
      out[dstIndex + 1] = median;
      out[dstIndex + 2] = median;
      out[dstIndex + 3] = 255;
    }
  }
  return out;
};

const applyErode2x2Binary = (source, width, height) => {
  const out = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let minVal = 255;
      for (let ky = 0; ky < 2; ky += 1) {
        const sy = Math.max(0, Math.min(height - 1, y + ky));
        for (let kx = 0; kx < 2; kx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + kx));
          const srcIndex = (sy * width + sx) * 4;
          if (source[srcIndex] < minVal) {
            minVal = source[srcIndex];
          }
        }
      }
      const dstIndex = (y * width + x) * 4;
      out[dstIndex] = minVal;
      out[dstIndex + 1] = minVal;
      out[dstIndex + 2] = minVal;
      out[dstIndex + 3] = 255;
    }
  }
  return out;
};

const preprocessRawRgba = (rgba, variant) => {
  const data = new Uint8ClampedArray(rgba);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let v = 255;

    if (variant.mode === "bright-mask") {
      const isBrightWhite = r > 165 && g > 165 && b > 165;
      const isGoldText = r > 140 && g > 110 && b > 60;
      v = isBrightWhite || isGoldText ? 0 : 255;
    } else if (variant.mode === "bright-mask-strict") {
      const isBrightWhite = r > 185 && g > 185 && b > 185;
      const isGoldText = r > 165 && g > 125 && b > 65;
      v = isBrightWhite || isGoldText ? 0 : 255;
    } else {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      v = gray > variant.threshold ? 0 : 255;
    }

    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return data;
};

const sideCrop = (width, side, variant) => {
  const sideBaseX = side === "left" ? variant.xInset : 0.5 + variant.xInset;
  return {
    left: Math.round(width * sideBaseX),
    top: Math.round(heightCache * variant.y),
    width: Math.max(1, Math.round(width * variant.width)),
    height: Math.max(1, Math.round(heightCache * variant.height)),
  };
};

let heightCache = 0;

const run = async () => {
  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    tessedit_char_whitelist:
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+.% ",
  });

  try {
    for (const reference of references) {
      const imageMeta = await sharp(reference.file).metadata();
      const width = imageMeta.width ?? 0;
      const height = imageMeta.height ?? 0;
      heightCache = height;

      console.log(`\n=== ${reference.label} (${width}x${height}) ===`);

      for (const side of ["left", "right"]) {
        const expected = reference.expected[side];
        const best = [];

        for (const cropVariant of cropVariants) {
          const crop = sideCrop(width, side, cropVariant);
          const extracted = await sharp(reference.file)
            .extract(crop)
            .resize({
              width: crop.width * cropVariant.scale,
              height: crop.height * cropVariant.scale,
              kernel: sharp.kernel.nearest,
            })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          for (const preprocessVariant of preprocessVariants) {
            const processed = preprocessRawRgba(
              extracted.data,
              preprocessVariant,
            );
            const blurred = applyMedianBlur3x3Binary(
              processed,
              extracted.info.width,
              extracted.info.height,
            );
            const eroded = applyErode2x2Binary(
              blurred,
              extracted.info.width,
              extracted.info.height,
            );

            const pngBuffer = await sharp(Buffer.from(eroded), {
              raw: {
                width: extracted.info.width,
                height: extracted.info.height,
                channels: 4,
              },
            })
              .png()
              .toBuffer();

            const result = await worker.recognize(pngBuffer);
            const text = normalizeText(result?.data?.text ?? "");
            const score = scoreAgainstExpected(text, expected);
            best.push({
              side,
              expected,
              text,
              score,
              cropVariant,
              preprocessVariant,
            });
          }
        }

        best.sort((a, b) => b.score - a.score);
        console.log(`\n${side.toUpperCase()} expected: ${expected}`);
        for (const candidate of best.slice(0, 5)) {
          console.log(
            [
              `score=${candidate.score.toFixed(2)}`,
              `text="${candidate.text || "(empty)"}"`,
              `crop=${JSON.stringify(candidate.cropVariant)}`,
              `pre=${JSON.stringify(candidate.preprocessVariant)}`,
            ].join(" | "),
          );
        }
      }
    }
  } finally {
    await worker.terminate();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
