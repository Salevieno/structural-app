import type { StructuralNode } from './model';

export interface ResultsNodeDisplacement {
  nodeId: string;
  position?: { x: number; y: number; z: number };
  displacement?: {
    uxMm?: number;
    uyMm?: number;
    uzMm?: number;
    txRad?: number;
    tyRad?: number;
    tzRad?: number;
  };
  uxMm?: number;
  uyMm?: number;
  uzMm?: number;
  txRad?: number;
  tyRad?: number;
  tzRad?: number;
}

export interface ResultDisplayNode {
  id: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
}

export type ResultDisplayMetric = 'total' | 'ux' | 'uy' | 'uz';

type ResultMagnitudeSource = {
  uxMm?: number | undefined;
  uyMm?: number | undefined;
  uzMm?: number | undefined;
};

const toNumeric = (value: number | undefined): number => (
  Number.isFinite(value ?? Number.NaN) ? Number(value ?? 0) : 0
);

const normalizeDisplacementEntry = (
  entry: ResultMagnitudeSource | undefined,
): ResultMagnitudeSource => ({
  uxMm: toNumeric(entry?.uxMm),
  uyMm: toNumeric(entry?.uyMm),
  uzMm: toNumeric(entry?.uzMm),
});

export const getResultDisplacementMagnitudeMm = (
  entry: ResultMagnitudeSource | undefined,
  metric: ResultDisplayMetric = 'total',
): number => {
  const uxMm = toNumeric(entry?.uxMm);
  const uyMm = toNumeric(entry?.uyMm);
  const uzMm = toNumeric(entry?.uzMm);

  switch (metric) {
    case 'ux':
      return Math.abs(uxMm);
    case 'uy':
      return Math.abs(uyMm);
    case 'uz':
      return Math.abs(uzMm);
    case 'total':
    default:
      return Math.hypot(uxMm, uyMm, uzMm);
  }
};

const hexToRgb = (hex: number): [number, number, number] => {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return [r, g, b];
};

const interpolateChannel = (start: number, end: number, ratio: number): number => {
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  return Math.round(start + (end - start) * clampedRatio);
};

const rgbToHex = (r: number, g: number, b: number): number => (r << 16) + (g << 8) + b;

export const getResultColorHexAtRatio = (ratio: number): number => {
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  const stops: Array<{ stop: number; color: number }> = [
    { stop: 0, color: 0x2563eb },
    { stop: 0.35, color: 0x38bdf8 },
    { stop: 0.65, color: 0x22c55e },
    { stop: 1, color: 0x84cc16 },
  ];

  const firstStop = stops[0];
  if (!firstStop) {
    return 0;
  }

  if (clampedRatio <= firstStop.stop) {
    return firstStop.color;
  }

  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index]!;
    const end = stops[index + 1]!;

    if (clampedRatio >= start.stop && clampedRatio <= end.stop) {
      const span = end.stop - start.stop || 1;
      const localRatio = (clampedRatio - start.stop) / span;
      const startRgb = hexToRgb(start.color);
      const endRgb = hexToRgb(end.color);
      return rgbToHex(
        interpolateChannel(startRgb[0], endRgb[0], localRatio),
        interpolateChannel(startRgb[1], endRgb[1], localRatio),
        interpolateChannel(startRgb[2], endRgb[2], localRatio),
      );
    }
  }

  const lastStop = stops[stops.length - 1];
  return lastStop?.color ?? 0;
};

export const getResultColorHex = (magnitude: number, maxMagnitude: number): number => {
  const safeMax = Number.isFinite(maxMagnitude) && maxMagnitude > 0 ? maxMagnitude : 1;
  const safeMagnitude = Number.isFinite(magnitude) ? magnitude : 0;
  const ratio = Math.min(1, Math.max(0, safeMagnitude / safeMax));
  return getResultColorHexAtRatio(ratio);
};

export const getResultColorScaleGradientCss = (): string => {
  const stops = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => `${'#' + getResultColorHexAtRatio(ratio).toString(16).padStart(6, '0')} ${ratio * 100}%`)
    .join(', ');

  return `linear-gradient(to right, ${stops})`;
};

