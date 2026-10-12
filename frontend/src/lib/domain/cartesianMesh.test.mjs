import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMeshRegenerationImpact,
  generateCartesianQuadMesh,
  getMeshGenerationBlockReason,
  isMeshCurrent,
  MeshGenerationError,
} from './cartesianMesh.ts';

const node = (id, x, y, z = 0) => ({ id, position: { x, y, z } });

const square = [
  node('bottom-left', 0, 0),
  node('bottom-right', 2, 0),
  node('top-right', 2, 2),
  node('top-left', 0, 2),
];

test('quad4 ordering is anti-clockwise starting at the lower-left node', () => {
  const result = generateCartesianQuadMesh(square, 1, 'XY');
  const { mesh } = result;
  const nodesById = new Map([
    ...square.map((entry) => [entry.id, entry]),
    ...result.generatedNodes.map((entry) => [entry.id, entry]),
  ]);
  const first = mesh.elements[0];
  assert.ok(first);
  const points = first.nodeIds.map((id) => nodesById.get(id).position);
  assert.deepEqual(points.map(({ x, y }) => [x, y]), [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]);
});

test('reorders manually created boundary nodes independently of creation order', () => {
  const shuffled = [square[2], square[0], square[3], square[1]];
  const result = generateCartesianQuadMesh(shuffled, 1, 'XY');
  const meshFromOriginalOrder = generateCartesianQuadMesh(square, 1, 'XY').mesh;
  assert.deepEqual(result.mesh.boundaryNodeIds, ['bottom-left', 'bottom-right', 'top-right', 'top-left']);
  assert.deepEqual(result.mesh.elements.map(({ id }) => id), meshFromOriginalOrder.elements.map(({ id }) => id));
  assert.equal(isMeshCurrent(result.mesh, square, 1, 'XY'), true);
});

test('reports the missing mesh prerequisites for disabled-button guidance', () => {
  assert.match(getMeshGenerationBlockReason([], 1, 'XY'), /pelo menos três nós/);
  assert.match(getMeshGenerationBlockReason(square, 3, 'XY'), /Nenhuma célula inteira/);
  assert.equal(getMeshGenerationBlockReason(square, 1, 'XY'), undefined);
});

test('generates cells fully inside a convex polygon and detects omitted area', () => {
  const triangle = [node('a', 0, 0), node('b', 2, 0), node('c', 0, 2)];
  const result = generateCartesianQuadMesh(triangle, 1, 'XY');
  assert.equal(result.mesh.elements.length, 1);
  assert.equal(result.mesh.polygonArea, 2);
  assert.equal(result.mesh.meshedArea, 1);
  assert.equal(result.mesh.omittedArea, 1);
  assert.equal(result.omittedRegionDetected, true);
});

test('handles floating point extents aligned to the selected cell size', () => {
  const decimalSquare = [
    node('a', 0, 0),
    node('b', 0.3, 0),
    node('c', 0.3, 0.3),
    node('d', 0, 0.3),
  ];
  const result = generateCartesianQuadMesh(decimalSquare, 0.1, 'XY');
  assert.equal(result.mesh.elements.length, 9);
  assert.equal(result.omittedRegionDetected, false);
});

test('disables automatic sorting for concave contours instead of generating an alternate polygon', () => {
  const concave = [
    node('a', 0, 0),
    node('b', 3, 0),
    node('c', 3, 1),
    node('d', 1, 1),
    node('e', 1, 3),
    node('f', 0, 3),
  ];
  assert.match(getMeshGenerationBlockReason(concave, 1, 'XY'), /aceita apenas contornos convexos/);
  assert.throws(
    () => generateCartesianQuadMesh(concave, 1, 'XY'),
    (error) => error instanceof MeshGenerationError && error.code === 'invalid-polygon',
  );
});

test('rejects concave notched contours even when their bounding box spans a whole cell', () => {
  const concave = [
    node('a', 0, 0),
    node('b', 4, 0),
    node('c', 4, 1),
    node('d', 1, 1),
    node('e', 1, 3),
    node('f', 4, 3),
    node('g', 4, 4),
    node('h', 0, 4),
  ];
  assert.throws(
    () => generateCartesianQuadMesh(concave, 4, 'XY'),
    (error) => error instanceof MeshGenerationError && error.code === 'invalid-polygon',
  );
});

test('reports zero-element meshes and rejects invalid contours', () => {
  const narrow = [node('a', 0, 0), node('b', 0.5, 0), node('c', 0.5, 0.5), node('d', 0, 0.5)];
  assert.throws(
    () => generateCartesianQuadMesh(narrow, 1, 'XY'),
    (error) => error instanceof MeshGenerationError && error.code === 'zero-elements',
  );
  const duplicatePoint = [
    node('a', 0, 0),
    node('b', 2, 0),
    node('c', 2, 2),
    node('d', 0, 0),
  ];
  assert.throws(
    () => generateCartesianQuadMesh(duplicatePoint, 0.25, 'XY'),
    (error) => error instanceof MeshGenerationError && error.code === 'invalid-polygon',
  );
});

test('supports XZ and YZ work planes without changing the node-order convention', () => {
  const xz = [
    node('a', 0, 0, 0),
    node('b', 2, 0, 0),
    node('c', 2, 0, 2),
    node('d', 0, 0, 2),
  ];
  const result = generateCartesianQuadMesh(xz, 2, 'XZ');
  assert.deepEqual(result.mesh.elements[0].nodeIds, ['a', 'b', 'c', 'd']);
  assert.equal(result.mesh.workPlane, 'XZ');
});

test('detects dependencies on generated nodes and removed assigned quadrilaterals', () => {
  const oldMesh = generateCartesianQuadMesh(square, 1, 'XY').mesh;
  const nextMesh = generateCartesianQuadMesh(square, 2, 'XY').mesh;
  const centerNodeId = oldMesh.generatedNodeIds[0];
  const assignedElement = { ...oldMesh.elements[0], materialId: 'm1' };
  const impact = findMeshRegenerationImpact(
    { ...oldMesh, elements: [assignedElement, ...oldMesh.elements.slice(1)] },
    nextMesh,
    {
      lineElements: [{ type: 'line1d', id: 'line-1', nodeIds: ['bottom-left', centerNodeId] }],
      loads: [{ nodeId: centerNodeId, components: { Fx: 1, Fy: 0, Fz: 0, Mx: 0, My: 0, Mz: 0 } }],
      displacements: [],
      supports: [],
    },
  );
  assert.ok(impact.removedNodeIds.includes(centerNodeId));
  assert.ok(impact.dependencies.some((item) => item.includes('elemento 1D line-1')));
  assert.ok(impact.dependencies.some((item) => item.includes(`carga concentrada em ${centerNodeId}`)));
  assert.ok(impact.dependencies.some((item) => item.includes('atribuições do elemento 2D')));
});
