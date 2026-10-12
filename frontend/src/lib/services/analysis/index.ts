import { createMockAnalysisService } from './mockAnalysisService.ts';
import { createTauriAnalysisService } from './tauriAnalysisService.ts';
import type { AnalysisService, AnalysisTauriTransport } from './contracts.ts';

export * from './contracts.ts';
export { createMockAnalysisService } from './mockAnalysisService.ts';
export { createTauriAnalysisService } from './tauriAnalysisService.ts';

export const createDefaultAnalysisService = async (): Promise<AnalysisService> => {
  const tauriCore = await import('@tauri-apps/api/core');
  if (!tauriCore.isTauri()) {
    return createMockAnalysisService();
  }

  const tauriEvents = await import('@tauri-apps/api/event');
  const transport: AnalysisTauriTransport = {
    invoke: (command, args) => tauriCore.invoke(command, args),
    listen: async <T,>(event: string, handler: (payload: T) => void) => {
      const unlisten = await tauriEvents.listen<T>(event, ({ payload }) => handler(payload));
      return () => {
        unlisten();
      };
    },
  };
  return createTauriAnalysisService(transport);
};
