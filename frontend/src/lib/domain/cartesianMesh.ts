import type {
  DisplacementComponents,
  LoadComponents,
  NodalSupport,
  PrescribedNodalDisplacement,
  StructuralElement1D,
  StructuralMesh2D,
  StructuralNode,
  StructuralNodalLoad,
  StructuralQuadElement2D,
} from './model.ts';
import { type Position3D, type WorkPlane } from '../viewport/workPlane.ts';

interface Point2D {
  x: number;
  y: number;
}

export interface MeshGenerationResult {
  mesh: StructuralMesh2D;
  generatedNodes: StructuralNode[];
  omittedRegionDetected: boolean;
}

export type MeshGenerationErrorCode =
  | 'invalid-size'
  | 'insufficient-nodes'
  | 'non-planar-contour'
  | 'invalid-polygon'
  | 'zero-elements';

export class MeshGenerationError extends Error {
  public readonly code: MeshGenerationErrorCode;

  constructor(
    code: MeshGenerationErrorCode,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'MeshGenerationError';
  }
}

export interface MeshRegenerationDependencies {
  lineElements: readonly StructuralElement1D[];
  loads: readonly StructuralNodalLoad[];
  displacements: readonly PrescribedNodalDisplacement[];
  supports: readonly NodalSupport[];
}

export interface MeshRegenerationImpact {
  removedNodeIds: string[];
  removedElementIds: string[];
  dependencies: string[];
}

const coordinateKey = (value: number): string => {
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized.toPrecision(15);
};

const cellCountForExtent = (extent: number, cellSize: number): number => {
  const count = extent / cellSize;
  const roundingAllowance = Number.EPSILON * Math.max(1, Math.abs(count)) * 16;
  return Math.floor(count + roundingAllowance);
};

const pointKey = ({ x, y }: Point2D): string => `${coordinateKey(x)},${coordinateKey(y)}`;

const toPoint = (position: Position3D, plane: WorkPlane): Point2D => {
  switch (plane) {
    case 'XY':
      return { x: position.x, y: position.y };
    case 'XZ':
      return { x: position.x, y: position.z };
    case 'YZ':
      return { x: position.y, y: position.z };
  }
};

const toPosition = (point: Point2D, plane: WorkPlane): Position3D => {
  switch (plane) {
    case 'XY':
      return { x: point.x, y: point.y, z: 0 };
    case 'XZ':
      return { x: point.x, y: 0, z: point.y };
    case 'YZ':
      return { x: 0, y: point.x, z: point.y };
  }
};

const cross = (a: Point2D, b: Point2D, c: Point2D): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const signedArea = (points: readonly Point2D[]): number => {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current && next) {
      area += current.x * next.y - next.x * current.y;
    }
  }
  return area / 2;
};

const pointsEqual = (a: Point2D, b: Point2D): boolean => a.x === b.x && a.y === b.y;

const pointOnSegment = (point: Point2D, start: Point2D, end: Point2D): boolean =>
  cross(start, end, point) === 0 &&
  point.x >= Math.min(start.x, end.x) &&
  point.x <= Math.max(start.x, end.x) &&
  point.y >= Math.min(start.y, end.y) &&
  point.y <= Math.max(start.y, end.y);

const segmentsIntersect = (a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean => {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
      ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) {
    return true;
  }
  return (
    (abC === 0 && pointOnSegment(c, a, b)) ||
    (abD === 0 && pointOnSegment(d, a, b)) ||
    (cdA === 0 && pointOnSegment(a, c, d)) ||
    (cdB === 0 && pointOnSegment(b, c, d))
  );
};

