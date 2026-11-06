import assert from 'node:assert/strict';
import test from 'node:test';
import { createResultsImportService, parseResultsFile } from './index.ts';

const validResults = {
  schema: 'structural-results',
  version: 1,
  projectId: 'proj-001',
  analysisId: 'analysis-001',
  status: 'completed',
  generatedAt: '2026-11-06T12:00:00.000Z',
  summary: { maxDisplacementMm: 2.48, maxRotationRad: 0.0017, reactionCount: 4 },
  nodes: [
    { nodeId: 'N1', uxMm: 0, uyMm: 0, uzMm: 0, txRad: 0, tyRad: 0, tzRad: 0 },
    { nodeId: 'N2', uxMm: 0.2, uyMm: 0.1, uzMm: 0, txRad: 0, tyRad: 0, tzRad: 0 },
  ],
};

test('accepts a valid results file when the node count matches the model', () => {
  const outcome = parseResultsFile(validResults, 2);

  assert.equal(outcome.valid, true);
  assert.equal(outcome.data.analysisId, 'analysis-001');
  assert.deepEqual(outcome.errors, []);
});

test('accepts a results file even when it does not match the currently open model', () => {
  const outcome = parseResultsFile(
    {
      ...validResults,
      schema: 'structural-results',
      nodes: [{ nodeId: 'N1', uxMm: 0 }, { nodeId: 'N2', uxMm: 0.5 }, { nodeId: 'N3', uxMm: 1.1 }],
    },
    2,
  );

  assert.equal(outcome.valid, true);
  assert.equal(outcome.data.analysisId, 'analysis-001');
});

test('rejects malformed JSON through the file-based import service', async () => {
  const service = createResultsImportService();
  const file = new File(['{ invalid json }'], 'results.json', { type: 'application/json' });

  const outcome = await service.importFile(file, 2);

  assert.equal(outcome.valid, false);
  assert.match(outcome.message, /JSON|ler o arquivo/i);
});
