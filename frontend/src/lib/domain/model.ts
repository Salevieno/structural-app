import type { Position3D } from '../viewport/workPlane';

// Provisional UI shape only; the final model contract remains undefined.
export interface StructuralNode {
  id: string;
  position: Position3D;
}

// Provisional visual connection only; this does not define a finite element.
export interface StructuralElement {
  id: string;
  nodeIds: readonly [string, string];
}