const isSimplePolygon = (points: readonly Point2D[]): boolean => {
  for (let first = 0; first < points.length; first += 1) {
    const a = points[first];
    const b = points[(first + 1) % points.length];
    if (!a || !b || pointsEqual(a, b)) {
      return false;
    }
    const previous = points[(first + points.length - 1) % points.length];
    const current = points[first];
    const next = points[(first + 1) % points.length];
    if (previous && current && next && cross(previous, current, next) === 0) {
      const firstRay = { x: previous.x - current.x, y: previous.y - current.y };
      const secondRay = { x: next.x - current.x, y: next.y - current.y };
      if (firstRay.x * secondRay.x + firstRay.y * secondRay.y > 0) {
        return false;
      }
    }
    for (let second = first + 1; second < points.length; second += 1) {
      const adjacent =
        second === first + 1 || (first === 0 && second === points.length - 1);
      if (adjacent) {
        continue;
      }
      const c = points[second];
      const d = points[(second + 1) % points.length];
      if (c && d && segmentsIntersect(a, b, c, d)) {
        return false;
      }
    }
  }
  return true;
};

const pointInPolygon = (point: Point2D, polygon: readonly Point2D[]): boolean => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) {
      continue;
    }
    if (pointOnSegment(point, previousPoint, currentPoint)) {
      return true;
    }
    const crossesRay =
      (currentPoint.y > point.y) !== (previousPoint.y > point.y) &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crossesRay) {
      inside = !inside;
    }
  }
  return inside;
};

const strictlyInsideCell = (point: Point2D, minX: number, minY: number, maxX: number, maxY: number): boolean =>
  point.x > minX && point.x < maxX && point.y > minY && point.y < maxY;

const isCellFullyContained = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  polygon: readonly Point2D[],
): boolean => {
  const corners: Point2D[] = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  if (!corners.every((corner) => pointInPolygon(corner, polygon)) || !pointInPolygon(center, polygon)) {
    return false;
  }

  for (const point of polygon) {
    if (strictlyInsideCell(point, minX, minY, maxX, maxY)) {
      return false;
    }
  }

  for (let cellEdge = 0; cellEdge < corners.length; cellEdge += 1) {
    const start = corners[cellEdge];
    const end = corners[(cellEdge + 1) % corners.length];
    if (!start || !end) {
      continue;
    }
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    if (!pointInPolygon(midpoint, polygon)) {
      return false;
    }
    for (let polygonEdge = 0; polygonEdge < polygon.length; polygonEdge += 1) {
      const polygonStart = polygon[polygonEdge];
      const polygonEnd = polygon[(polygonEdge + 1) % polygon.length];
      if (!polygonStart || !polygonEnd) {
        continue;
      }
      if (!segmentsIntersect(start, end, polygonStart, polygonEnd)) {
        continue;
      }
      const sharedBoundaryLine =
        cross(start, end, polygonStart) === 0 && cross(start, end, polygonEnd) === 0;
      const crossingIsSharedBoundary =
        sharedBoundaryLine ||
        pointOnSegment(start, polygonStart, polygonEnd) ||
        pointOnSegment(end, polygonStart, polygonEnd) ||
        pointOnSegment(polygonStart, start, end) ||
        pointOnSegment(polygonEnd, start, end);
      if (!crossingIsSharedBoundary) {
        return false;
      }
    }
  }
  return true;
};

const hasConstantNormalCoordinate = (nodes: readonly StructuralNode[], plane: WorkPlane): boolean => {
  const normal = (node: StructuralNode): number => {
    switch (plane) {
      case 'XY':
        return node.position.z;
      case 'XZ':
        return node.position.y;
      case 'YZ':
        return node.position.x;
    }
  };
  const firstNode = nodes[0];
  return !!firstNode && nodes.every((node) => normal(node) === normal(firstNode));
};

const lowerLeftIndex = (points: readonly Point2D[]): number => {
  let candidate = 0;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const current = points[candidate];
    if (point && current && (point.y < current.y || (point.y === current.y && point.x < current.x))) {
      candidate = index;
    }
  }
  return candidate;
};

