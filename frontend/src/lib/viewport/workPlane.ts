export type WorkPlane = 'XY' | 'XZ' | 'YZ';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export const snapPositionToGrid = (
  position: Position3D,
  spacing: number,
  workPlane: WorkPlane,
): Position3D => {
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new RangeError('O espaçamento do grid deve ser um número positivo e finito.');
  }

  const snap = (coordinate: number): number => Math.round(coordinate / spacing) * spacing;

  switch (workPlane) {
    case 'XY':
      return { x: snap(position.x), y: snap(position.y), z: 0 };
    case 'XZ':
      return { x: snap(position.x), y: 0, z: snap(position.z) };
    case 'YZ':
      return { x: 0, y: snap(position.y), z: snap(position.z) };
  }
};
