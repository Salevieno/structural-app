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

export const ANALYSIS_CONTRACT_VERSION = 1;

export const ANALYSIS_COMMANDS = {
  start: 'analysis_start',
  cancel: 'analysis_cancel',
} as const;

export const ANALYSIS_EVENTS = {
  progress: 'analysis://progress',
  completed: 'analysis://completed',
  failed: 'analysis://failed',
  cancelled: 'analysis://cancelled',
} as const;

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

export interface AnalysisAccepted {
  analysisId: string;
}

export interface AnalysisProgressEvent {
  analysisId: string;
  progress: number;
  message: string;
}

export interface AnalysisCompletedEvent {
  analysisId: string;
  completedAt: string;
}

export interface AnalysisFailedEvent {
  analysisId: string;
  code: string;
  message: string;
}

export interface AnalysisCancelledEvent {
  analysisId: string;
  cancelledAt: string;
}

export type AnalysisEvent =
  | ({ type: 'progress' } & AnalysisProgressEvent)
  | ({ type: 'completed' } & AnalysisCompletedEvent)
  | ({ type: 'failed' } & AnalysisFailedEvent)
  | ({ type: 'cancelled' } & AnalysisCancelledEvent);

export type AnalysisOutcome =
  | {
      analysisId: string;
      status: 'completed';
      completedAt: string;
      simulated: boolean;
    }
  | {
      analysisId: string;
      status: 'cancelled';
      cancelledAt: string;
      simulated: boolean;
    };

export interface AnalysisService {
  readonly implementation: 'mock' | 'tauri';
  readonly supportsCancellation: boolean;
  start(request: AnalysisRequest, onEvent: (event: AnalysisEvent) => void): Promise<AnalysisOutcome>;
  cancel(analysisId: string): Promise<void>;
}

export interface AnalysisTauriTransport {
  invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>;
}

export interface AnalysisUiState {
  analysisId: string;
  status: 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed';
  progress: number;
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
