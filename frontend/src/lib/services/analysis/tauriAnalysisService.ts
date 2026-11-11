import { parseResultsFile } from '../resultsImport/index.ts';
import {
  ANALYSIS_COMMANDS,
  type AnalysisOutcome,
  type AnalysisRequest,
  type AnalysisService,
  type AnalysisTauriTransport,
} from './contracts.ts';

export const createTauriAnalysisService = (transport: AnalysisTauriTransport): AnalysisService => {
  return {
    implementation: 'tauri',
    async start(request: AnalysisRequest): Promise<AnalysisOutcome> {
      const payload = await transport.invoke<unknown>(ANALYSIS_COMMANDS.run, { request });
      const validation = parseResultsFile(payload, request.model.nodes.length);
      if (!validation.valid || !validation.data) {
        throw new Error(`Backend returned invalid analysis results: ${validation.errors.join(' ')}`);
      }

      const results = validation.data;
      if (results.status !== 'completed') {
        throw new Error(`Backend analysis finished with status "${results.status}".`);
      }
      if (results.analysisId !== request.analysisId) {
        throw new Error('Backend returned results for an unexpected analysis ID.');
      }
      const expectedNodeIds = new Set(request.model.nodes.map(({ id }) => id));
      const resultNodeIds = new Set(results.nodes.map(({ nodeId }) => nodeId));
      if (resultNodeIds.size !== expectedNodeIds.size || [...expectedNodeIds].some((id) => !resultNodeIds.has(id))) {
        throw new Error('Backend result node IDs do not match the submitted model.');
      }

      return {
        analysisId: request.analysisId,
        status: 'completed',
        completedAt: results.generatedAt,
        simulated: false,
        results,
      };
    },
  };
};