export const getResultMetricMaximum = (
  results: {
    displacements?: Array<ResultMagnitudeSource & { nodeId?: string }>;
    nodes?: Array<{
      nodeId?: string;
      uxMm?: number | undefined;
      uyMm?: number | undefined;
      uzMm?: number | undefined;
      displacement?: ResultMagnitudeSource;
    }>;
  } | undefined,
  metric: ResultDisplayMetric = 'total',
): number => {
  if (!results) {
    return 1;
  }

  const candidates: number[] = [];

  for (const entry of [...(results.displacements ?? []), ...(results.nodes ?? [])]) {
    const rawEntry = entry as Record<string, unknown>;
    const displacementEntry = rawEntry.displacement && typeof rawEntry.displacement === 'object'
      ? rawEntry.displacement as Record<string, unknown>
      : undefined;

    const displacement: ResultMagnitudeSource = {
      uxMm: typeof rawEntry.uxMm === 'number'
        ? rawEntry.uxMm
        : typeof displacementEntry?.uxMm === 'number'
          ? displacementEntry.uxMm
          : undefined,
      uyMm: typeof rawEntry.uyMm === 'number'
        ? rawEntry.uyMm
        : typeof displacementEntry?.uyMm === 'number'
          ? displacementEntry.uyMm
          : undefined,
      uzMm: typeof rawEntry.uzMm === 'number'
        ? rawEntry.uzMm
        : typeof displacementEntry?.uzMm === 'number'
          ? displacementEntry.uzMm
          : undefined,
    };

    candidates.push(getResultDisplacementMagnitudeMm(displacement, metric));
  }

  return candidates.length > 0 ? Math.max(...candidates, 1) : 1;
};

export const resolveResultDisplayScale = (maxDisplacementMm?: number): number => {
  if (!Number.isFinite(maxDisplacementMm) || maxDisplacementMm === undefined || maxDisplacementMm <= 0) {
    return 1;
  }

  if (maxDisplacementMm >= 10) {
    return 0.5;
  }

  if (maxDisplacementMm >= 5) {
    return 1;
  }

  if (maxDisplacementMm >= 1) {
    return 2.5;
  }

  return 10;
};

const asPosition = (entry: ResultsNodeDisplacement | undefined): { x: number; y: number; z: number } | undefined => {
  if (!entry) {
    return undefined;
  }

  if (entry.position && typeof entry.position.x === 'number' && typeof entry.position.y === 'number' && typeof entry.position.z === 'number') {
    return { x: entry.position.x, y: entry.position.y, z: entry.position.z };
  }

  return undefined;
};

export const buildDeformedNodePositions = (
  nodes: StructuralNode[],
  results: ResultsNodeDisplacement[] | undefined,
  scale = 1,
  displacements: ResultsNodeDisplacement[] | undefined = undefined,
): ResultDisplayNode[] => {
  if (!results || results.length === 0) {
    const resultMap = new Map((displacements ?? []).map((entry) => [entry.nodeId, entry]));
    return nodes.map((node) => {
      const displacement = resultMap.get(node.id);
      const ux = Number.isFinite(displacement?.uxMm) ? Number(displacement?.uxMm) : 0;
      const uy = Number.isFinite(displacement?.uyMm) ? Number(displacement?.uyMm) : 0;
      const uz = Number.isFinite(displacement?.uzMm) ? Number(displacement?.uzMm) : 0;
      return {
        id: node.id,
        position: {
          x: node.position.x + ux * scale,
          y: node.position.y + uy * scale,
          z: node.position.z + uz * scale,
        },
      };
    });
  }

  const resultMap = new Map(results.map((entry) => [entry.nodeId, entry]));

  if (nodes.length === 0) {
    return results.map((entry, index) => {
      const position = asPosition(entry);
      if (position) {
        return { id: entry.nodeId, position };
      }

      const angle = (index / Math.max(results.length, 1)) * Math.PI * 2;
      const radius = 3 + index * 0.65;
      return {
        id: entry.nodeId,
        position: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          z: (index % 2 === 0 ? 1 : -1) * 0.65,
        },
      };
    });
  }

  return nodes.map((node) => {
    const resultNode = resultMap.get(node.id);
    const position = asPosition(resultNode);
    if (position) {
      return { id: node.id, position };
    }

    const displacement = resultNode ?? (displacements ?? []).find((entry) => entry.nodeId === node.id);
    const ux = Number.isFinite(displacement?.uxMm) ? Number(displacement?.uxMm) : 0;
    const uy = Number.isFinite(displacement?.uyMm) ? Number(displacement?.uyMm) : 0;
    const uz = Number.isFinite(displacement?.uzMm) ? Number(displacement?.uzMm) : 0;

    return {
      id: node.id,
      position: {
        x: node.position.x + ux * scale,
        y: node.position.y + uy * scale,
        z: node.position.z + uz * scale,
      },
    };
  });
};
