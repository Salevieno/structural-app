import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANALYSIS_COMMANDS,
  ANALYSIS_EVENTS,
  createAnalysisRequest,
} from './contracts.ts';
import { createMockAnalysisService } from './mockAnalysisService.ts';
import {
  createTauriAnalysisService,
} from './tauriAnalysisService.ts';

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

class FakeTauriTransport {
  listeners = new Map();
  invocations = [];
  autoComplete = true;
  startFailure = false;

  async listen(event, handler) {
    const handlers = this.listeners.get(event) ?? new Set();
    handlers.add(handler);
    this.listeners.set(event, handlers);
    return () => handlers.delete(handler);
  }

  async invoke(command, args) {
    this.invocations.push({ command, args });
    if (command === ANALYSIS_COMMANDS.start) {
      if (this.autoComplete) {
        queueMicrotask(() => {
          if (this.startFailure) {
            this.emit(ANALYSIS_EVENTS.failed, {
              analysisId: args.request.analysisId,
              code: 'invalid-model',
              message: 'Backend rejected the request.',
            });
            return;
          }
          this.emit(ANALYSIS_EVENTS.progress, {
            analysisId: args.request.analysisId,
            progress: 50,
            message: 'Halfway',
          });
          this.emit(ANALYSIS_EVENTS.completed, {
            analysisId: args.request.analysisId,
            completedAt: '2026-10-12T00:00:00.000Z',
          });
        });
      }
      return { analysisId: args.request.analysisId };
    }
    if (command === ANALYSIS_COMMANDS.cancel) {
      this.emit(ANALYSIS_EVENTS.cancelled, {
        analysisId: args.analysisId,
        cancelledAt: '2026-10-12T00:00:00.000Z',
      });
      return undefined;
    }
    throw new Error(`Unexpected command: ${command}`);
  }

  emit(event, payload) {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(payload);
    }
  }
}

test('mock service reports progress and marks completion as simulated', async () => {
  const service = createMockAnalysisService();
  const events = [];
  const outcome = await service.start(request('mock-1'), (event) => events.push(event));

  assert.equal(service.implementation, 'mock');
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.simulated, true);
  assert.deepEqual(events.filter(({ type }) => type === 'progress').map(({ progress }) => progress), [15, 45, 80, 100]);
  assert.equal(events.at(-1)?.type, 'completed');
});

test('mock service supports cancellation without reporting successful completion', async () => {
  const service = createMockAnalysisService();
  const events = [];
  const pending = service.start(request('mock-cancel'), (event) => events.push(event));
  await service.cancel('mock-cancel');
  const outcome = await pending;

  assert.equal(outcome.status, 'cancelled');
  assert.equal(events.at(-1)?.type, 'cancelled');
});

test('request builder makes a detached serializable snapshot with a versioned contract', () => {
  const source = request('snapshot-1');
  const built = createAnalysisRequest(source.model, source.analysisId);

  assert.equal(built.contractVersion, 1);
  assert.notEqual(built.model.nodes, source.model.nodes);
  assert.doesNotThrow(() => JSON.stringify(built));
});

test('Tauri adapter subscribes before invoking and resolves completion events for its request', async () => {
  const transport = new FakeTauriTransport();
  const service = createTauriAnalysisService(transport);
  const events = [];
  const outcome = await service.start(request('tauri-1'), (event) => events.push(event));

  assert.equal(service.implementation, 'tauri');
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.simulated, false);
  assert.equal(transport.invocations[0]?.command, ANALYSIS_COMMANDS.start);
  assert.deepEqual(events.map(({ type }) => type), ['progress', 'completed']);
  assert.ok([...transport.listeners.values()].every((handlers) => handlers.size === 0));
});

test('Tauri adapter sends cancellation through its command and awaits the terminal event', async () => {
  const transport = new FakeTauriTransport();
  transport.autoComplete = false;
  const service = createTauriAnalysisService(transport);
  const pending = service.start(request('tauri-cancel'), () => {});
  await service.cancel('tauri-cancel');
  const outcome = await pending;

  assert.equal(outcome.status, 'cancelled');
  assert.deepEqual(transport.invocations.map(({ command }) => command), [
    ANALYSIS_COMMANDS.start,
    ANALYSIS_COMMANDS.cancel,
  ]);
  assert.ok([...transport.listeners.values()].every((handlers) => handlers.size === 0));
});

test('Tauri adapter propagates backend failures and removes event listeners', async () => {
  const transport = new FakeTauriTransport();
  transport.startFailure = true;
  const service = createTauriAnalysisService(transport);

  await assert.rejects(
    service.start(request('tauri-failed'), () => {}),
    /Backend rejected the request/,
  );
  assert.ok([...transport.listeners.values()].every((handlers) => handlers.size === 0));
});