const isConvexPolygon = (points: readonly Point2D[]): boolean => {
  let direction = 0;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index + points.length - 1) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!previous || !current || !next) {
      return false;
    }
    const turn = Math.sign(cross(previous, current, next));
    if (turn === 0) {
      continue;
    }
    if (direction !== 0 && turn !== direction) {
      return false;
    }
    direction = turn;
  }
  return direction !== 0;
};

const orderContourNodes = (
  contourNodes: readonly StructuralNode[],
  workPlane: WorkPlane,
): StructuralNode[] => {
  if (contourNodes.length < 3) {
    throw new MeshGenerationError('insufficient-nodes', 'Crie pelo menos três nós para definir o contorno.');
  }
  if (
    contourNodes.some(
      ({ position }) =>
        !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z),
    )
  ) {
    throw new MeshGenerationError('invalid-polygon', 'Todos os nós do contorno devem ter coordenadas finitas.');
  }
  if (!hasConstantNormalCoordinate(contourNodes, workPlane)) {
    throw new MeshGenerationError('non-planar-contour', `Todos os nós do contorno devem estar no mesmo plano ${workPlane}.`);
  }

  const projectedNodes = contourNodes.map((node) => ({
    node,
    point: toPoint(node.position, workPlane),
  }));
  const centroid = projectedNodes.reduce(
    (result, { point }) => ({ x: result.x + point.x / projectedNodes.length, y: result.y + point.y / projectedNodes.length }),
    { x: 0, y: 0 },
  );
  projectedNodes.sort((first, second) => {
    const firstAngle = Math.atan2(first.point.y - centroid.y, first.point.x - centroid.x);
    const secondAngle = Math.atan2(second.point.y - centroid.y, second.point.x - centroid.x);
    return firstAngle - secondAngle;
  });

  let orderedNodes = projectedNodes.map(({ node }) => node);
  let polygon = orderedNodes.map((node) => toPoint(node.position, workPlane));
  if (!isSimplePolygon(polygon) || signedArea(polygon) === 0) {
    throw new MeshGenerationError(
      'invalid-polygon',
      'Não foi possível reconstruir um contorno simples pela posição dos nós.',
    );
  }
  if (!isConvexPolygon(polygon)) {
    throw new MeshGenerationError(
      'invalid-polygon',
      'A ordenação automática atual aceita apenas contornos convexos; contornos côncavos ainda não podem gerar malha.',
    );
  }
  if (signedArea(polygon) < 0) {
    orderedNodes = [...orderedNodes].reverse();
    polygon = [...polygon].reverse();
  }
  const startIndex = lowerLeftIndex(polygon);
  return [...orderedNodes.slice(startIndex), ...orderedNodes.slice(0, startIndex)];
};

interface GridBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  columns: number;
  rows: number;
  hasFullWidth: boolean;
  hasFullHeight: boolean;
}

const getGridBounds = (polygon: readonly Point2D[], cellSize: number): GridBounds => {
  const minX = Math.min(...polygon.map(({ x }) => x));
  const minY = Math.min(...polygon.map(({ y }) => y));
  const maxX = Math.max(...polygon.map(({ x }) => x));
  const maxY = Math.max(...polygon.map(({ y }) => y));
  const extentX = maxX - minX;
  const extentY = maxY - minY;
  const columns = cellCountForExtent(extentX, cellSize);
  const rows = cellCountForExtent(extentY, cellSize);
  const hasFullWidth = Math.abs(columns * cellSize - extentX) <=
    Number.EPSILON * Math.max(1, Math.abs(extentX)) * 16;
  const hasFullHeight = Math.abs(rows * cellSize - extentY) <=
    Number.EPSILON * Math.max(1, Math.abs(extentY)) * 16;
  return { minX, minY, maxX, maxY, columns, rows, hasFullWidth, hasFullHeight };
};

