import {
  ANALYSIS_COMMANDS,
  ANALYSIS_EVENTS,
  type AnalysisAccepted,
  type AnalysisCancelledEvent,
  type AnalysisCompletedEvent,
  type AnalysisEvent,
  type AnalysisFailedEvent,
  type AnalysisOutcome,
  type AnalysisProgressEvent,
  type AnalysisRequest,
  type AnalysisService,
  type AnalysisTauriTransport,
} from './contracts.ts';

const isRecord = (payload: unknown): payload is Record<string, unknown> =>
  typeof payload === 'object' && payload !== null;

const isProgressEvent = (payload: unknown): payload is AnalysisProgressEvent =>
  isRecord(payload) &&
  typeof payload.analysisId === 'string' &&
  typeof payload.progress === 'number' &&
  Number.isFinite(payload.progress) &&
  payload.progress >= 0 &&
  payload.progress <= 100 &&
  typeof payload.message === 'string';

const isCompletedEvent = (payload: unknown): payload is AnalysisCompletedEvent =>
  isRecord(payload) &&
  typeof payload.analysisId === 'string' &&
  typeof payload.completedAt === 'string' &&
  !Number.isNaN(Date.parse(payload.completedAt));

const isFailedEvent = (payload: unknown): payload is AnalysisFailedEvent =>
  isRecord(payload) &&
  typeof payload.analysisId === 'string' &&
  typeof payload.code === 'string' &&
  typeof payload.message === 'string';

const isCancelledEvent = (payload: unknown): payload is AnalysisCancelledEvent =>
  isRecord(payload) &&
  typeof payload.analysisId === 'string' &&
  typeof payload.cancelledAt === 'string' &&
  !Number.isNaN(Date.parse(payload.cancelledAt));

export const createTauriAnalysisService = (transport: AnalysisTauriTransport): AnalysisService => {
  const activeRuns = new Map<string, () => Promise<void>>();

  return {
    implementation: 'tauri',
    supportsCancellation: true,
    async start(request: AnalysisRequest, onEvent: (event: AnalysisEvent) => void): Promise<AnalysisOutcome> {
      if (activeRuns.has(request.analysisId)) {
        throw new Error(`Analysis ${request.analysisId} is already running.`);
      }

      let resolveTerminal!: (outcome: AnalysisOutcome) => void;
      let rejectTerminal!: (error: Error) => void;
      const terminal = new Promise<AnalysisOutcome>((resolve, reject) => {
        resolveTerminal = resolve;
        rejectTerminal = reject;
      });
      let settled = false;
      const finish = (outcome: AnalysisOutcome): void => {
        if (!settled) {
          settled = true;
          resolveTerminal(outcome);
        }
      };
      const fail = (error: Error): void => {
        if (!settled) {
          settled = true;
          rejectTerminal(error);
        }
      };
      const unsubscribers: Array<() => void> = [];
      let requestAccepted = false;
      let cancellationRequested = false;
      const dispose = async (): Promise<void> => {
        await Promise.all(unsubscribers.map((unsubscribe) => unsubscribe()));
        activeRuns.delete(request.analysisId);
      };
      const requestCancellation = async (): Promise<void> => {
        if (settled) return;
        if (!requestAccepted) {
          cancellationRequested = true;
          return;
        }
        await transport.invoke<void>(ANALYSIS_COMMANDS.cancel, { analysisId: request.analysisId });
      };

      const onProgress = (payload: AnalysisProgressEvent): void => {
        if (!isProgressEvent(payload)) {
          fail(new Error('Backend returned invalid analysis progress.'));
          return;
        }
        if (payload.analysisId !== request.analysisId) return;
        onEvent({ type: 'progress', ...payload });
      };
      const onCompleted = (payload: AnalysisCompletedEvent): void => {
        if (!isCompletedEvent(payload)) {
          fail(new Error('Backend returned an invalid analysis completion event.'));
          return;
        }
        if (payload.analysisId !== request.analysisId) return;
        onEvent({ type: 'completed', ...payload });
        finish({
          analysisId: request.analysisId,
          status: 'completed',
          completedAt: payload.completedAt,
          simulated: false,
        });
      };
      const onFailed = (payload: AnalysisFailedEvent): void => {
        if (!isFailedEvent(payload)) {
          fail(new Error('Backend returned an invalid analysis failure event.'));
          return;
        }
        if (payload.analysisId !== request.analysisId) return;
        const error = new Error(payload.message || 'Backend analysis failed.');
        error.name = payload.code || 'AnalysisFailed';
        onEvent({ type: 'failed', ...payload });
        fail(error);
      };
      const onCancelled = (payload: AnalysisCancelledEvent): void => {
        if (!isCancelledEvent(payload)) {
          fail(new Error('Backend returned an invalid analysis cancellation event.'));
          return;
        }
        if (payload.analysisId !== request.analysisId) return;
        onEvent({ type: 'cancelled', ...payload });
        finish({
          analysisId: request.analysisId,
          status: 'cancelled',
          cancelledAt: payload.cancelledAt,
          simulated: false,
        });
      };

      try {
        activeRuns.set(request.analysisId, requestCancellation);
        unsubscribers.push(await transport.listen(ANALYSIS_EVENTS.progress, onProgress));
        unsubscribers.push(await transport.listen(ANALYSIS_EVENTS.completed, onCompleted));
        unsubscribers.push(await transport.listen(ANALYSIS_EVENTS.failed, onFailed));
        unsubscribers.push(await transport.listen(ANALYSIS_EVENTS.cancelled, onCancelled));

        const accepted = await transport.invoke<AnalysisAccepted>(ANALYSIS_COMMANDS.start, { request });
        if (accepted.analysisId !== request.analysisId) {
          throw new Error('Backend accepted an unexpected analysis ID.');
        }
        requestAccepted = true;
        if (cancellationRequested) {
          await requestCancellation();
        }
        return await terminal;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Tauri analysis request failed: ${message}`, { cause: error });
      } finally {
        await dispose();
      }
    },
    async cancel(analysisId: string): Promise<void> {
      const requestCancellation = activeRuns.get(analysisId);
      if (!requestCancellation) {
        throw new Error(`No active analysis found for ${analysisId}.`);
      }
      await requestCancellation();
    },
  };
};
