import type { Position3D } from '../viewport/workPlane';

// Provisional UI shape only; the final model contract remains undefined.
export interface StructuralNode {
  id: string;
  position: Position3D;
}
