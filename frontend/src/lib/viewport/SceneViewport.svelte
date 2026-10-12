<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { logger } from '../logging';
  import type { StructuralElement1D, StructuralNode, StructuralQuadElement2D } from '../domain/model';
  import type { CameraView } from './types';
  import { snapPositionToGrid, type Position3D, type WorkPlane } from './workPlane';

  type EditingTool =
    | 'select'
    | 'nodes'
    | 'elements'
    | 'mesh'
    | 'materials'
    | 'sections'
    | 'loads'
    | 'supports';

  export let spacing = 1;
  export let snapToGrid = true;
  export let workPlane: WorkPlane = 'XY';
  export let cameraView: CameraView = 'isometric';
  export let activeTool: EditingTool = 'select';
  export let nodes: StructuralNode[] = [];
  export let elements: StructuralElement1D[] = [];
  export let meshElements: readonly StructuralQuadElement2D[] = [];
  export let selectedNodeId: string | undefined = undefined;
  export let selectedElementId: string | undefined = undefined;
  export let connectionNodeIds: string[] = [];
  export let onNodeCreate: ((position: Position3D) => void) | undefined = undefined;
  export let onElementNodePick: ((nodeId: string) => void) | undefined = undefined;
  export let onSelectionChange: ((nodeId: string | undefined) => void) | undefined = undefined;
  export let onElementSelectionChange: ((elementId: string | undefined) => void) | undefined = undefined;
  export let onInteractionNotice: ((message: string) => void) | undefined = undefined;

  let canvasElement: HTMLCanvasElement;
  let scene: THREE.Scene | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let controls: OrbitControls | undefined;
  let grid: THREE.LineSegments | undefined;
  let nodeGroup: THREE.Group | undefined;
  let elementGroup: THREE.Group | undefined;
  let previewMarker: THREE.Mesh | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let animationFrameId = 0;
  let cameraLogTimeout: number | undefined;
  let appliedSpacing = spacing;
  let appliedWorkPlane = workPlane;
  let appliedCameraView = cameraView;
  let viewportError = '';
  let rawPointerPosition: Position3D | undefined;
  let pointerPosition: Position3D | undefined;
  let lastPointerCoordinates: { x: number; y: number } | undefined;

  const viewDirections: Record<CameraView, { direction: THREE.Vector3; up: THREE.Vector3 }> = {
    top: { direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
    bottom: { direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, -1, 0) },
    front: { direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
    back: { direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
    left: { direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
    right: { direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
    isometric: {
      direction: new THREE.Vector3(1, -1, 1).normalize(),
      up: new THREE.Vector3(0, 0, 1),
    },
  };

  const createGrid = (): THREE.LineSegments => {
    const segments: THREE.Vector3[] = [];
    const extent = 20;
    const lineCount = Math.floor((extent * 2) / spacing);

    for (let index = 0; index <= lineCount; index += 1) {
      const coordinate = -extent + index * spacing;
      switch (workPlane) {
        case 'XY':
          segments.push(
            new THREE.Vector3(coordinate, -extent, 0),
            new THREE.Vector3(coordinate, extent, 0),
            new THREE.Vector3(-extent, coordinate, 0),
            new THREE.Vector3(extent, coordinate, 0),
          );
          break;
        case 'XZ':
          segments.push(
            new THREE.Vector3(coordinate, 0, -extent),
            new THREE.Vector3(coordinate, 0, extent),
            new THREE.Vector3(-extent, 0, coordinate),
            new THREE.Vector3(extent, 0, coordinate),
          );
          break;
        case 'YZ':
          segments.push(
            new THREE.Vector3(0, coordinate, -extent),
            new THREE.Vector3(0, coordinate, extent),
            new THREE.Vector3(0, -extent, coordinate),
            new THREE.Vector3(0, extent, coordinate),
          );
          break;
      }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(segments);
    const material = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.7 });
    return new THREE.LineSegments(geometry, material);
  };

  const createAxes = (): THREE.Group => {
    const axes = new THREE.Group();
    const axisDefinitions: Array<{ direction: THREE.Vector3; color: number }> = [
      { direction: new THREE.Vector3(1, 0, 0), color: 0xf87171 },
      { direction: new THREE.Vector3(0, 1, 0), color: 0x4ade80 },
      { direction: new THREE.Vector3(0, 0, 1), color: 0x60a5fa },
    ];

    axisDefinitions.forEach(({ direction, color }) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        direction.clone().multiplyScalar(20),
      ]);
      axes.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color })));
    });

    return axes;
  };

  const applyCameraView = (view: CameraView): void => {
    if (!camera || !controls) {
      return;
    }

    const { direction, up } = viewDirections[view];
    const distance = 32;
    camera.up.copy(up);
    camera.position.copy(direction).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    appliedCameraView = view;
    logger.info('viewport.camera.changed', 'Vista do viewport alterada', { view });
  };

  const updateGrid = (): void => {
    if (!scene) {
      return;
    }

    if (grid) {
      scene.remove(grid);
      grid.geometry.dispose();
      const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
      materials.forEach((material) => material.dispose());
    }

    grid = createGrid();
    scene.add(grid);
    appliedSpacing = spacing;
    appliedWorkPlane = workPlane;
  };

  const updateNodes = (currentNodes: StructuralNode[], selectionId: string | undefined): void => {
    if (!nodeGroup) {
      return;
    }

    nodeGroup.children.forEach((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    nodeGroup.clear();
    currentNodes.forEach((node) => {
      const isSelected = node.id === selectionId;
      const isConnectionStart = connectionNodeIds.includes(node.id);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(isSelected || isConnectionStart ? 0.24 : 0.18, 20, 14),
        new THREE.MeshBasicMaterial({
          color: isSelected ? 0xfbbf24 : isConnectionStart ? 0xa78bfa : 0x38bdf8,
        }),
      );
      mesh.position.set(node.position.x, node.position.y, node.position.z);
      mesh.userData.nodeId = node.id;
      nodeGroup?.add(mesh);
    });
  };

  const updateElements = (
    currentElements: StructuralElement1D[],
    currentMeshElements: readonly StructuralQuadElement2D[],
    currentNodes: StructuralNode[],
    selectionId: string | undefined,
  ): void => {
    if (!elementGroup) {
      return;
    }

    elementGroup.children.forEach((object) => {
      if (object instanceof THREE.Line || object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    elementGroup.clear();

    const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
    currentElements.forEach((element) => {
      const [startNodeId, endNodeId] = element.nodeIds;
      const startNode = nodesById.get(startNodeId);
      const endNode = nodesById.get(endNodeId);
      if (!startNode || !endNode) {
        return;
      }

      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(startNode.position.x, startNode.position.y, startNode.position.z),
          new THREE.Vector3(endNode.position.x, endNode.position.y, endNode.position.z),
        ]),
        new THREE.LineBasicMaterial({
          color: element.id === selectionId ? 0xfbbf24 : 0x22d3ee,
          linewidth: element.id === selectionId ? 3 : 2,
        }),
      );
      line.userData.elementId = element.id;
      elementGroup?.add(line);
    });
    currentMeshElements.forEach((element) => {
      const elementNodes = element.nodeIds.map((nodeId) => nodesById.get(nodeId));
      if (elementNodes.some((node) => !node)) {
        return;
      }
      const points = elementNodes.map((node) => {
        if (!node) return new THREE.Vector3();
        return new THREE.Vector3(node.position.x, node.position.y, node.position.z);
      });
      const surfaceGeometry = new THREE.BufferGeometry().setFromPoints(points);
      surfaceGeometry.setIndex([0, 1, 2, 0, 2, 3]);
      surfaceGeometry.computeVertexNormals();
      const surface = new THREE.Mesh(
        surfaceGeometry,
        new THREE.MeshBasicMaterial({
          color: element.id === selectionId ? 0xfbbf24 : 0x34d399,
          transparent: true,
          opacity: element.id === selectionId ? 0.32 : 0.16,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      surface.userData.elementId = element.id;
      elementGroup?.add(surface);
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: element.id === selectionId ? 0xfbbf24 : 0x34d399,
          linewidth: element.id === selectionId ? 3 : 2,
        }),
      );
      outline.userData.elementId = element.id;
      elementGroup?.add(outline);
    });
  };

  const getPlane = (): THREE.Plane => {
    const normal =
      workPlane === 'XY'
        ? new THREE.Vector3(0, 0, 1)
        : workPlane === 'XZ'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0);

    return new THREE.Plane(normal, 0);
  };

  const intersectWorkPlane = (ray: THREE.Ray): THREE.Vector3 | undefined => {
    const plane = getPlane();
    if (Math.abs(ray.direction.dot(plane.normal)) < 1e-6) {
      return undefined;
    }

    const intersection = ray.intersectPlane(plane, new THREE.Vector3());
    return intersection &&
      Number.isFinite(intersection.x) &&
      Number.isFinite(intersection.y) &&
      Number.isFinite(intersection.z)
      ? intersection
      : undefined;
  };

  const updatePointerPreviewAt = (clientX: number, clientY: number): void => {
    if (!camera || !renderer || !previewMarker) {
      return;
    }

    const bounds = renderer.domElement.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }
    const pointer = new THREE.Vector2(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);

    const intersection = intersectWorkPlane(raycaster.ray);
    if (!intersection) {
      previewMarker.visible = false;
      rawPointerPosition = undefined;
      pointerPosition = undefined;
      return;
    }

    rawPointerPosition = { x: intersection.x, y: intersection.y, z: intersection.z };
    const displayedPoint = snapToGrid
      ? snapPositionToGrid(rawPointerPosition, spacing, workPlane)
      : rawPointerPosition;
    previewMarker.position.set(displayedPoint.x, displayedPoint.y, displayedPoint.z);
    previewMarker.visible = true;
    pointerPosition = displayedPoint;
  };

  const updatePointerPreview = (event: PointerEvent): void => {
    lastPointerCoordinates = { x: event.clientX, y: event.clientY };
    updatePointerPreviewAt(event.clientX, event.clientY);
  };

  let pointerStart:
    | { pointerId: number; clientX: number; clientY: number; button: number }
    | undefined;

  const handlePointerDown = (event: PointerEvent): void => {
    pointerStart = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
    };
  };

  const pickNode = (clientX: number, clientY: number): string | undefined => {
    if (!camera || !renderer || !nodeGroup) {
      return undefined;
    }

    const bounds = renderer.domElement.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return undefined;
    }
    const pointer = new THREE.Vector2(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const [pickedNode] = raycaster.intersectObjects(nodeGroup.children, false);
    return typeof pickedNode?.object.userData.nodeId === 'string'
      ? pickedNode.object.userData.nodeId
      : undefined;
  };

  const pickElement = (clientX: number, clientY: number): string | undefined => {
    if (!camera || !renderer || !elementGroup) {
      return undefined;
    }

    const bounds = renderer.domElement.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return undefined;
    }
    const pointer = new THREE.Vector2(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 0.2 };
    raycaster.setFromCamera(pointer, camera);
    const [pickedElement] = raycaster.intersectObjects(elementGroup.children, false);
    return typeof pickedElement?.object.userData.elementId === 'string'
      ? pickedElement.object.userData.elementId
      : undefined;
  };

  const handlePointerUp = (event: PointerEvent): void => {
    const start = pointerStart;
    pointerStart = undefined;
    if (!start || start.pointerId !== event.pointerId) {
      return;
    }

    const pointerMoved = Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > 4;
    if (pointerMoved) {
      scheduleCameraLog(start.button === 2 ? 'pan' : 'orbit');
      return;
    }
    if (start.button !== 0) {
      return;
    }

    if (
      activeTool === 'select' ||
      activeTool === 'materials' ||
      activeTool === 'sections' ||
      activeTool === 'loads' ||
      activeTool === 'supports'
    ) {
      const nodeId = pickNode(event.clientX, event.clientY);
      if (nodeId && (activeTool === 'select' || activeTool === 'loads' || activeTool === 'supports')) {
        onSelectionChange?.(nodeId);
        return;
      }
      if (activeTool === 'loads') {
        onInteractionNotice?.(
          'Cargas concentradas são aplicadas a nós. Cargas distribuídas em elementos serão implementadas posteriormente.',
        );
        return;
      }
      if (activeTool === 'supports') {
        return;
      }
      const elementId = pickElement(event.clientX, event.clientY);
      if (elementId || activeTool === 'select') {
        onSelectionChange?.(undefined);
        onElementSelectionChange?.(elementId);
      }
      return;
    }

    if (activeTool === 'elements') {
      const nodeId = pickNode(event.clientX, event.clientY);
      if (nodeId) {
        onElementNodePick?.(nodeId);
      } else {
        onInteractionNotice?.('Para criar uma conexão, selecione nós existentes no viewport.');
      }
      return;
    }

    if (activeTool !== 'nodes' || !camera || !renderer || !onNodeCreate) {
      return;
    }

    const bounds = renderer.domElement.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) {
      return;
    }
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const intersection = intersectWorkPlane(raycaster.ray);
    if (!intersection) {
      const message = `O plano ${workPlane} está visto de lado nesta câmera. Escolha uma vista adequada ou outro plano de trabalho.`;
      onInteractionNotice?.(message);
      logger.warn('viewport.work_plane.not_visible', 'Não é possível projetar o clique no plano ativo', {
        workPlane,
        cameraView,
      });
      return;
    }

    const rawPosition: Position3D = {
      x: intersection.x,
      y: intersection.y,
      z: intersection.z,
    };
    const position = snapToGrid ? snapPositionToGrid(rawPosition, spacing, workPlane) : rawPosition;
    logger.info('model.node.create.started', 'Criação de nó solicitada', {
      workPlane,
      snapToGrid,
      spacing,
    });
    onNodeCreate(position);
  };

  const scheduleCameraLog = (interaction: 'orbit' | 'pan' | 'zoom'): void => {
    if (cameraLogTimeout !== undefined) {
      window.clearTimeout(cameraLogTimeout);
    }
    cameraLogTimeout = window.setTimeout(() => {
      logger.info('viewport.camera.changed', 'Câmera do viewport navegada', { interaction });
      cameraLogTimeout = undefined;
    }, 350);
  };

  const handleWheel = (): void => {
    scheduleCameraLog('zoom');
  };

  const resizeViewport = (): void => {
    if (!camera || !renderer || !canvasElement.parentElement) {
      return;
    }

    const { width, height } = canvasElement.parentElement.getBoundingClientRect();
    if (width <= 0 || height <= 0) {
      return;
    }

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  onMount(() => {
    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a);

      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      camera.up.set(0, 0, 1);

      renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(0, 0, 0);

      scene.add(createAxes());
      updateGrid();

      nodeGroup = new THREE.Group();
      nodeGroup.name = 'structural-nodes';
      scene.add(nodeGroup);
      updateNodes(nodes, selectedNodeId);

      elementGroup = new THREE.Group();
      elementGroup.name = 'provisional-elements';
      scene.add(elementGroup);
      updateElements(elements, meshElements, nodes, selectedElementId);

      previewMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
      );
      previewMarker.visible = false;
      scene.add(previewMarker);

      resizeObserver = new ResizeObserver(resizeViewport);
      const viewportElement = canvasElement.parentElement;
      if (!viewportElement) {
        throw new Error('O canvas do viewport não possui um elemento contêiner.');
      }
      resizeObserver.observe(viewportElement);
      resizeViewport();
      applyCameraView(cameraView);
      logger.info('viewport.initialization.completed', 'Viewport 3D inicializado', {
        renderer: 'three.js',
        workPlane,
        spacing,
      });

      const render = (): void => {
        if (!scene || !camera || !renderer || !controls) {
          return;
        }
        animationFrameId = window.requestAnimationFrame(render);
        controls.update();
        renderer.render(scene, camera);
      };
      render();
    } catch (error: unknown) {
      viewportError = 'Não foi possível iniciar a renderização 3D neste ambiente.';
      const initializationError =
        error instanceof Error ? error : new Error('Erro desconhecido ao inicializar o viewport.');
      logger.error(
        'viewport.initialization.failed',
        'Falha ao inicializar o viewport 3D',
        { renderer: 'three.js' },
        initializationError,
      );
    }
  });

  onDestroy(() => {
    window.cancelAnimationFrame(animationFrameId);
    if (cameraLogTimeout !== undefined) {
      window.clearTimeout(cameraLogTimeout);
    }
    resizeObserver?.disconnect();
    controls?.dispose();
    scene?.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    renderer?.dispose();
  });

  $: if (scene && (spacing !== appliedSpacing || workPlane !== appliedWorkPlane)) {
    updateGrid();
    if (lastPointerCoordinates) {
      updatePointerPreviewAt(lastPointerCoordinates.x, lastPointerCoordinates.y);
    }
  }

  $: if (nodeGroup) {
    updateNodes(nodes, selectedNodeId);
  }

  $: if (elementGroup) {
    updateElements(elements, meshElements, nodes, selectedElementId);
  }

  $: if (previewMarker && rawPointerPosition) {
    const position = snapToGrid
      ? snapPositionToGrid(rawPointerPosition, spacing, workPlane)
      : rawPointerPosition;
    previewMarker.position.set(position.x, position.y, position.z);
    pointerPosition = position;
  }

  $: if (camera && cameraView !== appliedCameraView) {
    applyCameraView(cameraView);
  }

  $: if (previewMarker) {
    previewMarker.visible = pointerPosition !== undefined;
  }
