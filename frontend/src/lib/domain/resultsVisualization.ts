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

export const getResultDisplacementMagnitudeMm = (
  entry: { uxMm?: number | undefined; uyMm?: number | undefined; uzMm?: number | undefined } | undefined,
  metric: ResultDisplayMetric = 'total',
): number => {
  if (!entry) {
    return 0;
  }

  const ux = Number.isFinite(entry.uxMm ?? Number.NaN) ? Number(entry.uxMm ?? 0) : 0;
  const uy = Number.isFinite(entry.uyMm ?? Number.NaN) ? Number(entry.uyMm ?? 0) : 0;
  const uz = Number.isFinite(entry.uzMm ?? Number.NaN) ? Number(entry.uzMm ?? 0) : 0;

  switch (metric) {
    case 'ux':
      return Math.abs(ux);
    case 'uy':
      return Math.abs(uy);
    case 'uz':
      return Math.abs(uz);
    case 'total':
    default:
      return Math.hypot(ux, uy, uz);
  }
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
