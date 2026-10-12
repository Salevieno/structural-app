import type {
  DisplacementComponents,
  LoadComponents,
  NodalSupport,
  StructuralMesh2D,
} from './model.ts';
import { describeLoadDof } from './cartesianMesh.ts';

export type DegreeOfFreedom = keyof DisplacementComponents;

const planeDofs: Record<StructuralMesh2D['workPlane'], readonly DegreeOfFreedom[]> = {
  XY: ['ux', 'uy'],
  XZ: ['ux', 'uz'],
  YZ: ['uy', 'uz'],
};

export const getNodeAvailableDegreesOfFreedom = (
  nodeId: string,
  meshElements: StructuralMesh2D['elements'],
  workPlane: StructuralMesh2D['workPlane'] | undefined,
): ReadonlySet<DegreeOfFreedom> => {
  if (!workPlane) {
    return new Set();
  }
  const connectedToMesh = meshElements.some(({ nodeIds }) => nodeIds.includes(nodeId));
  return connectedToMesh ? new Set(planeDofs[workPlane]) : new Set();
};

export const findInvalidNodeDegreesOfFreedom = (
  nodeId: string,
  requestedDofs: readonly string[],
  meshElements: StructuralMesh2D['elements'],
  workPlane: StructuralMesh2D['workPlane'] | undefined,
): string[] => {
  const availableDofs: ReadonlySet<string> = getNodeAvailableDegreesOfFreedom(
    nodeId,
    meshElements,
    workPlane,
  );
  return [...new Set(requestedDofs)].filter((dof) => !availableDofs.has(dof));
};

export const validateLoadDegreesOfFreedom = (
  nodeId: string,
  components: LoadComponents,
  meshElements: StructuralMesh2D['elements'],
  workPlane: StructuralMesh2D['workPlane'] | undefined,
): string[] =>
  findInvalidNodeDegreesOfFreedom(
    nodeId,
    describeLoadDof(components),
    meshElements,
    workPlane,
  );

export const validateDisplacementDegreesOfFreedom = (
  nodeId: string,
  activeDofs: readonly DegreeOfFreedom[],
  meshElements: StructuralMesh2D['elements'],
  workPlane: StructuralMesh2D['workPlane'] | undefined,
): string[] =>
  findInvalidNodeDegreesOfFreedom(
    nodeId,
    activeDofs,
    meshElements,
    workPlane,
  );

export const validateSupportDegreesOfFreedom = (
  support: NodalSupport,
  meshElements: StructuralMesh2D['elements'],
  workPlane: StructuralMesh2D['workPlane'] | undefined,
): string[] =>
  findInvalidNodeDegreesOfFreedom(
    support.nodeId,
    (Object.keys(support.restraints) as DegreeOfFreedom[]).filter((dof) => support.restraints[dof]),
    meshElements,
    workPlane,
  );

export const formatInvalidDegreesOfFreedom = (dofs: readonly string[]): string =>
  `GDL inválido(s) para este nó/plano: ${dofs.join(', ')}. GDL disponíveis no nó: translações do plano dos elementos 2D conectados.`;

export const findInvalidModelAssignments = (
  loads: readonly { nodeId: string; components: LoadComponents }[],
  displacements: readonly {
    nodeId: string;
    components: DisplacementComponents;
    activeDofs: readonly DegreeOfFreedom[];
  }[],
  supports: readonly NodalSupport[],
  meshElements: StructuralMesh2D['elements'],
  workPlane: StructuralMesh2D['workPlane'] | undefined,
): string[] => {
  const issues: string[] = [];
  for (const load of loads) {
    const invalid = validateLoadDegreesOfFreedom(load.nodeId, load.components, meshElements, workPlane);
    if (invalid.length > 0) issues.push(`carga concentrada em ${load.nodeId}: ${invalid.join(', ')}`);
  }
  for (const displacement of displacements) {
    const invalid = validateDisplacementDegreesOfFreedom(
      displacement.nodeId,
      displacement.activeDofs,
      meshElements,
      workPlane,
    );
    if (invalid.length > 0) issues.push(`deslocamento prescrito em ${displacement.nodeId}: ${invalid.join(', ')}`);
  }
  for (const support of supports) {
    const invalid = validateSupportDegreesOfFreedom(support, meshElements, workPlane);
    if (invalid.length > 0) issues.push(`apoio em ${support.nodeId}: ${invalid.join(', ')}`);
  }
  return issues;
};