const cellAt = (column: number, row: number, bounds: GridBounds, cellSize: number) => {
  const left = bounds.minX + column * cellSize;
  const bottom = bounds.minY + row * cellSize;
  const right =
    bounds.hasFullWidth && column === bounds.columns - 1 ? bounds.maxX : left + cellSize;
  const top =
    bounds.hasFullHeight && row === bounds.rows - 1 ? bounds.maxY : bottom + cellSize;
  return { left, bottom, right, top };
};

export const getMeshGenerationBlockReason = (
  contourNodes: readonly StructuralNode[],
  cellSize: number,
  workPlane: WorkPlane,
): string | undefined => {
  try {
    if (!Number.isFinite(cellSize) || cellSize <= 0) {
      throw new MeshGenerationError('invalid-size', 'Defina um espaçamento de grid positivo.');
    }
    const orderedNodes = orderContourNodes(contourNodes, workPlane);
    const polygon = orderedNodes.map((node) => toPoint(node.position, workPlane));
    const bounds = getGridBounds(polygon, cellSize);
    for (let column = 0; column < bounds.columns; column += 1) {
      for (let row = 0; row < bounds.rows; row += 1) {
        const cell = cellAt(column, row, bounds, cellSize);
        if (isCellFullyContained(cell.left, cell.bottom, cell.right, cell.top, polygon)) {
          return undefined;
        }
      }
    }
    throw new MeshGenerationError(
      'zero-elements',
      'Nenhuma célula inteira cabe no contorno. Reduza o espaçamento do grid ou revise os nós.',
    );
  } catch (error) {
    if (error instanceof MeshGenerationError) {
      return error.message;
    }
    throw error;
  }
};

export const generateCartesianQuadMesh = (
  contourNodes: readonly StructuralNode[],
  cellSize: number,
  workPlane: WorkPlane,
): MeshGenerationResult => {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new MeshGenerationError('invalid-size', 'O tamanho da célula deve ser positivo e finito.');
  }
  const orderedContourNodes = orderContourNodes(contourNodes, workPlane);
  const polygon = orderedContourNodes.map((node) => toPoint(node.position, workPlane));
  const bounds = getGridBounds(polygon, cellSize);
  const polygonArea = Math.abs(signedArea(polygon));
  const userNodesByPoint = new Map(polygon.map((point, index) => [pointKey(point), orderedContourNodes[index]]));
  const generatedNodesByPoint = new Map<string, StructuralNode>();
  const meshElements: StructuralQuadElement2D[] = [];
  let meshedArea = 0;

  const findOrCreateNode = (point: Point2D): StructuralNode => {
    const key = pointKey(point);
    const userNode = userNodesByPoint.get(key);
    if (userNode) {
      return userNode;
    }
    const existing = generatedNodesByPoint.get(key);
    if (existing) {
      return existing;
    }
    const node: StructuralNode = {
      id: `mesh-node:${workPlane}:${key}`,
      position: toPosition(point, workPlane),
      origin: 'mesh',
    };
    generatedNodesByPoint.set(key, node);
    return node;
  };

  for (let column = 0; column < bounds.columns; column += 1) {
    for (let row = 0; row < bounds.rows; row += 1) {
      const cell = cellAt(column, row, bounds, cellSize);
      if (!isCellFullyContained(cell.left, cell.bottom, cell.right, cell.top, polygon)) {
        continue;
      }
      const bottomLeft = findOrCreateNode({ x: cell.left, y: cell.bottom });
      const bottomRight = findOrCreateNode({ x: cell.right, y: cell.bottom });
      const topRight = findOrCreateNode({ x: cell.right, y: cell.top });
      const topLeft = findOrCreateNode({ x: cell.left, y: cell.top });
      meshElements.push({
        type: 'quad4',
        id: `mesh-quad:${workPlane}:${pointKey({ x: cell.left, y: cell.bottom })}:${pointKey({ x: cell.right, y: cell.top })}`,
        nodeIds: [bottomLeft.id, bottomRight.id, topRight.id, topLeft.id],
      });
      meshedArea += cellSize * cellSize;
    }
  }

  if (meshElements.length === 0) {
    throw new MeshGenerationError(
      'zero-elements',
      'Nenhum quadrilátero pôde ser gerado; reduza o tamanho da célula ou revise o contorno.',
    );
  }

  const omittedArea = Math.max(0, polygonArea - meshedArea);
  const mesh: StructuralMesh2D = {
    id: `mesh:${workPlane}:${coordinateKey(cellSize)}:${orderedContourNodes.map(({ id }) => id).join('|')}`,
    workPlane,
    cellSize,
    boundaryNodeIds: orderedContourNodes.map(({ id }) => id),
    generatedNodeIds: [...generatedNodesByPoint.values()].map(({ id }) => id),
    elements: meshElements,
    polygonArea,
    meshedArea,
    omittedArea,
  };
  return {
    mesh,
    generatedNodes: [...generatedNodesByPoint.values()],
    omittedRegionDetected: omittedArea > Number.EPSILON * Math.max(1, polygonArea) * 32,
  };
};

