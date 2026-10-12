<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { logger, type LogEntry, type LogLevel } from './lib/logging';
  import type {
    DisplacementComponents,
    LoadComponents,
    NodalSupport,
    PrescribedNodalDisplacement,
    StructuralElement1D,
    StructuralMaterial,
    StructuralNode,
    StructuralNodalLoad,
    StructuralQuadElement2D,
    StructuralSection,
    StructuralMesh2D,
    SupportConstraints,
  } from './lib/domain/model';
  import {
    findMeshRegenerationImpact,
    getMeshGenerationBlockReason,
    generateCartesianQuadMesh,
    isMeshCurrent,
    MeshGenerationError,
  } from './lib/domain/cartesianMesh';
  import {
    formatInvalidDegreesOfFreedom,
    findInvalidModelAssignments,
    validateDisplacementDegreesOfFreedom,
    validateLoadDegreesOfFreedom,
    validateSupportDegreesOfFreedom,
  } from './lib/domain/degreesOfFreedom';
  import { validateModelReadiness } from './lib/domain/modelReadiness';
  import {
    createAnalysisRequest,
    createDefaultAnalysisService,
    createMockAnalysisService,
    type AnalysisEvent,
    type AnalysisService,
    type AnalysisUiState,
  } from './lib/services/analysis';
  import SceneViewport from './lib/viewport/SceneViewport.svelte';
  import type { CameraView } from './lib/viewport/types';
  import type { Position3D, WorkPlane } from './lib/viewport/workPlane';

  type ToolType =
    | 'select'
    | 'nodes'
    | 'elements'
    | 'mesh'
    | 'materials'
    | 'sections'
    | 'loads'
    | 'supports';
  type LogFilter = LogLevel | 'all';
  type LoadKey = keyof LoadComponents;
  type DisplacementKey = keyof DisplacementComponents;
  type NumericInput = number | string | undefined;
  type LoadDraft = Record<LoadKey, NumericInput>;
  type DisplacementDraft = Record<DisplacementKey, NumericInput>;
  type ActiveDisplacementDofs = Record<DisplacementKey, boolean>;

  const loadFields: Array<{ key: LoadKey; label: LoadKey; unit: string }> = [
    { key: 'Fx', label: 'Fx', unit: 'kN' },
    { key: 'Fy', label: 'Fy', unit: 'kN' },
    { key: 'Fz', label: 'Fz', unit: 'kN' },
    { key: 'Mx', label: 'Mx', unit: 'kNm' },
    { key: 'My', label: 'My', unit: 'kNm' },
    { key: 'Mz', label: 'Mz', unit: 'kNm' },
  ];

  const displacementFields: Array<{ key: DisplacementKey; label: DisplacementKey; unit: string }> = [
    { key: 'ux', label: 'ux', unit: 'mm' },
    { key: 'uy', label: 'uy', unit: 'mm' },
    { key: 'uz', label: 'uz', unit: 'mm' },
    { key: 'tx', label: 'tx', unit: 'rad' },
    { key: 'ty', label: 'ty', unit: 'rad' },
    { key: 'tz', label: 'tz', unit: 'rad' },
  ];

  const supportPresets: Array<{ id: string; label: string; restraints: SupportConstraints }> = [
    { id: 'ux', label: 'Apenas ux', restraints: { ux: true, uy: false, uz: false, tx: false, ty: false, tz: false } },
    { id: 'uy', label: 'Apenas uy', restraints: { ux: false, uy: true, uz: false, tx: false, ty: false, tz: false } },
    { id: 'uz', label: 'Apenas uz', restraints: { ux: false, uy: false, uz: true, tx: false, ty: false, tz: false } },
    { id: 'translations', label: 'ux, uy e uz', restraints: { ux: true, uy: true, uz: true, tx: false, ty: false, tz: false } },
    { id: 'all', label: 'Todos os 6', restraints: { ux: true, uy: true, uz: true, tx: true, ty: true, tz: true } },
  ];

  const tools: Array<{ id: ToolType; label: string }> = [
    { id: 'select', label: 'Seleção' },
    { id: 'nodes', label: 'Nós' },
    { id: 'elements', label: 'Elementos' },
    { id: 'mesh', label: 'Malha' },
    { id: 'materials', label: 'Materiais' },
    { id: 'sections', label: 'Seções' },
    { id: 'loads', label: 'Cargas' },
    { id: 'supports', label: 'Apoios' },
  ];

  const logFilters: Array<{ value: LogFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'debug', label: 'Debug' },
    { value: 'info', label: 'Info' },
    { value: 'warn', label: 'Warn' },
    { value: 'error', label: 'Error' },
  ];

  const cameraViews: Array<{ id: CameraView; label: string }> = [
    { id: 'top', label: 'Topo' },
    { id: 'bottom', label: 'Base' },
    { id: 'front', label: 'Frente' },
    { id: 'back', label: 'Trás' },
    { id: 'left', label: 'Esquerda' },
    { id: 'right', label: 'Direita' },
    { id: 'isometric', label: 'Isométrica' },
  ];

  let activeTool: ToolType = 'select';
  let logFilter: LogFilter = 'all';
  let logs: LogEntry[] = [];
  let gridSpacing = 1;
  let lastValidGridSpacing = gridSpacing;
  let snapToGrid = true;
  let workPlane: WorkPlane = 'XY';
  let cameraView: CameraView = 'isometric';
  let nodes: StructuralNode[] = [];
  let elements: StructuralElement1D[] = [];
  let mesh: StructuralMesh2D | undefined;
  let materials: StructuralMaterial[] = [];
  let sections: StructuralSection[] = [];
  let nodalLoads: StructuralNodalLoad[] = [];
  let prescribedDisplacements: PrescribedNodalDisplacement[] = [];
  let nodalSupports: NodalSupport[] = [];
  let selectedNodeId: string | undefined;
  let selectedElementId: string | undefined;
  let connectionNodeIds: string[] = [];
  let modelFeedback = '';
  let materialName = '';
  let materialDraft: {
    elasticModulusGPa: NumericInput;
    poissonRatio: NumericInput;
    shearModulusGPa: NumericInput;
  } = { elasticModulusGPa: '', poissonRatio: '', shearModulusGPa: '' };
  let editingMaterialId: string | undefined;
  let sectionName = '';
  let sectionThicknessMm: NumericInput = '';
  let editingSectionId: string | undefined;
  let nodalLoadDraft: LoadDraft = { Fx: '0', Fy: '0', Fz: '0', Mx: '0', My: '0', Mz: '0' };
  let displacementDraft: DisplacementDraft = { ux: '0', uy: '0', uz: '0', tx: '0', ty: '0', tz: '0' };
  let activeDisplacementDofs: ActiveDisplacementDofs = {
    ux: false,
    uy: false,
    uz: false,
    tx: false,
    ty: false,
    tz: false,
  };
  let supportDraft: SupportConstraints = { ux: false, uy: false, uz: false, tx: false, ty: false, tz: false };
  let contourNodes: StructuralNode[] = [];
  let meshIsCurrent = false;
  let meshGenerationBlockReason: string | undefined;
  let analysisService: AnalysisService = createMockAnalysisService();
  let analysisServiceReady = false;
  let analysisServiceError = '';
  let analysisUiState: AnalysisUiState | undefined;
  let analysisReadiness = validateModelReadiness({
    nodes,
    elements,
    materials,
    sections,
    supports: nodalSupports,
    loads: nodalLoads,
    displacements: prescribedDisplacements,
    mesh,
    meshIsCurrent,
  });

  $: contourNodes = nodes.filter((node) => node.origin !== 'mesh');
  $: meshGenerationBlockReason = getMeshGenerationBlockReason(contourNodes, gridSpacing, workPlane);
  $: meshIsCurrent = isMeshCurrent(mesh, contourNodes, gridSpacing, workPlane);
  $: selectedNode = nodes.find((node) => node.id === selectedNodeId);
  $: selectedElement =
    elements.find((element) => element.id === selectedElementId) ??
    mesh?.elements.find((element) => element.id === selectedElementId);
  $: selectedMaterialForElement = materials.find((material) => material.id === selectedElement?.materialId);
  $: selectedSectionForElement = sections.find((section) => section.id === selectedElement?.sectionId);
  $: selectedNodalLoad = nodalLoads.find((load) => load.nodeId === selectedNodeId);
  $: selectedPrescribedDisplacement = prescribedDisplacements.find((item) => item.nodeId === selectedNodeId);
  $: selectedNodalSupport = nodalSupports.find((item) => item.nodeId === selectedNodeId);
  $: analysisReadiness = validateModelReadiness({
    nodes,
    elements: [...elements, ...(mesh?.elements ?? [])],
    materials,
    sections,
    supports: nodalSupports,
    loads: nodalLoads,
    displacements: prescribedDisplacements,
    mesh,
    meshIsCurrent,
  });

  const emptyLoadDraft = (): LoadDraft => ({ Fx: '0', Fy: '0', Fz: '0', Mx: '0', My: '0', Mz: '0' });
  const emptyDisplacementDraft = (): DisplacementDraft => ({
    ux: '0',
    uy: '0',
    uz: '0',
    tx: '0',
    ty: '0',
    tz: '0',
  });

  const toLoadDraft = (components: LoadComponents): LoadDraft => ({
    Fx: String(components.Fx),
    Fy: String(components.Fy),
    Fz: String(components.Fz),
    Mx: String(components.Mx),
    My: String(components.My),
    Mz: String(components.Mz),
  });

  const toDisplacementDraft = (components: DisplacementComponents): DisplacementDraft => ({
    ux: String(components.ux),
    uy: String(components.uy),
    uz: String(components.uz),
    tx: String(components.tx),
    ty: String(components.ty),
    tz: String(components.tz),
  });

  const readLoadDraft = (draft: LoadDraft): LoadComponents | undefined => {
    if (
      loadFields.some(
        ({ key }) =>
          draft[key] === undefined ||
          String(draft[key]).trim() === '' ||
          !Number.isFinite(Number(draft[key])),
      )
    ) {
      return undefined;
    }
    return {
      Fx: Number(draft.Fx),
      Fy: Number(draft.Fy),
      Fz: Number(draft.Fz),
      Mx: Number(draft.Mx),
      My: Number(draft.My),
      Mz: Number(draft.Mz),
    };
  };

  const readDisplacementDraft = (draft: DisplacementDraft): DisplacementComponents | undefined => {
    if (
      displacementFields.some(
        ({ key }) =>
          draft[key] === undefined ||
          String(draft[key]).trim() === '' ||
          !Number.isFinite(Number(draft[key])),
      )
    ) {
      return undefined;
    }
    return {
      ux: Number(draft.ux),
      uy: Number(draft.uy),
      uz: Number(draft.uz),
      tx: Number(draft.tx),
      ty: Number(draft.ty),
      tz: Number(draft.tz),
    };
  };

  const resetSelectedAssignments = (): void => {
    const nodalLoad = nodalLoads.find((load) => load.nodeId === selectedNodeId);
    const displacement = prescribedDisplacements.find((item) => item.nodeId === selectedNodeId);
    const support = nodalSupports.find((item) => item.nodeId === selectedNodeId);
    nodalLoadDraft = nodalLoad ? toLoadDraft(nodalLoad.components) : emptyLoadDraft();
    displacementDraft = displacement ? toDisplacementDraft(displacement.components) : emptyDisplacementDraft();
    activeDisplacementDofs = displacement
      ? {
          ux: displacement.activeDofs.includes('ux'),
          uy: displacement.activeDofs.includes('uy'),
          uz: displacement.activeDofs.includes('uz'),
          tx: displacement.activeDofs.includes('tx'),
          ty: displacement.activeDofs.includes('ty'),
          tz: displacement.activeDofs.includes('tz'),
        }
      : { ux: false, uy: false, uz: false, tx: false, ty: false, tz: false };
    supportDraft = support
      ? { ...support.restraints }
      : { ux: false, uy: false, uz: false, tx: false, ty: false, tz: false };
  };

  const setTool = (toolId: ToolType): void => {
    activeTool = toolId;
    if (toolId !== 'elements' && connectionNodeIds.length > 0) {
      connectionNodeIds = [];
    }
    logger.info('model.tool.changed', 'Ferramenta de edição alterada', {
      toolId,
      source: 'toolbar',
    });
  };

  const handleGridSpacingChange = (event: Event): void => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || value < 0.1 || value > 10) {
      logger.warn(
        'viewport.grid.spacing.invalid',
        'Espaçamento fora do intervalo permitido; valor anterior mantido.',
        { value: input.value, minimum: 0.1, maximum: 10 },
      );
      gridSpacing = lastValidGridSpacing;
      return;
    }

    lastValidGridSpacing = value;
    logger.info('viewport.grid.changed', 'Espaçamento do grid alterado', {
      spacing: value,
      workPlane,
    });
  };

  const handleSnapChange = (): void => {
    logger.info('viewport.snap.changed', 'Snap-to-grid alterado', {
      enabled: snapToGrid,
      workPlane,
      spacing: gridSpacing,
    });
  };

  const handleWorkPlaneChange = (): void => {
    logger.info('viewport.work_plane.changed', 'Plano de trabalho alterado', {
      workPlane,
    });
  };

  const handleNodeCreate = (position: Position3D): void => {
    const duplicate = nodes.find(
      (node) =>
        node.position.x === position.x &&
        node.position.y === position.y &&
        node.position.z === position.z,
    );

    if (duplicate) {
      selectedNodeId = duplicate.id;
      selectedElementId = undefined;
      resetSelectedAssignments();
      modelFeedback = `Já existe o nó ${duplicate.id} exatamente nessa posição. Nenhuma tolerância de engenharia foi aplicada.`;
      logger.warn('model.node.create.duplicate', 'Nó duplicado na mesma posição exata', {
        nodeId: duplicate.id,
        position,
      });
      return;
    }

    const node: StructuralNode = {
      id: `node-${crypto.randomUUID()}`,
      position,
    };
    nodes = [...nodes, node];
    selectedNodeId = node.id;
    selectedElementId = undefined;
    resetSelectedAssignments();
    modelFeedback = `${node.id} criado no plano ${workPlane}.`;
    logger.info('model.node.create.completed', 'Nó criado no modelo provisório', {
      nodeId: node.id,
      position,
      nodeCount: nodes.length,
    });
  };

  const generateMesh = (): void => {
    try {
      const result = generateCartesianQuadMesh(contourNodes, gridSpacing, workPlane);
      const existingElementsById = new Map((mesh?.elements ?? []).map((element) => [element.id, element]));
      const nextMesh: StructuralMesh2D = {
        ...result.mesh,
        elements: result.mesh.elements.map((element) => {
          const existing = existingElementsById.get(element.id);
          return existing
            ? {
                ...element,
                ...(existing.materialId ? { materialId: existing.materialId } : {}),
                ...(existing.sectionId ? { sectionId: existing.sectionId } : {}),
              }
            : element;
        }),
      };
      const impact = findMeshRegenerationImpact(mesh, nextMesh, {
        lineElements: elements,
        loads: nodalLoads,
        displacements: prescribedDisplacements,
        supports: nodalSupports,
      });
      const invalidAssignments = findInvalidModelAssignments(
        nodalLoads,
        prescribedDisplacements,
        nodalSupports,
        nextMesh.elements,
        nextMesh.workPlane,
      );
      if (impact.dependencies.length > 0 || invalidAssignments.length > 0) {
        const reasons = [
          ...impact.dependencies.map((dependency) => `dependência de ${dependency}`),
          ...invalidAssignments.map((assignment) => `GDL inválido após regenerar: ${assignment}`),
        ];
        modelFeedback = `Malha não regenerada para preservar o modelo: ${reasons.join('; ')}.`;
        logger.warn('model.mesh.regenerate.blocked', 'Regeneração da malha bloqueada por dependências', {
          dependencies: impact.dependencies,
          invalidAssignments,
          removedNodeIds: impact.removedNodeIds,
          removedElementIds: impact.removedElementIds,
        });
        return;
      }

      const nextGeneratedIds = new Set(nextMesh.generatedNodeIds);
      nodes = [
        ...contourNodes,
        ...result.generatedNodes,
      ];
      mesh = nextMesh;
      if (selectedElementId && !nextMesh.elements.some(({ id }) => id === selectedElementId)) {
        selectedElementId = undefined;
        resetSelectedAssignments();
      }
      const omittedMessage = result.omittedRegionDetected
        ? ` Região do contorno não coberta por células inteiras: ${nextMesh.omittedArea.toFixed(4)} unidades².`
        : '';
      modelFeedback = `Malha gerada com ${nextMesh.elements.length} quadriláteros de 4 nós e ${nextGeneratedIds.size} nós gerados.${omittedMessage}`;
      logger.info('model.mesh.generate.completed', 'Malha cartesiana 2D gerada', {
        meshId: nextMesh.id,
        workPlane,
        cellSize: gridSpacing,
        elementCount: nextMesh.elements.length,
        generatedNodeCount: nextGeneratedIds.size,
        polygonArea: nextMesh.polygonArea,
        meshedArea: nextMesh.meshedArea,
        omittedArea: nextMesh.omittedArea,
      });
    } catch (error) {
      if (error instanceof MeshGenerationError) {
        modelFeedback = error.message;
        logger.warn('model.mesh.generate.invalid', 'Não foi possível gerar a malha', {
          code: error.code,
          message: error.message,
        });
        return;
      }
      logger.error('model.mesh.generate.failed', 'Falha inesperada ao gerar a malha', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const handleAnalysisEvent = (event: AnalysisEvent): void => {
    if (event.type === 'progress' && analysisUiState?.analysisId === event.analysisId) {
      analysisUiState = {
        ...analysisUiState,
        progress: event.progress,
        message: event.message,
      };
    }
  };

  const startAnalysis = async (): Promise<void> => {
    const analysisInProgress =
      analysisUiState?.status === 'running' || analysisUiState?.status === 'cancelling';
    if (!analysisReadiness.ready || !meshIsCurrent || !mesh || !analysisServiceReady || analysisInProgress) {
      return;
    }

    const analysisId = `analysis-${crypto.randomUUID()}`;
    const request = createAnalysisRequest(
      {
        nodes,
        lineElements: elements,
        mesh,
        materials,
        sections,
        nodalLoads,
        prescribedDisplacements,
        nodalSupports,
        activeWorkPlane: workPlane,
      },
      analysisId,
    );
    analysisUiState = {
      analysisId,
      status: 'running',
      progress: 0,
      message: 'Solicitando análise...',
    };
    logger.info('analysis.start.requested', 'Análise solicitada', {
      analysisId,
      contractVersion: request.contractVersion,
      nodeCount: request.model.nodes.length,
      lineElementCount: request.model.lineElements.length,
      quadElementCount: request.model.mesh.elements.length,
    });

    try {
      const outcome = await analysisService.start(request, handleAnalysisEvent);
      analysisUiState = outcome.status === 'completed'
        ? {
            analysisId,
            status: 'completed',
            progress: 100,
            message: outcome.simulated
              ? 'Fluxo simulado concluído; nenhum cálculo estrutural foi executado.'
              : 'Análise concluída pelo backend.',
          }
        : {
            analysisId,
            status: 'cancelled',
            progress: analysisUiState?.progress ?? 0,
            message: 'Análise cancelada.',
          };
      logger.info(
        outcome.status === 'completed' ? 'analysis.completed' : 'analysis.cancelled',
        outcome.status === 'completed' ? 'Fluxo de análise concluído' : 'Análise cancelada',
        { analysisId, simulated: outcome.simulated },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      analysisUiState = { analysisId, status: 'failed', progress: 0, message: `Falha na análise: ${message}` };
      logger.error('analysis.failed', 'Falha ao iniciar ou executar a análise', { analysisId }, error instanceof Error ? error : new Error(message));
    }
  };

  const cancelAnalysis = async (): Promise<void> => {
    if (analysisUiState?.status !== 'running' || !analysisService.supportsCancellation) {
      return;
    }

    const { analysisId } = analysisUiState;
    analysisUiState = { ...analysisUiState, status: 'cancelling', message: 'Solicitando cancelamento...' };
    try {
      await analysisService.cancel(analysisId);
      logger.info('analysis.cancel.requested', 'Cancelamento da análise solicitado', { analysisId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      analysisUiState = { analysisId, status: 'running', progress: analysisUiState.progress, message: `Não foi possível cancelar: ${message}` };
      logger.error('analysis.cancel.failed', 'Falha ao solicitar cancelamento', { analysisId }, error instanceof Error ? error : new Error(message));
    }
  };

  const initializeAnalysisService = async (): Promise<void> => {
    try {
      analysisService = await createDefaultAnalysisService();
      analysisServiceReady = true;
      logger.info('analysis.service.ready', 'Serviço de análise preparado', {
        implementation: analysisService.implementation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      analysisServiceError = `Serviço de análise indisponível: ${message}`;
      logger.error('analysis.service.initialization.failed', 'Falha ao preparar o serviço de análise', {}, error instanceof Error ? error : new Error(message));
    }
  };

  const handleElementNodePick = (nodeId: string): void => {
    if (connectionNodeIds.includes(nodeId)) {
      modelFeedback = 'Escolha um segundo nó diferente para completar a conexão.';
      logger.warn('model.element.create.same_node', 'Conexão exige dois nós distintos', { nodeId });
      return;
    }

    if (connectionNodeIds.length === 0) {
      connectionNodeIds = [nodeId];
      modelFeedback = `Nó ${nodeId} selecionado. Agora selecione outro nó para criar a conexão.`;
      logger.info('model.element.create.started', 'Seleção do primeiro nó para conexão iniciada', {
        nodeId,
      });
      return;
    }

    const startNodeId = connectionNodeIds[0];
    if (!startNodeId) {
      connectionNodeIds = [nodeId];
      return;
    }

    const duplicate = elements.find(
      (element) =>
        (element.nodeIds[0] === startNodeId && element.nodeIds[1] === nodeId) ||
        (element.nodeIds[0] === nodeId && element.nodeIds[1] === startNodeId),
    );
    if (duplicate) {
      connectionNodeIds = [];
      selectedNodeId = undefined;
      selectedElementId = duplicate.id;
      resetSelectedAssignments();
      modelFeedback = `A conexão entre esses nós já existe (${duplicate.id}).`;
      logger.warn('model.element.create.duplicate', 'Conexão duplicada entre o mesmo par de nós', {
        elementId: duplicate.id,
        nodeIds: duplicate.nodeIds,
      });
      return;
    }

    const element: StructuralElement1D = {
      type: 'line1d',
      id: `element-${crypto.randomUUID()}`,
      nodeIds: [startNodeId, nodeId],
    };
    elements = [...elements, element];
    connectionNodeIds = [];
    selectedNodeId = undefined;
    selectedElementId = element.id;
    resetSelectedAssignments();
    modelFeedback = `Conexão provisória ${element.id} criada entre os dois nós.`;
    logger.info('model.element.create.completed', 'Conexão visual provisória criada', {
      elementId: element.id,
      nodeIds: element.nodeIds,
      elementCount: elements.length,
    });
  };

  const handleSelectionChange = (nodeId: string | undefined): void => {
    if (selectedNodeId === nodeId && selectedElementId === undefined) {
      return;
    }
    selectedNodeId = nodeId;
    selectedElementId = undefined;
    resetSelectedAssignments();
    modelFeedback = nodeId ? `${nodeId} selecionado.` : 'Seleção removida.';
    logger.info('model.selection.changed', 'Seleção do modelo alterada', {
      itemType: nodeId ? 'node' : 'none',
      ...(nodeId ? { nodeId } : {}),
    });
  };

  const handleElementSelectionChange = (elementId: string | undefined): void => {
    if (selectedElementId === elementId && selectedNodeId === undefined) {
      return;
    }
    selectedNodeId = undefined;
    selectedElementId = elementId;
    resetSelectedAssignments();
    modelFeedback = elementId ? `${elementId} selecionado.` : 'Seleção removida.';
    logger.info('model.selection.changed', 'Seleção do modelo alterada', {
      itemType: elementId ? 'element' : 'none',
      ...(elementId ? { elementId } : {}),
    });
  };

  const selectNodeFromList = (nodeId: string): void => {
    handleSelectionChange(nodeId);
  };

  const selectElementFromList = (elementId: string): void => {
    handleElementSelectionChange(elementId);
  };

  const handleSaveMaterial = (): void => {
    const name = materialName.trim();
    const elasticModulusGPa = Number(materialDraft.elasticModulusGPa);
    const poissonRatio = Number(materialDraft.poissonRatio);
    const shearModulusGPa = Number(materialDraft.shearModulusGPa);
    if (
      !name ||
      materialDraft.elasticModulusGPa === undefined ||
      String(materialDraft.elasticModulusGPa).trim() === '' ||
      materialDraft.poissonRatio === undefined ||
      String(materialDraft.poissonRatio).trim() === '' ||
      materialDraft.shearModulusGPa === undefined ||
      String(materialDraft.shearModulusGPa).trim() === '' ||
      !Number.isFinite(elasticModulusGPa) ||
      !Number.isFinite(poissonRatio) ||
      !Number.isFinite(shearModulusGPa)
    ) {
      modelFeedback = 'Preencha o nome e valores numéricos finitos para E, v e G.';
      logger.warn('model.material.save.invalid', 'Dados do material incompletos ou inválidos');
      return;
    }
    const duplicate = materials.find(
      (material) =>
        material.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
        material.id !== editingMaterialId,
    );
    if (duplicate) {
      modelFeedback = `Já existe um material chamado ${duplicate.name}.`;
      logger.warn('model.material.save.duplicate', 'Nome de material duplicado', { materialId: duplicate.id });
      return;
    }

    if (editingMaterialId) {
      materials = materials.map((material) =>
        material.id === editingMaterialId
          ? { ...material, name, elasticModulusGPa, poissonRatio, shearModulusGPa }
          : material,
      );
      modelFeedback = `Material ${name} atualizado; atribuições existentes preservadas.`;
      logger.info('model.material.update.completed', 'Material atualizado', { materialId: editingMaterialId, name });
    } else {
      const material: StructuralMaterial = {
        id: `material-${crypto.randomUUID()}`,
        name,
        elasticModulusGPa,
        poissonRatio,
        shearModulusGPa,
      };
      materials = [...materials, material];
      modelFeedback = `Material ${name} criado.`;
      logger.info('model.material.create.completed', 'Material criado', { materialId: material.id, name });
    }
    editingMaterialId = undefined;
    materialName = '';
    materialDraft = { elasticModulusGPa: '', poissonRatio: '', shearModulusGPa: '' };
  };

  const editMaterial = (material: StructuralMaterial): void => {
    editingMaterialId = material.id;
    materialName = material.name;
    materialDraft = {
      elasticModulusGPa: String(material.elasticModulusGPa),
      poissonRatio: String(material.poissonRatio),
      shearModulusGPa: String(material.shearModulusGPa),
    };
  };

  const fillMaterialPreset = (
    name: 'Aço' | 'Concreto',
    elasticModulusGPa: number,
    poissonRatio: number,
    shearModulusGPa: number,
  ): void => {
    materialName = name;
    materialDraft = {
      elasticModulusGPa: String(elasticModulusGPa),
      poissonRatio: String(poissonRatio),
      shearModulusGPa: String(shearModulusGPa),
    };
  };

  const deleteMaterial = (material: StructuralMaterial): void => {
    materials = materials.filter((item) => item.id !== material.id);
    elements = elements.map((element) => {
      if (element.materialId !== material.id) {
        return element;
      }
      const updated = { ...element };
      delete updated.materialId;
      return updated;
    });
    if (mesh) {
      mesh = {
        ...mesh,
        elements: mesh.elements.map((element) => {
          if (element.materialId !== material.id) return element;
          const updated = { ...element };
          delete updated.materialId;
          return updated;
        }),
      };
    }
    if (editingMaterialId === material.id) {
      editingMaterialId = undefined;
      materialName = '';
      materialDraft = { elasticModulusGPa: '', poissonRatio: '', shearModulusGPa: '' };
    }
    modelFeedback = `Material ${material.name} removido; referências dos elementos foram limpas.`;
    logger.info('model.material.delete.completed', 'Material removido e atribuições limpas', {
      materialId: material.id,
    });
  };

  const handleSaveSection = (): void => {
    const name = sectionName.trim();
    const thicknessMm = Number(sectionThicknessMm);
    if (
      !name ||
      sectionThicknessMm === undefined ||
      String(sectionThicknessMm).trim() === '' ||
      !Number.isFinite(thicknessMm) ||
      thicknessMm <= 0
    ) {
      modelFeedback = 'Informe um nome e uma espessura numérica maior que zero.';
      logger.warn('model.section.save.invalid', 'Dados da seção incompletos ou inválidos');
      return;
    }
    const duplicate = sections.find(
      (section) => section.name.toLocaleLowerCase() === name.toLocaleLowerCase() && section.id !== editingSectionId,
    );
    if (duplicate) {
      modelFeedback = `Já existe uma seção chamada ${duplicate.name}.`;
      logger.warn('model.section.save.duplicate', 'Nome de seção duplicado', { sectionId: duplicate.id });
      return;
    }
    if (editingSectionId) {
      sections = sections.map((section) =>
        section.id === editingSectionId ? { ...section, name, thicknessMm } : section,
      );
      modelFeedback = `Seção ${name} atualizada; atribuições existentes preservadas.`;
      logger.info('model.section.update.completed', 'Seção atualizada', { sectionId: editingSectionId, name });
    } else {
      const section: StructuralSection = { id: `section-${crypto.randomUUID()}`, name, thicknessMm };
      sections = [...sections, section];
      modelFeedback = `Seção ${name} criada.`;
      logger.info('model.section.create.completed', 'Seção criada', { sectionId: section.id, name });
    }
    editingSectionId = undefined;
    sectionName = '';
    sectionThicknessMm = '';
  };

  const editSection = (section: StructuralSection): void => {
    editingSectionId = section.id;
    sectionName = section.name;
    sectionThicknessMm = String(section.thicknessMm);
  };

  const deleteSection = (section: StructuralSection): void => {
    sections = sections.filter((item) => item.id !== section.id);
    elements = elements.map((element) => {
      if (element.sectionId !== section.id) {
        return element;
      }
      const updated = { ...element };
      delete updated.sectionId;
      return updated;
    });
    if (mesh) {
      mesh = {
        ...mesh,
        elements: mesh.elements.map((element) => {
          if (element.sectionId !== section.id) return element;
          const updated = { ...element };
          delete updated.sectionId;
          return updated;
        }),
      };
    }
    if (editingSectionId === section.id) {
      editingSectionId = undefined;
      sectionName = '';
      sectionThicknessMm = '';
    }
    modelFeedback = `Seção ${section.name} removida; referências dos elementos foram limpas.`;
    logger.info('model.section.delete.completed', 'Seção removida e atribuições limpas', {
      sectionId: section.id,
    });
  };

  const assignMaterial = (material: StructuralMaterial): void => {
    if (!selectedElement) {
      modelFeedback = 'Selecione um elemento 1D ou 2D para atribuir um material.';
      return;
    }
    if (selectedElement.type === 'line1d') {
      elements = elements.map((element) =>
        element.id === selectedElement.id ? { ...element, materialId: material.id } : element,
      );
    } else if (mesh) {
      mesh = {
        ...mesh,
        elements: mesh.elements.map((element) =>
          element.id === selectedElement.id ? { ...element, materialId: material.id } : element,
        ),
      };
    }
    modelFeedback = `Material ${material.name} atribuído a ${selectedElement.id}.`;
    logger.info('model.element.material.assigned', 'Material atribuído ao elemento', {
      elementId: selectedElement.id,
      materialId: material.id,
    });
  };

  const assignSection = (section: StructuralSection): void => {
    if (!selectedElement) {
      modelFeedback = 'Selecione um elemento 1D ou 2D para atribuir uma seção.';
      return;
    }
    if (selectedElement.type === 'line1d') {
      elements = elements.map((element) =>
        element.id === selectedElement.id ? { ...element, sectionId: section.id } : element,
      );
    } else if (mesh) {
      mesh = {
        ...mesh,
        elements: mesh.elements.map((element) =>
          element.id === selectedElement.id ? { ...element, sectionId: section.id } : element,
        ),
      };
    }
    modelFeedback = `Seção ${section.name} atribuída a ${selectedElement.id}.`;
    logger.info('model.element.section.assigned', 'Seção atribuída ao elemento', {
      elementId: selectedElement.id,
      sectionId: section.id,
    });
  };

  const saveNodalLoad = (): void => {
    if (!selectedNode) {
      modelFeedback = 'Selecione um nó antes de aplicar a carga concentrada.';
      return;
    }
    const components = readLoadDraft(nodalLoadDraft);
    if (!components) {
      modelFeedback = 'Informe valores numéricos finitos para os seis componentes da carga.';
      logger.warn('model.nodal_load.save.invalid', 'Componentes da carga concentrada inválidos', {
        nodeId: selectedNode.id,
      });
      return;
    }
    const invalidDofs = validateLoadDegreesOfFreedom(
      selectedNode.id,
      components,
      meshIsCurrent ? mesh?.elements ?? [] : [],
      meshIsCurrent ? mesh?.workPlane : undefined,
    );
    if (invalidDofs.length > 0) {
      modelFeedback = formatInvalidDegreesOfFreedom(invalidDofs);
      logger.warn('model.nodal_load.save.invalid_dof', 'Carga rejeitada por graus de liberdade inválidos', {
        nodeId: selectedNode.id,
        invalidDofs,
      });
      return;
    }
    const record: StructuralNodalLoad = { nodeId: selectedNode.id, components };
    nodalLoads = [...nodalLoads.filter((load) => load.nodeId !== selectedNode.id), record];
    modelFeedback = `Carga concentrada aplicada a ${selectedNode.id}.`;
    logger.info('model.nodal_load.apply.completed', 'Carga concentrada aplicada ao nó', {
      nodeId: selectedNode.id,
      components,
    });
  };

  const savePrescribedDisplacement = (): void => {
    if (!selectedNode) {
      modelFeedback = 'Selecione um nó antes de aplicar o deslocamento prescrito.';
      return;
    }
    const components = readDisplacementDraft(displacementDraft);
    if (!components) {
      modelFeedback = 'Informe valores numéricos finitos para os seis componentes do deslocamento.';
      logger.warn('model.displacement.save.invalid', 'Componentes do deslocamento prescritos inválidos', {
        nodeId: selectedNode.id,
      });
      return;
    }
    const activeDofs = displacementFields
      .filter(({ key }) => activeDisplacementDofs[key])
      .map(({ key }) => key);
    if (activeDofs.length === 0) {
      modelFeedback = 'Ative pelo menos um grau de liberdade para aplicar o deslocamento prescrito.';
      logger.warn('model.displacement.save.no_active_dofs', 'Nenhum grau de liberdade prescrito foi selecionado', {
        nodeId: selectedNode.id,
      });
      return;
    }
    const invalidDofs = validateDisplacementDegreesOfFreedom(
      selectedNode.id,
      activeDofs,
      meshIsCurrent ? mesh?.elements ?? [] : [],
      meshIsCurrent ? mesh?.workPlane : undefined,
    );
    if (invalidDofs.length > 0) {
      modelFeedback = formatInvalidDegreesOfFreedom(invalidDofs);
      logger.warn('model.displacement.save.invalid_dof', 'Deslocamento rejeitado por graus de liberdade inválidos', {
        nodeId: selectedNode.id,
        invalidDofs,
      });
      return;
    }
    const record: PrescribedNodalDisplacement = { nodeId: selectedNode.id, components, activeDofs };
    prescribedDisplacements = [
      ...prescribedDisplacements.filter((item) => item.nodeId !== selectedNode.id),
      record,
    ];
    modelFeedback = `Deslocamento prescrito aplicado a ${selectedNode.id}.`;
    logger.info('model.displacement.apply.completed', 'Deslocamento prescrito aplicado ao nó', {
      nodeId: selectedNode.id,
      components,
    });
  };

  const applySupportPreset = (presetId: string): void => {
    const preset = supportPresets.find((item) => item.id === presetId);
    if (!preset) {
      modelFeedback = 'Preset de apoio desconhecido.';
      logger.error('model.support.preset.invalid', 'Preset de apoio não encontrado', { presetId });
      return;
    }
    supportDraft = { ...preset.restraints };
  };

  const saveSupport = (): void => {
    if (!selectedNode) {
      modelFeedback = 'Selecione um nó antes de aplicar um apoio.';
      return;
    }
    const record: NodalSupport = { nodeId: selectedNode.id, restraints: { ...supportDraft } };
    const invalidDofs = validateSupportDegreesOfFreedom(
      record,
      meshIsCurrent ? mesh?.elements ?? [] : [],
      meshIsCurrent ? mesh?.workPlane : undefined,
    );
    if (invalidDofs.length > 0) {
      modelFeedback = formatInvalidDegreesOfFreedom(invalidDofs);
      logger.warn('model.support.save.invalid_dof', 'Apoio rejeitado por graus de liberdade inválidos', {
        nodeId: selectedNode.id,
        invalidDofs,
      });
      return;
    }
    nodalSupports = [...nodalSupports.filter((item) => item.nodeId !== selectedNode.id), record];
    modelFeedback = `Apoio aplicado a ${selectedNode.id}.`;
    logger.info('model.support.apply.completed', 'Apoio aplicado ao nó', {
      nodeId: selectedNode.id,
      restraints: record.restraints,
    });
  };

  const removeNodalLoad = (): void => {
    if (!selectedNode) return;
    nodalLoads = nodalLoads.filter((load) => load.nodeId !== selectedNode.id);
    nodalLoadDraft = emptyLoadDraft();
    modelFeedback = `Carga concentrada removida de ${selectedNode.id}.`;
    logger.info('model.nodal_load.remove.completed', 'Carga concentrada removida do nó', {
      nodeId: selectedNode.id,
    });
  };

  const removePrescribedDisplacement = (): void => {
    if (!selectedNode) return;
    prescribedDisplacements = prescribedDisplacements.filter((item) => item.nodeId !== selectedNode.id);
    displacementDraft = emptyDisplacementDraft();
    activeDisplacementDofs = { ux: false, uy: false, uz: false, tx: false, ty: false, tz: false };
    modelFeedback = `Deslocamento prescrito removido de ${selectedNode.id}.`;
    logger.info('model.displacement.remove.completed', 'Deslocamento prescrito removido do nó', {
      nodeId: selectedNode.id,
    });
  };

  const removeSupport = (): void => {
    if (!selectedNode) return;
    nodalSupports = nodalSupports.filter((item) => item.nodeId !== selectedNode.id);
    supportDraft = { ux: false, uy: false, uz: false, tx: false, ty: false, tz: false };
    modelFeedback = `Apoio removido de ${selectedNode.id}.`;
    logger.info('model.support.remove.completed', 'Apoio removido do nó', { nodeId: selectedNode.id });
  };

  const unsubscribe = logger.subscribe((entry) => {
    logs = [entry, ...logs].slice(0, 60);
  });

  onMount(() => {
    void initializeAnalysisService();
    logger.info('app.started', 'Aplicação iniciada', {
      layout: 'shell',
      toolCount: tools.length,
    });
    logger.warn('layout.initialized', 'Layout inicial em modo de estrutura vazia.', {
      activeTool,
      status: 'waiting-for-model-data',
    });
  });

  onDestroy(() => {
    unsubscribe();
  });

  $: filteredLogs = logs.filter((entry) => logFilter === 'all' || entry.level === logFilter);
</script>

<div class="app-shell" aria-label="Aplicação estrutural inicial">
  <header class="topbar" aria-label="Barra superior da aplicação">
    <div class="brand-block">
      <span class="brand-mark">S</span>
      <span>Structural App</span>
    </div>

    <nav class="toolbar" aria-label="Ações gerais">
      <button type="button">Arquivo</button>
      <button type="button">Editar</button>
      <button
        type="button"
        disabled={!analysisReadiness.ready || !analysisServiceReady || analysisUiState?.status === 'running' || analysisUiState?.status === 'cancelling'}
        on:click={startAnalysis}
        aria-describedby="analysis-readiness-status analysis-readiness-issues"
        title={!analysisReadiness.ready ? 'Consulte os problemas de prontidão do modelo' : !analysisServiceReady ? 'Aguarde a inicialização do serviço de análise' : 'Iniciar análise'}
      >
        {analysisUiState?.status === 'running' || analysisUiState?.status === 'cancelling' ? 'Análise em andamento' : 'Iniciar análise'}
      </button>
      <button type="button">Resultados</button>
    </nav>
  </header>

  <div class="workspace" aria-label="Área principal do aplicativo">
    <aside class="tool-panel" aria-label="Barra de ferramentas">
      <h2>Ferramentas</h2>
      <ul>
        {#each tools as tool}
          <li>
            <button
              type="button"
              class:active={tool.id === activeTool}
              aria-pressed={tool.id === activeTool}
              on:click={() => setTool(tool.id)}
            >
              {tool.label}
            </button>
          </li>
        {/each}
      </ul>
    </aside>

    <main class="viewport-panel" aria-label="Viewport 3D">
      <div class="viewport-toolbar" aria-label="Controles do viewport">
        <div class="view-presets" role="group" aria-label="Vistas predefinidas">
          {#each cameraViews as view}
            <button
              type="button"
              class:active={cameraView === view.id}
              aria-pressed={cameraView === view.id}
              on:click={() => (cameraView = view.id)}
            >
              {view.label}
            </button>
          {/each}
        </div>

        <label class="grid-spacing-control">
          <span>Grid</span>
          <input
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            aria-label="Espaçamento do grid"
            bind:value={gridSpacing}
            on:change={handleGridSpacingChange}
          />
        </label>

        <label class="work-plane-control">
          <span>Plano</span>
          <select
            aria-label="Plano de trabalho"
            bind:value={workPlane}
            on:change={handleWorkPlaneChange}
          >
            <option value="XY">XY</option>
            <option value="XZ">XZ</option>
            <option value="YZ">YZ</option>
          </select>
        </label>

        <label class="snap-control">
          <input type="checkbox" bind:checked={snapToGrid} on:change={handleSnapChange} />
          <span>Snap-to-grid</span>
        </label>
      </div>

      <div class="viewport-help" aria-live="polite">
        {#if activeTool === 'nodes'}
          Clique no plano de trabalho para criar um nó · arrastar orbita · botão direito move · roda amplia
        {:else if activeTool === 'elements'}
          Clique em dois nós distintos para criar um elemento 1D visual · arrastar orbita
        {:else if activeTool === 'select'}
          Clique em um nó ou elemento para selecionar · arrastar orbita · botão direito move · roda amplia
        {:else if activeTool === 'mesh'}
          Crie os nós do contorno em qualquer ordem; a ordenação automática aceita contornos convexos
        {:else if activeTool === 'materials'}
          Clique em um elemento 1D ou quadrilátero 2D para atribuir um material
        {:else if activeTool === 'sections'}
          Clique em um elemento 1D ou quadrilátero 2D para atribuir uma seção
        {:else if activeTool === 'loads'}
          Clique em um nó para cargas concentradas e deslocamentos · cargas distribuídas em elementos serão adicionadas posteriormente
        {:else if activeTool === 'supports'}
          Clique em um nó para selecionar e aplicar um apoio
        {:else}
          Esta ferramenta ainda não interage com o viewport nesta etapa · navegação da câmera continua disponível
        {/if}
      </div>
      <SceneViewport
        spacing={gridSpacing}
        snapToGrid={snapToGrid}
        {workPlane}
        {cameraView}
        {activeTool}
        {nodes}
        {elements}
        meshElements={mesh?.elements ?? []}
        {selectedNodeId}
        {selectedElementId}
        {connectionNodeIds}
        onNodeCreate={handleNodeCreate}
        onElementNodePick={handleElementNodePick}
        onSelectionChange={handleSelectionChange}
        onElementSelectionChange={handleElementSelectionChange}
        onInteractionNotice={(message) => (modelFeedback = message)}
      />
    </main>

    <aside class="context-panel" aria-label="Painel lateral do modelo">
      <section aria-labelledby="mesh-heading">
        <h2 id="mesh-heading">Malha</h2>
        <p class="mesh-notice">
          {#if meshIsCurrent && mesh}
            {mesh.elements.length} quadriláteros · célula {mesh.cellSize} · plano {mesh.workPlane}
            {#if mesh.omittedArea > 0}
              · área omitida: {mesh.omittedArea.toFixed(4)} unidades²
            {/if}
          {:else if mesh}
            A malha existente está desatualizada. Regenere-a para o contorno, plano e espaçamento atuais.
          {:else}
            A ordem de criação não importa para contornos convexos. A ordenação automática atual não aceita contornos côncavos. O espaçamento do grid define o tamanho da célula.
          {/if}
        </p>
        <button
          type="button"
          class="mesh-action"
          disabled={meshGenerationBlockReason !== undefined}
          aria-describedby="mesh-generation-guidance"
          on:click={generateMesh}
        >
          {mesh ? 'Gerar / regenerar malha' : 'Gerar malha 2D'}
        </button>
        <p id="mesh-generation-guidance" class:mesh-blocked={meshGenerationBlockReason !== undefined} class="mesh-notice" role="status" aria-live="polite">
          {meshGenerationBlockReason ?? 'Pronto para gerar; os nós serão reordenados automaticamente.'}
        </p>
        {#if mesh?.elements.length}
          <p class="model-count" aria-label="Contagem de elementos da malha">
            {mesh.elements.length} elemento(s) quadrilateral(is) de 4 nós
          </p>
        {/if}
      </section>
      <section aria-labelledby="analysis-readiness-heading">
        <h2 id="analysis-readiness-heading">Prontidão para análise</h2>
        <p
          id="analysis-readiness-status"
          class:readiness-ready={analysisReadiness.ready}
          class:readiness-blocked={!analysisReadiness.ready}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {analysisReadiness.ready ? 'Modelo pronto para análise.' : `${analysisReadiness.issues.length} problema(s) impedem a análise.`}
        </p>
        <ul id="analysis-readiness-issues" class="readiness-issues">
          {#each analysisReadiness.issues as issue (issue.code + issue.message)}
            <li>{issue.message}</li>
          {/each}
          {#if analysisReadiness.ready}
            <li>Todos os requisitos mínimos de completude foram atendidos.</li>
          {/if}
        </ul>
        {#if analysisServiceError}
          <p class="analysis-message analysis-failed" role="alert">{analysisServiceError}</p>
        {:else if analysisUiState}
          <div class="analysis-message" role="status" aria-live="polite" aria-atomic="true">
            <p>{analysisUiState.message}</p>
            {#if analysisUiState.status === 'running' || analysisUiState.status === 'cancelling'}
              <progress max="100" value={analysisUiState.progress} aria-label="Progresso da análise">
                {analysisUiState.progress}%
              </progress>
              {#if analysisService.supportsCancellation}
                <button type="button" disabled={analysisUiState.status === 'cancelling'} on:click={cancelAnalysis}>
                  {analysisUiState.status === 'cancelling' ? 'Cancelando…' : 'Cancelar análise'}
                </button>
              {/if}
            {/if}
          </div>
        {/if}
      </section>
      <section>
        <h2>Modelo</h2>
        <p class="model-count">{nodes.length} {nodes.length === 1 ? 'nó' : 'nós'}</p>
        {#if nodes.length === 0}
          <div class="empty-state">Modelo sem nós. Selecione a ferramenta Nós para adicionar.</div>
        {:else}
          <ul class="node-list" aria-label="Nós do modelo">
            {#each nodes as node}
              <li>
                <button
                  type="button"
                  class:selected-node={node.id === selectedNodeId}
                  aria-pressed={node.id === selectedNodeId}
                  on:click={() => selectNodeFromList(node.id)}
                >
                  <strong>{node.id}</strong>
                  <span>
                    ({node.position.x.toFixed(2)}, {node.position.y.toFixed(2)}, {node.position.z.toFixed(2)})
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      <section>
        <h2>Elementos</h2>
        <p class="model-count">{elements.length} elemento(s) 1D explícito(s)</p>
        {#if elements.length === 0}
          <div class="empty-state">
            Nenhum elemento 1D. Selecione Elementos e clique em dois nós distintos; não são criados automaticamente.
          </div>
        {:else}
          <ul class="node-list" aria-label="Conexões provisórias do modelo">
            {#each elements as element}
              <li>
                <button
                  type="button"
                  class:selected-node={element.id === selectedElementId}
                  aria-pressed={element.id === selectedElementId}
                  on:click={() => selectElementFromList(element.id)}
                >
                  <strong>{element.id}</strong>
                  <span>{element.nodeIds[0]} ↔ {element.nodeIds[1]}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      <section aria-labelledby="mesh-elements-heading">
        <h2 id="mesh-elements-heading">Elementos 2D da malha</h2>
        <p class="model-count">{mesh?.elements.length ?? 0} quadriláteros</p>
        {#if mesh?.elements.length}
          <ul class="node-list" aria-label="Quadriláteros da malha">
            {#each mesh.elements as element}
              <li>
                <button
                  type="button"
                  class:selected-node={element.id === selectedElementId}
                  aria-pressed={element.id === selectedElementId}
                  on:click={() => selectElementFromList(element.id)}
                >
                  <strong>{element.id}</strong>
                  <span>{element.nodeIds.join(' → ')}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="empty-state">A malha 2D ainda não foi gerada.</div>
        {/if}
      </section>
      {#if activeTool === 'materials'}
        <section aria-labelledby="materials-heading">
          <h2 id="materials-heading">Materiais</h2>
          <p class="editor-note">
            Os presets preenchem E, v e G; os valores permanecem editáveis.
          </p>
          <div class="preset-actions" aria-label="Nomes de material predefinidos">
            <button type="button" on:click={() => fillMaterialPreset('Aço', 200, 0.3, 500)}>Preencher Aço</button>
            <button type="button" on:click={() => fillMaterialPreset('Concreto', 26.071594, 0.2, 500)}>Preencher Concreto</button>
          </div>
          <form class="model-form" on:submit|preventDefault={handleSaveMaterial}>
            <label>Nome
              <input aria-label="Nome do material" bind:value={materialName} required />
            </label>
            <label>E (GPa)
              <input aria-label="Módulo E em GPa" type="number" step="any" bind:value={materialDraft.elasticModulusGPa} required />
            </label>
            <label>v (sem unidade)
              <input aria-label="Índice de Poisson v" type="number" step="any" bind:value={materialDraft.poissonRatio} required />
            </label>
            <label>G (GPa)
              <input aria-label="Módulo G em GPa" type="number" step="any" bind:value={materialDraft.shearModulusGPa} required />
            </label>
            <button type="submit">{editingMaterialId ? 'Salvar material' : 'Criar material'}</button>
            {#if editingMaterialId}
              <button type="button" on:click={() => {
                editingMaterialId = undefined;
                materialName = '';
                materialDraft = { elasticModulusGPa: '', poissonRatio: '', shearModulusGPa: '' };
              }}>Cancelar edição</button>
            {/if}
          </form>
          {#if materials.length === 0}
            <div class="empty-state">Nenhum material cadastrado.</div>
          {:else}
            <ul class="managed-list" aria-label="Materiais cadastrados">
              {#each materials as material}
                <li>
                  <div class="managed-item">
                    <strong>{material.name}</strong>
                    <span>E {material.elasticModulusGPa} GPa · v {material.poissonRatio} · G {material.shearModulusGPa} GPa</span>
                    <div class="item-actions">
                      <button type="button" on:click={() => editMaterial(material)}>Editar</button>
                      <button type="button" on:click={() => assignMaterial(material)} disabled={!selectedElement}>Atribuir ao elemento selecionado</button>
                      <button type="button" class="danger-action" on:click={() => deleteMaterial(material)}>Remover</button>
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {:else if activeTool === 'sections'}
        <section aria-labelledby="sections-heading">
          <h2 id="sections-heading">Seções</h2>
          <p class="editor-note">A espessura é informada em milímetros. A interpretação da seção permanece provisória.</p>
          <form class="model-form" on:submit|preventDefault={handleSaveSection}>
            <label>Nome
              <input aria-label="Nome da seção" bind:value={sectionName} required />
            </label>
            <label>Espessura (mm)
              <input aria-label="Espessura da seção em milímetros" type="number" min="0" step="any" bind:value={sectionThicknessMm} required />
            </label>
            <button type="submit">{editingSectionId ? 'Salvar seção' : 'Criar seção'}</button>
            {#if editingSectionId}
              <button type="button" on:click={() => {
                editingSectionId = undefined;
                sectionName = '';
                sectionThicknessMm = '';
              }}>Cancelar edição</button>
            {/if}
          </form>
          {#if sections.length === 0}
            <div class="empty-state">Nenhuma seção cadastrada.</div>
          {:else}
            <ul class="managed-list" aria-label="Seções cadastradas">
              {#each sections as section}
                <li>
                  <div class="managed-item">
                    <strong>{section.name}</strong>
                    <span>Espessura: {section.thicknessMm} mm</span>
                    <div class="item-actions">
                      <button type="button" on:click={() => editSection(section)}>Editar</button>
                      <button type="button" on:click={() => assignSection(section)} disabled={!selectedElement}>Atribuir ao elemento selecionado</button>
                      <button type="button" class="danger-action" on:click={() => deleteSection(section)}>Remover</button>
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {:else if activeTool === 'loads'}
        <section aria-labelledby="loads-heading">
          <h2 id="loads-heading">Cargas concentradas e deslocamentos</h2>
          <p class="editor-note">
            Cargas concentradas são aplicadas a nós. Cargas distribuídas em elementos serão adicionadas posteriormente.
          </p>
          {#if selectedNode}
            <p class="model-count">Alvo selecionado: nó {selectedNode.id}</p>
            <form class="model-form" on:submit|preventDefault={saveNodalLoad}>
              <h3>Carga concentrada</h3>
              <div class="component-grid">
                {#each loadFields as field}
                  <label>{field.label} ({field.unit})
                    <input aria-label={`${field.label} (${field.unit})`} type="number" step="any" bind:value={nodalLoadDraft[field.key]} required />
                  </label>
                {/each}
              </div>
              <button type="submit">Aplicar carga ao nó</button>
              {#if selectedNodalLoad}
                <button type="button" class="danger-action" on:click={removeNodalLoad}>Remover carga</button>
              {/if}
            </form>
            <form class="model-form" on:submit|preventDefault={savePrescribedDisplacement}>
              <h3>Deslocamento prescrito</h3>
              <div class="component-grid">
                {#each displacementFields as field}
                  <label>{field.label} ({field.unit})
                    <span class="dof-input">
                      <input
                        type="checkbox"
                        aria-label={`Ativar atribuição de ${field.label}`}
                        bind:checked={activeDisplacementDofs[field.key]}
                      />
                      <input
                        aria-label={`${field.label} (${field.unit})`}
                        type="number"
                        step="any"
                        bind:value={displacementDraft[field.key]}
                        required
                      />
                    </span>
                  </label>
                {/each}
              </div>
              <button type="submit">Aplicar deslocamento</button>
              {#if selectedPrescribedDisplacement}
                <button type="button" class="danger-action" on:click={removePrescribedDisplacement}>Remover deslocamento</button>
              {/if}
            </form>
          {:else if selectedElement}
            <div class="empty-state">Cargas concentradas só podem ser aplicadas a nós. Cargas distribuídas em elementos serão implementadas posteriormente.</div>
          {:else}
            <div class="empty-state">Selecione um nó no viewport ou na lista para aplicar cargas concentradas e deslocamentos prescritos.</div>
          {/if}
        </section>
      {:else if activeTool === 'supports'}
        <section aria-labelledby="supports-heading">
          <h2 id="supports-heading">Apoios</h2>
          {#if selectedNode}
            <p class="model-count">Nó selecionado: {selectedNode.id}</p>
            <p class="editor-note">Verdadeiro bloqueia o grau de liberdade; falso deixa livre.</p>
            <div class="preset-actions" aria-label="Presets de apoio">
              {#each supportPresets as preset}
                <button type="button" on:click={() => applySupportPreset(preset.id)}>{preset.label}</button>
              {/each}
            </div>
            <div class="constraint-grid">
              {#each displacementFields as field}
                <label>
                  <input type="checkbox" bind:checked={supportDraft[field.key]} />
                  {field.label}
                </label>
              {/each}
            </div>
            <button type="button" class="primary-action" on:click={saveSupport}>Aplicar apoio ao nó</button>
            {#if selectedNodalSupport}
              <button type="button" class="danger-action" on:click={removeSupport}>Remover apoio</button>
            {/if}
          {:else}
            <div class="empty-state">Selecione um nó no viewport ou na lista para configurar o apoio.</div>
          {/if}
        </section>
      {/if}
      <section>
        <h2>Propriedades</h2>
        {#if selectedNode}
          <dl class="node-properties">
            <div><dt>Tipo</dt><dd>Nó provisório</dd></div>
            <div><dt>ID</dt><dd>{selectedNode.id}</dd></div>
            <div><dt>X</dt><dd>{selectedNode.position.x.toFixed(3)}</dd></div>
            <div><dt>Y</dt><dd>{selectedNode.position.y.toFixed(3)}</dd></div>
            <div><dt>Z</dt><dd>{selectedNode.position.z.toFixed(3)}</dd></div>
            <div><dt>Unidade</dt><dd>Não definida</dd></div>
            <div><dt>Carga concentrada</dt><dd>{selectedNodalLoad ? 'Aplicada' : 'Nenhuma'}</dd></div>
            <div><dt>Deslocamento prescrito</dt><dd>{selectedPrescribedDisplacement ? 'Aplicado' : 'Nenhum'}</dd></div>
            <div><dt>Apoio</dt><dd>{selectedNodalSupport ? displacementFields.filter(({ key }) => selectedNodalSupport.restraints[key]).map(({ label }) => label).join(', ') || 'Livre' : 'Nenhum'}</dd></div>
          </dl>
          {#if selectedNodalLoad}
            <div class="assignment-details" aria-label="Valores da carga concentrada">
              {#each loadFields as field}
                <span>{field.label}: {selectedNodalLoad.components[field.key]} {field.unit}</span>
              {/each}
            </div>
          {/if}
          {#if selectedPrescribedDisplacement}
            <div class="assignment-details" aria-label="Valores do deslocamento prescrito">
              {#each displacementFields as field}
                <span>{field.label}: {selectedPrescribedDisplacement.components[field.key]} {field.unit}</span>
              {/each}
            </div>
          {/if}
        {:else if selectedElement}
          <dl class="node-properties">
            <div>
              <dt>Tipo</dt>
              <dd>{selectedElement.type === 'line1d' ? 'Elemento 1D visual' : 'Quadrilátero 2D de 4 nós'}</dd>
            </div>
            <div><dt>ID</dt><dd>{selectedElement.id}</dd></div>
            <div><dt>Nós</dt><dd>{selectedElement.nodeIds.join(' → ')}</dd></div>
            {#if selectedElement.type === 'line1d'}
              <div><dt>Rigidez/GDL 1D</dt><dd>Não definidos</dd></div>
            {:else}
              <div><dt>GDL nodais</dt><dd>{mesh?.workPlane === 'XY' ? 'ux, uy' : mesh?.workPlane === 'XZ' ? 'ux, uz' : 'uy, uz'}</dd></div>
            {/if}
            <div><dt>Material</dt><dd>{selectedMaterialForElement?.name ?? 'Não atribuído'}</dd></div>
            <div><dt>Seção</dt><dd>{selectedSectionForElement?.name ?? 'Não atribuída'}</dd></div>
            <div><dt>Carga distribuída</dt><dd>Não implementada</dd></div>
          </dl>
          {#if selectedMaterialForElement}
            <div class="assignment-details" aria-label="Propriedades do material atribuído">
              <span>E: {selectedMaterialForElement.elasticModulusGPa} GPa</span>
              <span>v: {selectedMaterialForElement.poissonRatio}</span>
              <span>G: {selectedMaterialForElement.shearModulusGPa} GPa</span>
            </div>
          {/if}
          {#if selectedSectionForElement}
            <div class="assignment-details" aria-label="Propriedades da seção atribuída">
              <span>Espessura: {selectedSectionForElement.thicknessMm} mm</span>
            </div>
          {/if}
        {:else}
          <div class="empty-state">Selecione um nó ou elemento no viewport ou na lista.</div>
        {/if}
      </section>
      <p class="model-feedback" role="status" aria-live="polite">{modelFeedback || 'Pronto.'}</p>
    </aside>

    <aside class="log-panel" aria-label="Painel de logs e diagnósticos">
      <header class="log-header">
        <h2>Logs</h2>
        <div class="log-filters" aria-label="Filtros de log">
          {#each logFilters as filter}
            <button
              type="button"
              class:selected={logFilter === filter.value}
              on:click={() => (logFilter = filter.value)}
            >
              {filter.label}
            </button>
          {/each}
        </div>
      </header>

      {#if filteredLogs.length === 0}
        <div class="empty-state log-empty">Sem eventos registrados</div>
      {:else}
        <ul class="log-list">
          {#each filteredLogs as log}
            <li class={`log-item ${log.level}`}>
              <div class="log-meta">
                <span class="log-badge">{log.level.toUpperCase()}</span>
                <time>{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</time>
              </div>
              <strong>{log.event}</strong>
              <p>{log.message}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    min-height: 100vh;
    font-family: Inter, 'Segoe UI', sans-serif;
    background: #0f172a;
    color: #e2e8f0;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    min-height: 100vh;
    overflow: hidden;
    background: #020817;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1.25rem;
    background: #111827;
    border-bottom: 1px solid #1f2937;
  }

  .brand-block {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .brand-mark {
    display: inline-grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    background: linear-gradient(135deg, #38bdf8, #8b5cf6);
    border-radius: 0.5rem;
    color: #020817;
    font-weight: 800;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .toolbar button,
  .tool-panel button,
  .log-filters button {
    border: 1px solid #334155;
    background: #0f172a;
    color: #e2e8f0;
    border-radius: 0.5rem;
    padding: 0.55rem 0.85rem;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .toolbar button:hover,
  .tool-panel button:hover,
  .view-presets button:hover,
  .log-filters button:hover {
    border-color: #60a5fa;
    background: #111827;
  }

  .toolbar button:disabled {
    border-color: #334155;
    color: #64748b;
    cursor: not-allowed;
    opacity: 0.7;
  }

  .workspace {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) 280px;
    grid-template-rows: minmax(0, 1fr) 230px;
    flex: 1;
    min-height: 0;
  }

  .tool-panel,
  .context-panel,
  .log-panel {
    background: #111827;
    border-right: 1px solid #1f2937;
    padding: 1rem;
  }

  .tool-panel {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  .tool-panel h2,
  .context-panel h2,
  .log-panel h2 {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .tool-panel ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tool-panel button {
    width: 100%;
    text-align: left;
  }

  .tool-panel button.active,
  .log-filters button.selected {
    background: #1d4ed8;
    border-color: #60a5fa;
  }

  .viewport-panel {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 1rem;
    background: #020817;
    border-right: 1px solid #1f2937;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .viewport-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .view-presets {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .view-presets button,
  .viewport-toolbar input,
  .viewport-toolbar select {
    min-height: 2.15rem;
    border: 1px solid #334155;
    border-radius: 0.45rem;
    background: #0f172a;
    color: #e2e8f0;
    padding: 0.35rem 0.55rem;
  }

  .view-presets button {
    cursor: pointer;
  }

  .view-presets button.active {
    background: #1d4ed8;
    border-color: #60a5fa;
  }

  .grid-spacing-control,
  .work-plane-control,
  .snap-control {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: #cbd5e1;
    font-size: 0.8rem;
  }

  .grid-spacing-control input {
    width: 4.8rem;
  }

  .viewport-help {
    color: #94a3b8;
    font-size: 0.72rem;
    line-height: 1.35;
  }

  .context-panel {
    grid-column: 3;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
  }

  .context-panel section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 0 0 auto;
  }

  .model-count {
    margin: 0;
    color: #94a3b8;
    font-size: 0.78rem;
  }

  .readiness-blocked,
  .readiness-ready {
    margin: 0;
    padding: 0.5rem;
    border: 1px solid;
    border-radius: 0.45rem;
    font-size: 0.76rem;
    line-height: 1.4;
  }

  .readiness-blocked {
    border-color: #92400e;
    background: rgba(120, 53, 15, 0.2);
    color: #fcd34d;
  }

  .readiness-ready {
    border-color: #166534;
    background: rgba(20, 83, 45, 0.2);
    color: #86efac;
  }

  .readiness-issues {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding-left: 1.1rem;
    color: #cbd5e1;
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .node-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    list-style: none;
    max-height: 12rem;
    overflow: auto;
    margin: 0;
    padding: 0;
  }

  .node-list button {
    display: flex;
    width: 100%;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.55rem;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    background: #0f172a;
    color: #e2e8f0;
    text-align: left;
    cursor: pointer;
  }

  .node-list button:hover,
  .node-list button.selected-node {
    border-color: #60a5fa;
    background: #172554;
  }

  .node-list button span {
    color: #94a3b8;
    font-size: 0.72rem;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .node-properties {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    font-size: 0.78rem;
  }

  .node-properties div {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .node-properties dt {
    color: #94a3b8;
  }

  .node-properties dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }

  .assignment-details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.3rem;
    padding: 0.5rem;
    border: 1px solid #334155;
    border-radius: 0.45rem;
    background: #0f172a;
    color: #cbd5e1;
    font-size: 0.7rem;
  }

  .assignment-details span {
    overflow-wrap: anywhere;
  }

  .editor-note {
    margin: 0;
    color: #cbd5e1;
    font-size: 0.74rem;
    line-height: 1.4;
  }

  .model-form {
    display: grid;
    gap: 0.55rem;
    padding: 0.65rem;
    border: 1px solid #334155;
    border-radius: 0.65rem;
    background: rgba(15, 23, 42, 0.65);
  }

  .model-form h3 {
    margin: 0;
    color: #e2e8f0;
    font-size: 0.82rem;
  }

  .model-form label {
    display: grid;
    gap: 0.2rem;
    color: #cbd5e1;
    font-size: 0.72rem;
  }

  .model-form input {
    width: 100%;
    min-width: 0;
    padding: 0.42rem;
    color: #e2e8f0;
    background: #020817;
    border: 1px solid #475569;
    border-radius: 0.35rem;
  }

  .model-form button,
  .item-actions button,
  .preset-actions button,
  .primary-action,
  .danger-action {
    padding: 0.42rem 0.55rem;
    border: 1px solid #475569;
    border-radius: 0.4rem;
    background: #0f172a;
    color: #e2e8f0;
    cursor: pointer;
    font-size: 0.72rem;
  }

  .model-form button:hover,
  .item-actions button:hover,
  .preset-actions button:hover,
  .primary-action:hover {
    border-color: #60a5fa;
  }

  .model-form button:disabled,
  .item-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .danger-action {
    border-color: #7f1d1d !important;
    color: #fecaca !important;
  }

  .primary-action {
    width: 100%;
    background: #1d4ed8;
  }

  .preset-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .managed-list {
    display: grid;
    gap: 0.4rem;
    max-height: 15rem;
    overflow: auto;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .managed-item {
    display: grid;
    gap: 0.35rem;
    padding: 0.55rem;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    background: #0f172a;
  }

  .managed-item strong {
    font-size: 0.78rem;
    overflow-wrap: anywhere;
  }

  .managed-item > span {
    color: #94a3b8;
    font-size: 0.7rem;
    overflow-wrap: anywhere;
  }

  .item-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .component-grid,
  .constraint-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.45rem;
  }

  .dof-input {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.35rem;
  }

  .dof-input input[type='checkbox'] {
    width: auto;
    accent-color: #38bdf8;
  }

  .constraint-grid label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem;
    border: 1px solid #334155;
    border-radius: 0.4rem;
    color: #cbd5e1;
    font-size: 0.75rem;
  }

  .model-feedback {
    margin: 0;
    padding: 0.6rem;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    background: rgba(15, 23, 42, 0.7);
    color: #cbd5e1;
    font-size: 0.76rem;
  }

  .node-list button:focus-visible {
    outline: 2px solid #7dd3fc;
    outline-offset: 2px;
  }

  .mesh-notice {
    margin: 0;
    color: #cbd5e1;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .mesh-action {
    width: 100%;
    padding: 0.55rem 0.75rem;
    border: 1px solid #334155;
    border-radius: 0.5rem;
    background: #1d4ed8;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }

  .mesh-action:hover:not(:disabled) {
    background: #2563eb;
  }

  .mesh-action:disabled {
    border-color: #334155;
    background: #1e293b;
    color: #94a3b8;
    cursor: not-allowed;
  }

  .mesh-blocked {
    color: #fbbf24;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .empty-state {
    border: 1px dashed #475569;
    border-radius: 0.75rem;
    padding: 0.85rem;
    color: #94a3b8;
    background: rgba(15, 23, 42, 0.7);
    min-height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .log-panel {
    grid-column: 2 / span 2;
    grid-row: 2;
    border-top: 1px solid #1f2937;
    border-right: none;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .log-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .log-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow: auto;
  }

  .log-item {
    border: 1px solid #334155;
    border-radius: 0.75rem;
    background: rgba(15, 23, 42, 0.75);
    padding: 0.7rem 0.8rem;
  }

  .log-item.debug {
    border-left: 3px solid #38bdf8;
  }

  .log-item.info {
    border-left: 3px solid #34d399;
  }

  .log-item.warn {
    border-left: 3px solid #fbbf24;
  }

  .log-item.error {
    border-left: 3px solid #f87171;
  }

  .log-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .log-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 3.2rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid #475569;
    padding: 0.2rem 0.45rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .log-item time {
    font-size: 0.74rem;
    color: #94a3b8;
  }

  .log-item strong {
    display: block;
    margin-bottom: 0.2rem;
    font-size: 0.82rem;
  }

  .log-item p {
    margin: 0;
    color: #cbd5e1;
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .log-empty {
    min-height: 90px;
  }

  @media (max-width: 980px) {
    .app-shell {
      height: auto;
      overflow: visible;
    }

    .workspace {
      grid-template-columns: 200px minmax(0, 1fr);
      grid-template-rows: minmax(440px, 1fr) auto 230px;
    }

    .context-panel {
      grid-column: 1 / span 2;
      grid-row: 2;
      border-top: 1px solid #1f2937;
    }

    .log-panel {
      grid-column: 1 / span 2;
      grid-row: 3;
    }

    .tool-panel {
      grid-column: 1;
      grid-row: 1;
    }

    .viewport-panel {
      grid-column: 2;
      grid-row: 1;
    }
  }
</style>
