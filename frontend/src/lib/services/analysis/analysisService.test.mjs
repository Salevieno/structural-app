import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYSIS_COMMANDS,
  BACKEND_DIAGNOSTIC_COMMAND,
  BACKEND_DIAGNOSTIC_RESPONSE,
  createAnalysisRequest,
} from './contracts.ts';
import { createTauriAnalysisService } from './tauriAnalysisService.ts';
import { createTauriIntegrationService } from '../tauri/integrationService.ts';

const request = (analysisId) => ({
  contractVersion: 1,
  analysisId,
  model: {
    nodes: [],
    lineElements: [],
    mesh: {
      id: 'mesh-1',
      workPlane: 'XY',
      cellSize: 1,
      boundaryNodeIds: [],
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
    activeWorkPlane: 'XY',
  },
});

const result = (analysisId) => ({
  schema: 'structural-results',
  version: 1,
  projectId: 'project-1',
  analysisId,
  status: 'completed',
  generatedAt: '2026-10-12T00:00:00.000Z',
  summary: { maxDisplacementMm: 0, maxRotationRad: 0, reactionCount: 0 },
  nodes: [],
  displacements: [],
  reactions: [],
  elements: [],
});

class FakeTauriTransport {
  invocations = [];
  response;

  async invoke(command, args) {
    this.invocations.push({ command, args });
    if (command === BACKEND_DIAGNOSTIC_COMMAND) {
      return BACKEND_DIAGNOSTIC_RESPONSE;
    }
    if (command === ANALYSIS_COMMANDS.run) {
      return this.response;
    }
    throw new Error(`Unexpected command: ${command}`);
  }
}

test('request builder makes a detached serializable snapshot with a versioned contract', () => {
  const source = request('snapshot-1');
  const built = createAnalysisRequest(source.model, source.analysisId);

  assert.equal(built.contractVersion, 1);
  assert.notEqual(built.model.nodes, source.model.nodes);
  assert.doesNotThrow(() => JSON.stringify(built));
});

test('Tauri integration diagnostic invokes Rust and verifies its identifiable response', async () => {
  const transport = new FakeTauriTransport();
  const integration = createTauriIntegrationService(transport);

  assert.equal(await integration.diagnose(), BACKEND_DIAGNOSTIC_RESPONSE);
  assert.deepEqual(transport.invocations, [{ command: BACKEND_DIAGNOSTIC_COMMAND, args: {} }]);
});

test('Tauri analysis invokes Rust and returns the validated result document', async () => {
  const transport = new FakeTauriTransport();
  transport.response = result('tauri-1');
  const service = createTauriAnalysisService(transport);
  const outcome = await service.start(request('tauri-1'));

  assert.equal(service.implementation, 'tauri');
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.simulated, false);
  assert.deepEqual(outcome.results, transport.response);
  assert.deepEqual(transport.invocations, [{
    command: ANALYSIS_COMMANDS.run,
    args: { request: request('tauri-1') },
  }]);
});

test('Tauri analysis rejects malformed or unrelated backend results', async () => {
  const transport = new FakeTauriTransport();
  transport.response = result('another-analysis');
  const service = createTauriAnalysisService(transport);

  await assert.rejects(service.start(request('tauri-1')), /unexpected analysis ID/);
  transport.response = { ...result('tauri-1'), nodes: null };
  await assert.rejects(service.start(request('tauri-1')), /invalid analysis results/);

  const modelWithNode = request('tauri-node-check');
  modelWithNode.model.nodes = [{ id: 'node-1', position: { x: 0, y: 0, z: 0 } }];
  transport.response = { ...result('tauri-node-check'), nodes: [{ nodeId: 'other-node' }] };
  await assert.rejects(service.start(modelWithNode), /node IDs do not match/);
});

test('Tauri analysis propagates backend errors without presenting a result', async () => {
  const transport = new FakeTauriTransport();
  transport.response = undefined;
  transport.invoke = async (command, args) => {
    transport.invocations.push({ command, args });
    throw new Error('O solver estrutural ainda não está implementado.');
  };
  const service = createTauriAnalysisService(transport);

  await assert.rejects(service.start(request('tauri-1')), /solver estrutural ainda não está implementado/);
});
