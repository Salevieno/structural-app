import type {
  AnalysisEvent,
  AnalysisOutcome,
  AnalysisRequest,
  AnalysisService,
} from './contracts.ts';

const wait = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Analysis cancelled.', 'AbortError'));
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Analysis cancelled.', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

export const createMockAnalysisService = (): AnalysisService => {
  const activeRuns = new Map<string, AbortController>();

  return {
    implementation: 'mock',
    supportsCancellation: true,
    async start(request: AnalysisRequest, onEvent: (event: AnalysisEvent) => void): Promise<AnalysisOutcome> {
      if (activeRuns.has(request.analysisId)) {
        throw new Error(`Analysis ${request.analysisId} is already running.`);
      }

      const controller = new AbortController();
      activeRuns.set(request.analysisId, controller);
      try {
        const steps = [
          { progress: 15, message: 'Preparando o fluxo demonstrativo.' },
          { progress: 45, message: 'Executando etapa demonstrativa.' },
          { progress: 80, message: 'Finalizando o fluxo demonstrativo.' },
          { progress: 100, message: 'Simulação concluída; nenhum cálculo estrutural foi executado.' },
        ];
        for (const step of steps) {
          await wait(90, controller.signal);
          onEvent({ type: 'progress', analysisId: request.analysisId, ...step });
        }

        const completedAt = new Date().toISOString();
        onEvent({ type: 'completed', analysisId: request.analysisId, completedAt });
        return {
          analysisId: request.analysisId,
          status: 'completed',
          completedAt,
          simulated: true,
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          const cancelledAt = new Date().toISOString();
          onEvent({ type: 'cancelled', analysisId: request.analysisId, cancelledAt });
          return {
            analysisId: request.analysisId,
            status: 'cancelled',
            cancelledAt,
            simulated: true,
          };
        }
        throw error;
      } finally {
        activeRuns.delete(request.analysisId);
      }
    },
    async cancel(analysisId: string): Promise<void> {
      const controller = activeRuns.get(analysisId);
      if (!controller) {
        throw new Error(`No active analysis found for ${analysisId}.`);
      }
      controller.abort();
    },
  };
};
