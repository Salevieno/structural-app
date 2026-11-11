import {
  BACKEND_DIAGNOSTIC_COMMAND,
  BACKEND_DIAGNOSTIC_RESPONSE,
  type AnalysisTauriTransport,
} from '../analysis/contracts.ts';

export const createTauriIntegrationService = (transport: AnalysisTauriTransport) => ({
  async diagnose(): Promise<string> {
    const result = await transport.invoke<unknown>(BACKEND_DIAGNOSTIC_COMMAND, {});
    if (result !== BACKEND_DIAGNOSTIC_RESPONSE) {
      throw new Error(`Resposta inesperada do diagnóstico do backend: ${String(result)}`);
    }
    return result;
  },
});