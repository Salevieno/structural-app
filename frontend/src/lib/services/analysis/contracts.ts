import type {
  DisplacementComponents,
  LoadComponents,
  NodalSupport,
  PrescribedNodalDisplacement,
  StructuralElement1D,
  StructuralMaterial,
  StructuralMesh2D,
  StructuralNode,
  StructuralNodalLoad,
  StructuralQuadElement2D,
  StructuralSection,
} from '../../domain/model';
import type { WorkPlane } from '../../viewport/workPlane';
import type { StructuralResultsDocument } from '../resultsImport';

export const ANALYSIS_CONTRACT_VERSION = 1;

export const ANALYSIS_COMMANDS = {
  run: 'run_analysis',
} as const;

export const BACKEND_DIAGNOSTIC_COMMAND = 'backend_diagnostic';
export const BACKEND_DIAGNOSTIC_RESPONSE = 'structural-app-backend-ready';

export interface AnalysisModelSnapshot {
  nodes: readonly StructuralNode[];
  lineElements: readonly StructuralElement1D[];
  mesh: StructuralMesh2D<StructuralQuadElement2D>;
  materials: readonly StructuralMaterial[];
  sections: readonly StructuralSection[];
  nodalLoads: readonly StructuralNodalLoad[];
  prescribedDisplacements: readonly PrescribedNodalDisplacement[];
  nodalSupports: readonly NodalSupport[];
  activeWorkPlane: WorkPlane;
}

export interface AnalysisRequest {
  contractVersion: typeof ANALYSIS_CONTRACT_VERSION;
  analysisId: string;
  model: AnalysisModelSnapshot;
}

export type AnalysisOutcome =
  {
    analysisId: string;
    status: 'completed';
    completedAt: string;
    simulated: false;
    results: StructuralResultsDocument;
  };

export interface AnalysisService {
  readonly implementation: 'tauri';
  start(request: AnalysisRequest): Promise<AnalysisOutcome>;
}

export interface AnalysisTauriTransport {
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
}

export interface AnalysisUiState {
  analysisId: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
}

export const createAnalysisRequest = (
  model: AnalysisModelSnapshot,
  analysisId: string,
): AnalysisRequest => ({
  contractVersion: ANALYSIS_CONTRACT_VERSION,
  analysisId,
  model: {
    nodes: model.nodes.map((node) => ({ ...node, position: { ...node.position } })),
    lineElements: model.lineElements.map((element) => ({ ...element, nodeIds: [...element.nodeIds] })),
    mesh: {
      ...model.mesh,
      boundaryNodeIds: [...model.mesh.boundaryNodeIds],
      generatedNodeIds: [...model.mesh.generatedNodeIds],
      elements: model.mesh.elements.map((element) => ({ ...element, nodeIds: [...element.nodeIds] })),
    },
    materials: model.materials.map((material) => ({ ...material })),
    sections: model.sections.map((section) => ({ ...section })),
    nodalLoads: model.nodalLoads.map((load) => ({
      ...load,
      components: { ...load.components } satisfies LoadComponents,
    })),
    prescribedDisplacements: model.prescribedDisplacements.map((displacement) => ({
      ...displacement,
      components: { ...displacement.components } satisfies DisplacementComponents,
      activeDofs: [...displacement.activeDofs],
    })),
    nodalSupports: model.nodalSupports.map((support) => ({
      ...support,
      restraints: { ...support.restraints },
    } satisfies NodalSupport)),
    activeWorkPlane: model.activeWorkPlane,
  },
});
