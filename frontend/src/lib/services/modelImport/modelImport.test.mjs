import assert from 'node:assert/strict';
import test from 'node:test';
import { createModelImportService, parseModelFile } from './index.ts';

const validModel = {
  schema: 'structural-model',
  version: 1,
  generatedAt: '2026-11-06T12:00:00.000Z',
  activeWorkPlane: 'XY',
  model: {
    nodes: [
      { id: 'N1', position: { x: 0, y: 0, z: 0 } },
      { id: 'N2', position: { x: 1, y: 0, z: 0 } },
    ],
    lineElements: [
      { type: 'line1d', id: 'E1', nodeIds: ['N1', 'N2'] },
    ],
    mesh: {
      id: 'mesh-1',
      workPlane: 'XY',
      cellSize: 1,
      boundaryNodeIds: ['N1', 'N2'],
      generatedNodeIds: [],
      elements: [],
      polygonArea: 0,
      meshedArea: 0,
      omittedArea: 0,
    },
    materials: [],
    sections: [],
    nodalLoads: [],
    prescribedDisplacements: [],
    nodalSupports: [],
  },
};

test('accepts a valid model file and returns the loaded document', () => {
  const outcome = parseModelFile(validModel);

  assert.equal(outcome.valid, true);
  assert.equal(outcome.data.model.nodes.length, 2);
  assert.deepEqual(outcome.errors, []);
});

test('rejects invalid model files without the required structure', () => {
  const outcome = parseModelFile({
    schema: 'structural-model',
    version: 1,
    generatedAt: '2026-11-06T12:00:00.000Z',
    activeWorkPlane: 'XY',
    model: {},
  });

  assert.equal(outcome.valid, false);
  assert.match(outcome.message, /model/i);
  assert.ok(outcome.errors.length > 0);
});

test('reads a model file through the service layer and rejects malformed JSON', async () => {
  const service = createModelImportService();
  const file = new File(['{ invalid json }'], 'model.json', { type: 'application/json' });

  const outcome = await service.importFile(file);

  assert.equal(outcome.valid, false);
  assert.match(outcome.message, /JSON|ler o arquivo/i);
});
