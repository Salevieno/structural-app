import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeformedNodePositions,
  getResultDisplacementMagnitudeMm,
  resolveResultDisplayScale,
} from './resultsVisualization.ts';

const nodes = [
  { id: 'N1', position: { x: 0, y: 0, z: 0 }, origin: 'user' },
  { id: 'N2', position: { x: 2, y: 0, z: 0 }, origin: 'user' },
];

test('rescales the deformed shape to fit the imported result magnitude', () => {
  assert.equal(resolveResultDisplayScale(0), 1);
  assert.equal(resolveResultDisplayScale(2.5), 2.5);
  assert.equal(resolveResultDisplayScale(8), 1);
  assert.equal(resolveResultDisplayScale(12), 0.5);
});

test('applies nodal displacements to the deformed model without changing unmatched nodes', () => {
  const deformed = buildDeformedNodePositions(nodes, [{ nodeId: 'N2', uxMm: 1, uyMm: 0.5, uzMm: 0 }], 2);
  const n1 = deformed.find((node) => node.id === 'N1');
  const n2 = deformed.find((node) => node.id === 'N2');

  assert.deepEqual(n1.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(n2.position, { x: 4, y: 1, z: 0 });
});

test('computes the displacement magnitude used for the result color scale', () => {
  const entry = { uxMm: 1.5, uyMm: 2, uzMm: -0.5 };
  assert.equal(getResultDisplacementMagnitudeMm(entry, 'total'), Math.hypot(1.5, 2, -0.5));
  assert.equal(getResultDisplacementMagnitudeMm(entry, 'ux'), 1.5);
  assert.equal(getResultDisplacementMagnitudeMm(entry, 'uy'), 2);
  assert.equal(getResultDisplacementMagnitudeMm(entry, 'uz'), 0.5);
});

test('creates a temporary preview layout when the imported results are visualized before the model is loaded', () => {
  const preview = buildDeformedNodePositions([], [{ nodeId: 'R1', uxMm: 1 }, { nodeId: 'R2', uxMm: 2 }], 1);

  assert.equal(preview.length, 2);
  assert.equal(preview[0].id, 'R1');
  assert.ok(Number.isFinite(preview[0].position.x));
  assert.ok(Number.isFinite(preview[1].position.y));
});

test('prefers the imported final node coordinates when the results document contains absolute positions', () => {
  const preview = buildDeformedNodePositions([], [{
    nodeId: 'R1',
    position: { x: 0, y: 0, z: 0 },
  }, {
    nodeId: 'R2',
    position: { x: 2.1, y: 0.2, z: 0 },
  }], 1);

  assert.deepEqual(preview[0].position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(preview[1].position, { x: 2.1, y: 0.2, z: 0 });
});
