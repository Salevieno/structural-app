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
  materialId?: string;
  sectionId?: string;
}

export interface StructuralMaterial {
  id: string;
  name: string;
  elasticModulusGPa: number;
  poissonRatio: number;
  shearModulusGPa: number;
}

export interface StructuralSection {
  id: string;
  name: string;
  thicknessMm: number;
}

export interface LoadComponents {
  Fx: number;
  Fy: number;
  Fz: number;
  Mx: number;
  My: number;
  Mz: number;
}

export interface DisplacementComponents {
  ux: number;
  uy: number;
  uz: number;
  tx: number;
  ty: number;
  tz: number;
}

export interface SupportConstraints {
  ux: boolean;
  uy: boolean;
  uz: boolean;
  tx: boolean;
  ty: boolean;
  tz: boolean;
}

export interface StructuralNodalLoad {
  nodeId: string;
  components: LoadComponents;
}

// Separate future contract: distributed loads act on elements, unlike nodal loads.
export interface StructuralDistributedLoad {
  elementId: string;
  components: LoadComponents;
}

export interface PrescribedNodalDisplacement {
  nodeId: string;
  components: DisplacementComponents;
}

export interface NodalSupport {
  nodeId: string;
  restraints: SupportConstraints;
}
