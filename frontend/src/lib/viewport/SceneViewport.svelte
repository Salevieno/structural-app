<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { logger } from '../logging';
  import type {
    NodalSupport,
    PrescribedNodalDisplacement,
    StructuralElement1D,
    StructuralNodalLoad,
    StructuralNode,
    StructuralQuadElement2D,
  } from '../domain/model';
  import { getResultColorHex, type ResultDisplayMetric } from '../domain/resultsVisualization';
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
  export let nodalLoads: StructuralNodalLoad[] = [];
  export let prescribedDisplacements: PrescribedNodalDisplacement[] = [];
  export let nodalSupports: NodalSupport[] = [];
  export let resultNodes: Array<{ id: string; position: Position3D }> = [];
  export let resultElements: Array<{ id: string; nodeIds: string[] }> = [];
  export let resultMagnitudeByNode: Array<{ id: string; magnitude: number }> = [];
  export let resultColorScaleMax = 1;
  export let resultColorMetric: ResultDisplayMetric = 'total';
  export let showDeformedShape = false;
  export let showOriginalGeometry = true;
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
  let assignmentGroup: THREE.Group | undefined;
  let deformationGroup: THREE.Group | undefined;
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

  const colorFromMagnitude = (magnitude: number): number => {
    const metricContext = resultColorMetric;
    const metricAdjustment = metricContext === 'ux' ? 0.01 : metricContext === 'uy' ? 0.02 : metricContext === 'uz' ? 0.03 : 0;
    const adjustedMagnitude = Math.max(0, magnitude * (1 + metricAdjustment));
    const colorValue = getResultColorHex(adjustedMagnitude, resultColorScaleMax);
    return new THREE.Color(colorValue).getHex();
  };

  const resultMagnitudeForNode = (nodeId: string): number => {
    const entry = resultMagnitudeByNode.find((item) => item.id === nodeId);
    const candidateMagnitude = entry?.magnitude;
    const magnitude: number = Number.isFinite(candidateMagnitude) ? Number(candidateMagnitude) : 0;
    return magnitude;
  };

  const updateDeformationOverlay = (currentNodes: StructuralNode[], currentResultNodes: Array<{ id: string; position: Position3D }>): void => {
    if (!scene) {
      return;
    }

    if (deformationGroup) {
      scene.remove(deformationGroup);
      deformationGroup.children.forEach((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      deformationGroup.clear();
    }

    deformationGroup = new THREE.Group();
    if (!showDeformedShape || currentResultNodes.length === 0) {
      return;
    }

    const activeDeformationGroup = deformationGroup;
    const sourceNodes = new Map(currentNodes.map((node) => [node.id, node]));
    const renderedResultIds = new Set<string>();
    const resultNodeMap = new Map(currentResultNodes.map((entry) => [entry.id, entry]));

    resultElements.forEach((element) => {
      const nodeIds = element.nodeIds.filter((nodeId): nodeId is string => typeof nodeId === 'string' && Boolean(nodeId));
      if (nodeIds.length < 2) {
        return;
      }

      const resultPoints = nodeIds
        .map((nodeId) => resultNodeMap.get(nodeId))
        .filter((node): node is { id: string; position: Position3D } => Boolean(node));

      if (resultPoints.length < 2) {
        return;
      }

      if (resultPoints.length === 2) {
        const startNode = resultPoints[0];
        const endNode = resultPoints[1];
        if (!startNode || !endNode) {
          return;
        }

        const magnitude = Math.max(
          resultMagnitudeForNode(startNode.id),
          resultMagnitudeForNode(endNode.id),
        );
        const segment = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(startNode.position.x, startNode.position.y, startNode.position.z),
            new THREE.Vector3(endNode.position.x, endNode.position.y, endNode.position.z),
          ]),
          new THREE.LineBasicMaterial({ color: colorFromMagnitude(magnitude), transparent: true, opacity: 0.9 }),
        );
        activeDeformationGroup.add(segment);
        return;
      }

      const points = resultPoints.map((node) => new THREE.Vector3(node.position.x, node.position.y, node.position.z));
      const surfaceGeometry = new THREE.BufferGeometry().setFromPoints(points);
      surfaceGeometry.setIndex([0, 1, 2, 0, 2, 3]);
      surfaceGeometry.computeVertexNormals();
      const magnitude = resultMagnitudeByNode.reduce((max, item) => {
        return nodeIds.includes(item.id) ? Math.max(max, item.magnitude) : max;
      }, 0);
      const surface = new THREE.Mesh(
        surfaceGeometry,
        new THREE.MeshBasicMaterial({
          color: colorFromMagnitude(magnitude),
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      activeDeformationGroup.add(surface);

      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: colorFromMagnitude(magnitude), transparent: true, opacity: 0.95 }),
      );
      activeDeformationGroup.add(outline);
    });

    currentResultNodes.forEach((resultNode) => {
      const originalNode = sourceNodes.get(resultNode.id);
      const original = originalNode
        ? new THREE.Vector3(originalNode.position.x, originalNode.position.y, originalNode.position.z)
        : new THREE.Vector3(resultNode.position.x, resultNode.position.y, resultNode.position.z);
      const target = new THREE.Vector3(resultNode.position.x, resultNode.position.y, resultNode.position.z);

      const magnitude = resultMagnitudeForNode(resultNode.id);
      if (originalNode) {
        const segment = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([original, target]),
          new THREE.LineBasicMaterial({ color: colorFromMagnitude(magnitude), transparent: true, opacity: 0.7 }),
        );
        activeDeformationGroup.add(segment);
      }

      const displacedNode = new THREE.Mesh(
        new THREE.SphereGeometry(originalNode ? 0.14 : 0.18, 16, 12),
        new THREE.MeshBasicMaterial({ color: colorFromMagnitude(magnitude), transparent: true, opacity: 0.9 }),
      );
      displacedNode.position.copy(target);
      activeDeformationGroup.add(displacedNode);
      renderedResultIds.add(resultNode.id);
    });

    if (currentNodes.length === 0) {
      currentResultNodes.forEach((resultNode) => {
        if (renderedResultIds.has(resultNode.id)) {
          return;
        }

        const target = new THREE.Vector3(resultNode.position.x, resultNode.position.y, resultNode.position.z);
        const displacedNode = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 }),
        );
        displacedNode.position.copy(target);
        activeDeformationGroup.add(displacedNode);
      });
    }

    scene.add(activeDeformationGroup);
  };

  const getElementAssignmentColor = (element: { materialId?: string; sectionId?: string }, defaultColor: number): number => {
    const missingMaterial = !element.materialId;
    const missingSection = !element.sectionId;
    if (missingMaterial && missingSection) {
      return 0xef4444;
    }
    if (missingMaterial) {
      return 0xf59e0b;
    }
    if (missingSection) {
      return 0xf97316;
    }
    return defaultColor;
  };

  const createVectorArrow = (
    origin: THREE.Vector3,
    vector: THREE.Vector3,
    color: number,
    lengthScale = 1,
  ): THREE.ArrowHelper | undefined => {
    if (vector.lengthSq() < 1e-8) {
      return undefined;
    }
    const direction = vector.clone().normalize();
    const magnitude = vector.length();
    const arrow = new THREE.ArrowHelper(
      direction,
      origin,
      Math.max(0.6, magnitude * lengthScale),
      color,
      Math.max(0.25, magnitude * 0.22 + 0.18),
      0.2,
    );
    return arrow;
  };

  const createMomentMarker = (origin: THREE.Vector3, vector: THREE.Vector3, color: number): THREE.Group | undefined => {
    if (vector.lengthSq() < 1e-8) {
      return undefined;
    }
    const axis = vector.clone().normalize();
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.04, 8, 22),
      new THREE.MeshBasicMaterial({ color }),
    );
    ring.rotation.x = Math.PI / 2;
    const referenceAxis = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(referenceAxis, axis);
    ring.quaternion.premultiply(quaternion);
    group.add(ring);
    const arrow = createVectorArrow(origin.clone().add(axis.clone().multiplyScalar(0.6)), axis.clone().multiplyScalar(0.35), color, 0.8);
    if (arrow) {
      group.add(arrow);
    }
    group.position.copy(origin);
    return group;
  };

  const addSupportMarkers = (node: StructuralNode, support: NodalSupport): void => {
    if (!assignmentGroup) {
      return;
    }
    const position = new THREE.Vector3(node.position.x, node.position.y, node.position.z);
    const marker = new THREE.Group();
    const supportColor = 0x8b5cf6;
    const axes: Array<{ axis: THREE.Vector3; enabled: boolean }> = [
      { axis: new THREE.Vector3(1, 0, 0), enabled: support.restraints.ux },
      { axis: new THREE.Vector3(0, 1, 0), enabled: support.restraints.uy },
      { axis: new THREE.Vector3(0, 0, 1), enabled: support.restraints.uz },
    ];
    axes.forEach(({ axis, enabled }) => {
      if (!enabled) {
        return;
      }
      const segment = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          axis.clone().multiplyScalar(0.8),
        ]),
        new THREE.LineBasicMaterial({ color: supportColor, linewidth: 2 }),
      );
      marker.add(segment);
    });
    const rotationalAxes: Array<{ axis: THREE.Vector3; enabled: boolean }> = [
      { axis: new THREE.Vector3(1, 0, 0), enabled: support.restraints.tx },
      { axis: new THREE.Vector3(0, 1, 0), enabled: support.restraints.ty },
      { axis: new THREE.Vector3(0, 0, 1), enabled: support.restraints.tz },
    ];
    rotationalAxes.forEach(({ axis, enabled }) => {
      if (!enabled) {
        return;
      }
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.03, 6, 18, Math.PI * 1.5),
        new THREE.MeshBasicMaterial({ color: supportColor }),
      );
      ring.rotation.x = axis.x !== 0 ? Math.PI / 2 : 0;
      ring.rotation.y = axis.y !== 0 ? Math.PI / 2 : 0;
      ring.rotation.z = axis.z !== 0 ? Math.PI / 2 : 0;
      marker.add(ring);
    });
    if (marker.children.length === 0) {
      return;
    }
    marker.position.copy(position);
    assignmentGroup.add(marker);
  };

  const updateAssignments = (
    currentElements: StructuralElement1D[],
    currentMeshElements: readonly StructuralQuadElement2D[],
    currentNodes: StructuralNode[],
  ): void => {
    if (!scene) {
      return;
    }

    if (assignmentGroup) {
      scene.remove(assignmentGroup);
      assignmentGroup.children.forEach((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.ArrowHelper) {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
          if (object instanceof THREE.Line) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => material.dispose());
          }
        }
      });
      assignmentGroup.clear();
    }

    const activeAssignmentGroup = new THREE.Group();
    activeAssignmentGroup.name = 'assignment-feedback';
    assignmentGroup = activeAssignmentGroup;

    const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
    currentElements.forEach((element) => {
      const [startNodeId, endNodeId] = element.nodeIds;
      const startNode = nodesById.get(startNodeId);
      const endNode = nodesById.get(endNodeId);
      if (!startNode || !endNode) {
        return;
      }
      const midpoint = new THREE.Vector3(
        (startNode.position.x + endNode.position.x) / 2,
        (startNode.position.y + endNode.position.y) / 2,
        (startNode.position.z + endNode.position.z) / 2,
      );
      if (!element.materialId || !element.sectionId) {
        const statusColor = getElementAssignmentColor(element, 0x22d3ee);
        const issueMarker = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 12, 10),
          new THREE.MeshBasicMaterial({ color: statusColor }),
        );
        issueMarker.position.copy(midpoint);
        activeAssignmentGroup.add(issueMarker);
      }
    });

    currentMeshElements.forEach((element) => {
      const points = element.nodeIds
        .map((nodeId) => nodesById.get(nodeId))
        .filter((node): node is StructuralNode => Boolean(node))
        .map((node) => new THREE.Vector3(node.position.x, node.position.y, node.position.z));
      if (points.length < 4) {
        return;
      }
      const centroid = points.reduce(
        (sum, point) => sum.add(point),
        new THREE.Vector3(),
      ).divideScalar(points.length);
      if (!element.materialId || !element.sectionId) {
        const statusColor = getElementAssignmentColor(element, 0x34d399);
        const issueMarker = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 12, 10),
          new THREE.MeshBasicMaterial({ color: statusColor }),
        );
        issueMarker.position.copy(centroid);
        activeAssignmentGroup.add(issueMarker);
      }
    });

    nodalLoads.forEach((load) => {
      const node = nodesById.get(load.nodeId);
      if (!node) {
        return;
      }
      const origin = new THREE.Vector3(node.position.x, node.position.y, node.position.z);
      const vector = new THREE.Vector3(load.components.Fx, load.components.Fy, load.components.Fz);
      const arrow = createVectorArrow(origin, vector, 0xef4444, 0.18);
      if (arrow) {
        activeAssignmentGroup.add(arrow);
      }
      const momentVector = new THREE.Vector3(load.components.Mx, load.components.My, load.components.Mz);
      const momentMarker = createMomentMarker(origin.clone().add(new THREE.Vector3(0, 0, 0.4)), momentVector, 0xf97316);
      if (momentMarker) {
        activeAssignmentGroup.add(momentMarker);
      }
    });

    prescribedDisplacements.forEach((item) => {
      const node = nodesById.get(item.nodeId);
      if (!node) {
        return;
      }
      const origin = new THREE.Vector3(node.position.x, node.position.y, node.position.z);
      const vector = new THREE.Vector3(
        item.activeDofs.includes('ux') ? item.components.ux : 0,
        item.activeDofs.includes('uy') ? item.components.uy : 0,
        item.activeDofs.includes('uz') ? item.components.uz : 0,
      );
      const arrow = createVectorArrow(origin, vector, 0x22d3ee, 0.18);
      if (arrow) {
        activeAssignmentGroup.add(arrow);
      }
      const rotationVector = new THREE.Vector3(
        item.activeDofs.includes('tx') ? item.components.tx : 0,
        item.activeDofs.includes('ty') ? item.components.ty : 0,
        item.activeDofs.includes('tz') ? item.components.tz : 0,
      );
      const rotationMarker = createMomentMarker(origin.clone().add(new THREE.Vector3(0, 0, 0.7)), rotationVector, 0x67e8f9);
      if (rotationMarker) {
        activeAssignmentGroup.add(rotationMarker);
      }
    });

    nodalSupports.forEach((support) => {
      const node = nodesById.get(support.nodeId);
      if (!node) {
        return;
      }
      addSupportMarkers(node, support);
    });

    scene.add(activeAssignmentGroup);
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

      const defaultColor = element.id === selectionId ? 0xfbbf24 : 0x22d3ee;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(startNode.position.x, startNode.position.y, startNode.position.z),
          new THREE.Vector3(endNode.position.x, endNode.position.y, endNode.position.z),
        ]),
        new THREE.LineBasicMaterial({
          color: getElementAssignmentColor(element, defaultColor),
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
      const defaultColor = element.id === selectionId ? 0xfbbf24 : 0x34d399;
      const surface = new THREE.Mesh(
        surfaceGeometry,
        new THREE.MeshBasicMaterial({
          color: getElementAssignmentColor(element, defaultColor),
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
          color: getElementAssignmentColor(element, defaultColor),
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
    deformationGroup?.clear();
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

  $: if (nodeGroup) {
    nodeGroup.visible = showOriginalGeometry;
  }

  $: if (elementGroup) {
    elementGroup.visible = showOriginalGeometry;
  }

  $: if (assignmentGroup) {
    assignmentGroup.visible = showOriginalGeometry;
  }

  $: if (scene) {
    updateAssignments(elements, meshElements, nodes);
  }

  $: if (scene) {
    updateDeformationOverlay(nodes, resultNodes);
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
    <div class="assignment-legend" aria-label="Legenda de atribuições visuais">
      <span><i class="legend-load"></i>Carga</span>
      <span><i class="legend-moment"></i>Momento</span>
      <span><i class="legend-displacement"></i>Desloc.</span>
      <span><i class="legend-support"></i>Apoio</span>
      <span><i class="legend-missing"></i>Sem material/seção</span>
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

  .assignment-legend {
    right: 0.75rem;
    top: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem 0.7rem;
    max-width: min(20rem, calc(100% - 1.5rem));
    padding: 0.45rem 0.6rem;
    background: rgba(2, 8, 23, 0.88);
    border: 1px solid #334155;
    border-radius: 0.6rem;
    color: #cbd5e1;
    font-size: 0.72rem;
    pointer-events: none;
  }

  .assignment-legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
  }

  .assignment-legend i {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 0.2rem;
    display: inline-block;
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

  .legend-load {
    background: #ef4444;
  }

  .legend-moment {
    background: #f97316;
  }

  .legend-displacement {
    background: #22d3ee;
  }

  .legend-support {
    background: #8b5cf6;
  }

  .legend-missing {
    background: #f59e0b;
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
