import type {
  NodalSupport,
  StructuralElement,
  StructuralMaterial,
  StructuralMesh2D,
  StructuralNode,
  StructuralNodalLoad,
  StructuralSection,
  PrescribedNodalDisplacement,
} from './model';
import { findInvalidModelAssignments } from './degreesOfFreedom';

export interface ModelReadinessIssue {
  code: string;
  message: string;
}

export interface ModelReadiness {
  ready: boolean;
  issues: ModelReadinessIssue[];
}

export interface ModelReadinessInput {
  nodes: readonly StructuralNode[];
  elements: readonly StructuralElement[];
  materials: readonly StructuralMaterial[];
  sections: readonly StructuralSection[];
  supports: readonly NodalSupport[];
  loads: readonly StructuralNodalLoad[];
  displacements: readonly PrescribedNodalDisplacement[];
  mesh: StructuralMesh2D | undefined;
  meshIsCurrent: boolean;
}

export const validateModelReadiness = ({
  nodes,
  elements,
  materials,
  sections,
  supports,
  loads,
  displacements,
  mesh,
  meshIsCurrent,
}: ModelReadinessInput): ModelReadiness => {
  const issues: ModelReadinessIssue[] = [];

  if (nodes.length === 0) {
    issues.push({ code: 'nodes-missing', message: 'Adicione pelo menos um nó.' });
  }

  if (elements.length === 0) {
    issues.push({ code: 'elements-missing', message: 'Adicione pelo menos um elemento.' });
  }

  if (!meshIsCurrent) {
    issues.push({
      code: 'mesh-missing',
      message: 'Gere ou atualize a malha para o contorno, plano e espaçamento atuais.',
    });
  }

  const materialIds = new Set(materials.map((material) => material.id));
  const sectionIds = new Set(sections.map((section) => section.id));

  for (const element of elements) {
    if (!element.materialId || !materialIds.has(element.materialId)) {
      issues.push({
        code: 'element-material-missing',
        message: `Atribua um material válido ao elemento ${element.id}.`,
      });
    }
    if (!element.sectionId || !sectionIds.has(element.sectionId)) {
      issues.push({
        code: 'element-section-missing',
        message: `Atribua uma seção válida ao elemento ${element.id}.`,
      });
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  if (!supports.some((support) => nodeIds.has(support.nodeId))) {
    issues.push({
      code: 'support-missing',
      message: 'Aplique pelo menos um apoio a um nó existente.',
    });
  }

  if (meshIsCurrent && mesh) {
    for (const assignment of findInvalidModelAssignments(
      loads,
      displacements,
      supports,
      mesh.elements,
      mesh.workPlane,
    )) {
      issues.push({
        code: 'invalid-degree-of-freedom',
        message: `Atribuição inválida: ${assignment}.`,
      });
    }
  }

  return { ready: issues.length === 0, issues };
};