export const isMeshCurrent = (
  mesh: StructuralMesh2D | undefined,
  contourNodes: readonly StructuralNode[],
  cellSize: number,
  workPlane: WorkPlane,
): boolean => {
  if (!mesh || mesh.workPlane !== workPlane || mesh.cellSize !== cellSize) {
    return false;
  }
  try {
    const orderedContourNodes = orderContourNodes(contourNodes, workPlane);
    return (
      mesh.boundaryNodeIds.length === orderedContourNodes.length &&
      mesh.boundaryNodeIds.every((id, index) => orderedContourNodes[index]?.id === id)
    );
  } catch (error) {
    if (error instanceof MeshGenerationError) {
      return false;
    }
    throw error;
  }
};

export const findMeshRegenerationImpact = (
  currentMesh: StructuralMesh2D | undefined,
  nextMesh: StructuralMesh2D,
  dependencies: MeshRegenerationDependencies,
): MeshRegenerationImpact => {
  const nextNodeIds = new Set(nextMesh.generatedNodeIds);
  const nextElementIds = new Set(nextMesh.elements.map(({ id }) => id));
  const removedNodeIds = (currentMesh?.generatedNodeIds ?? []).filter((id) => !nextNodeIds.has(id));
  const removedElementIds = (currentMesh?.elements ?? [])
    .filter(({ id }) => !nextElementIds.has(id))
    .map(({ id }) => id);
  const removedNodes = new Set(removedNodeIds);
  const removedElements = new Set(removedElementIds);
  const issues: string[] = [];

  for (const element of dependencies.lineElements) {
    if (element.nodeIds.some((nodeId) => removedNodes.has(nodeId))) {
      issues.push(`elemento 1D ${element.id}`);
    }
  }
  for (const load of dependencies.loads) {
    if (removedNodes.has(load.nodeId)) issues.push(`carga concentrada em ${load.nodeId}`);
  }
  for (const displacement of dependencies.displacements) {
    if (removedNodes.has(displacement.nodeId)) issues.push(`deslocamento prescrito em ${displacement.nodeId}`);
  }
  for (const support of dependencies.supports) {
    if (removedNodes.has(support.nodeId)) issues.push(`apoio em ${support.nodeId}`);
  }
  for (const element of currentMesh?.elements ?? []) {
    if (removedElements.has(element.id) && (element.materialId || element.sectionId)) {
      issues.push(`atribuições do elemento 2D ${element.id}`);
    }
  }

  return { removedNodeIds, removedElementIds, dependencies: issues };
};

export const describeLoadDof = (components: LoadComponents): string[] => {
  const componentToDof: Record<keyof LoadComponents, string> = {
    Fx: 'ux',
    Fy: 'uy',
    Fz: 'uz',
    Mx: 'tx',
    My: 'ty',
    Mz: 'tz',
  };
  return (Object.keys(components) as Array<keyof LoadComponents>)
    .filter((component) => components[component] !== 0)
    .map((component) => componentToDof[component]);
};
