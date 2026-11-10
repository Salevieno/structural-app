import { createTauriAnalysisService } from './tauriAnalysisService.ts';
import {
  BACKEND_DIAGNOSTIC_RESPONSE,
  type AnalysisService,
  type AnalysisTauriTransport,
} from './contracts.ts';
import { createTauriIntegrationService } from '../tauri/integrationService.ts';

export * from './contracts.ts';
export { createTauriAnalysisService } from './tauriAnalysisService.ts';

export interface AnalysisServices {
  analysisService: AnalysisService;
  diagnosticResult: string;
}

export const createDefaultAnalysisService = async (): Promise<AnalysisServices> => {
  const tauriCore = await import('@tauri-apps/api/core');
  if (!tauriCore.isTauri()) {
    throw new Error('A análise estrutural só está disponível no aplicativo Tauri.');
  }

  const transport: AnalysisTauriTransport = {
    invoke: (command, args) => tauriCore.invoke(command, args),
  };
  const diagnosticResult = await createTauriIntegrationService(transport).diagnose();
  if (diagnosticResult !== BACKEND_DIAGNOSTIC_RESPONSE) {
    throw new Error('O backend respondeu um identificador inesperado ao teste de diagnóstico.');
  }

  return {
    analysisService: createTauriAnalysisService(transport),
    diagnosticResult,
  };
};