</script>

<div class="viewport-canvas" aria-label="Cena 3D estrutural">
  <canvas
    bind:this={canvasElement}
    aria-label={activeTool === 'nodes'
      ? 'Viewport 3D. Clique no plano de trabalho para criar um nó.'
      : activeTool === 'select'
        ? 'Viewport 3D. Clique em um nó para selecioná-lo; arraste com o botão esquerdo para orbitar, botão direito para mover e use a roda para zoom.'
        : activeTool === 'elements'
          ? 'Viewport 3D. Clique em dois nós existentes para criar uma conexão visual provisória.'
          : activeTool === 'materials' || activeTool === 'sections'
            ? 'Viewport 3D. Clique em uma conexão para selecionar e atribuir materiais ou seções.'
            : activeTool === 'loads'
              ? 'Viewport 3D. Clique em um nó para selecionar e aplicar cargas concentradas ou deslocamentos.'
              : activeTool === 'supports'
                ? 'Viewport 3D. Clique em um nó para selecionar e atribuir apoios.'
                : 'Viewport 3D. A ferramenta selecionada não interage com o viewport nesta etapa.'}
    on:pointermove={updatePointerPreview}
    on:pointerdown={handlePointerDown}
    on:pointerup={handlePointerUp}
    on:wheel={handleWheel}
  ></canvas>
  {#if viewportError}
    <p class="viewport-error" role="alert">{viewportError}</p>
  {:else}
    <div class="position-readout" aria-live="polite">
      {#if pointerPosition}
        <span>Prévia no plano {workPlane}</span>
        <code>
          X {pointerPosition.x.toFixed(2)} · Y {pointerPosition.y.toFixed(2)} · Z {pointerPosition.z.toFixed(2)}
        </code>
      {:else}
        <span>Mova o ponteiro sobre o plano de trabalho para pré-visualizar uma posição</span>
      {/if}
    </div>
    <div class="axis-legend" aria-label="Legenda dos eixos">
      <span><i class="axis-x"></i>X</span>
      <span><i class="axis-y"></i>Y</span>
      <span><i class="axis-z"></i>Z</span>
    </div>
  {/if}
</div>

<style>
  .viewport-canvas {
    position: relative;
    flex: 1 1 0;
    width: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px dashed #475569;
    border-radius: 1rem;
    background: #0f172a;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    touch-action: none;
  }

  .position-readout,
  .axis-legend,
  .viewport-error {
    position: absolute;
    background: rgba(2, 8, 23, 0.88);
    border: 1px solid #334155;
    border-radius: 0.6rem;
    color: #cbd5e1;
    font-size: 0.75rem;
    pointer-events: none;
  }

  .position-readout {
    left: 0.75rem;
    bottom: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.55rem 0.7rem;
  }

  .position-readout code {
    color: #fbbf24;
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  }

  .axis-legend {
    top: 0.75rem;
    left: 0.75rem;
    display: flex;
    gap: 0.65rem;
    padding: 0.45rem 0.6rem;
  }

  .axis-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .axis-legend i {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
  }

  .axis-x {
    background: #f87171;
  }

  .axis-y {
    background: #4ade80;
  }

  .axis-z {
    background: #60a5fa;
  }

  .viewport-error {
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: min(28rem, calc(100% - 2rem));
    padding: 1rem;
    color: #fecaca;
    text-align: center;
  }
</style>
