/** Formatting helpers (client-safe). */

export function formatBytes(bytes?: number | null): string | null {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDuration(seconds?: number | null): string | null {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatSpeed(bytesPerSecond?: number | null): string | null {
  if (!bytesPerSecond || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null;
  return `${formatBytes(bytesPerSecond)}/s`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const COMMON_RATIOS: Array<[string, number]> = [
  ["16:9", 16 / 9],
  ["9:16", 9 / 16],
  ["4:3", 4 / 3],
  ["3:4", 3 / 4],
  ["1:1", 1],
  ["21:9", 21 / 9],
  ["2.39:1", 2.39],
  ["2:1", 2]
];

/** Human aspect ratio like "16:9" from width/height, or null. */
export function aspectRatio(width?: number, height?: number): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  for (const [label, value] of COMMON_RATIOS) {
    if (Math.abs(ratio - value) / value < 0.02) return label;
  }
  const d = gcd(width, height);
  return `${Math.round(width / d)}:${Math.round(height / d)}`;
}

/** Friendly resolution label like "1080p", based on height. */
export function resolutionLabel(height?: number): string | null {
  if (!height || height <= 0) return null;
  const map: Array<[number, string]> = [
    [4320, "4320p (8K)"],
    [2160, "2160p (4K)"],
    [1440, "1440p"],
    [1080, "1080p"],
    [720, "720p"],
    [480, "480p"],
    [360, "360p"]
  ];
  for (const [h, label] of map) {
    if (Math.abs(height - h) <= 24) return label;
  }
  return `${height}p`;
}
