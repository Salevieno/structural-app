export type StructuralResultsStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface StructuralResultsDisplacement {
  nodeId: string;
  uxMm?: number;
  uyMm?: number;
  uzMm?: number;
  txRad?: number;
  tyRad?: number;
  tzRad?: number;
}

export interface StructuralResultsPosition {
  x: number;
  y: number;
  z: number;
}

export interface StructuralResultsNode {
  nodeId: string;
  position?: StructuralResultsPosition;
  displacement?: StructuralResultsDisplacement;
  uxMm?: number;
  uyMm?: number;
  uzMm?: number;
  txRad?: number;
  tyRad?: number;
  tzRad?: number;
}

export interface StructuralResultsSummary {
  maxDisplacementMm?: number;
  maxRotationRad?: number;
  reactionCount?: number;
}

export interface StructuralResultsDocument {
  schema: 'structural-results';
  version: 1;
  projectId: string;
  analysisId: string;
  status: StructuralResultsStatus;
  generatedAt: string;
  summary?: StructuralResultsSummary;
  nodes: StructuralResultsNode[];
  displacements?: StructuralResultsDisplacement[];
  reactions?: Array<Record<string, number | string>>;
  elements?: Array<Record<string, number | string | boolean>>;
}

export interface ResultsImportOutcome {
  valid: boolean;
  message: string;
  errors: string[];
  data?: StructuralResultsDocument;
}

export interface ResultsImportService {
  importFile(file: File, expectedNodeCount?: number): Promise<ResultsImportOutcome>;
}

const numericResultFields: Array<keyof StructuralResultsDisplacement> = [
  'uxMm',
  'uyMm',
  'uzMm',
  'txRad',
  'tyRad',
  'tzRad',
];

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const parseResultsFile = (
  payload: unknown,
  expectedNodeCount?: number,
): ResultsImportOutcome => {
  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      message: 'O arquivo de resultados não é um JSON válido.',
      errors: ['O conteúdo do arquivo não é um objeto JSON válido.'],
    };
  }

  const candidate = payload as Record<string, unknown>;
  const errors: string[] = [];

  if (candidate.schema !== 'structural-results') {
    errors.push('O campo "schema" deve ser "structural-results".');
  }

  if (candidate.version !== 1) {
    errors.push('O campo "version" deve ser 1.');
  }

  if (typeof candidate.projectId !== 'string' || candidate.projectId.trim().length === 0) {
    errors.push('O campo "projectId" é obrigatório.');
  }

  if (typeof candidate.analysisId !== 'string' || candidate.analysisId.trim().length === 0) {
    errors.push('O campo "analysisId" é obrigatório.');
  }

  if (candidate.status !== 'running' && candidate.status !== 'completed' && candidate.status !== 'failed' && candidate.status !== 'cancelled') {
    errors.push('O campo "status" deve ser "running", "completed", "failed" ou "cancelled".');
  }

  if (typeof candidate.generatedAt !== 'string' || candidate.generatedAt.trim().length === 0) {
    errors.push('O campo "generatedAt" é obrigatório.');
  }

  if (!Array.isArray(candidate.nodes)) {
    errors.push('O campo "nodes" deve ser um array.');
  }

  if (candidate.displacements !== undefined && candidate.displacements !== null && !Array.isArray(candidate.displacements)) {
    errors.push('O campo "displacements" deve ser um array, quando informado.');
  }

  if (Array.isArray(candidate.nodes)) {
    for (const [index, node] of candidate.nodes.entries()) {
      if (!node || typeof node !== 'object') {
        errors.push(`O nó na posição ${index} não é um objeto válido.`);
        continue;
      }

      const typedNode = node as Record<string, unknown>;
      const nodeId = typedNode.nodeId;
      if (typeof nodeId !== 'string' || nodeId.trim().length === 0) {
        errors.push(`O nó na posição ${index} não possui "nodeId" válido.`);
        continue;
      }

      const position = typedNode.position;
      if (position !== undefined && (typeof position !== 'object' || position === null || Array.isArray(position))) {
        errors.push(`A posição do nó ${nodeId} deve ser um objeto com x, y e z.`);
      }

      if (position && typeof position === 'object' && !Array.isArray(position)) {
        const positionRecord = position as Record<string, unknown>;
        for (const axis of ['x', 'y', 'z']) {
          if (!(axis in positionRecord) || !isFiniteNumber(positionRecord[axis])) {
            errors.push(`A posição do nó ${nodeId} deve conter um valor numérico finito em "${axis}".`);
          }
        }
      }

      for (const field of numericResultFields) {
        if (field in typedNode && !isFiniteNumber(typedNode[field])) {
          errors.push(`O campo "${String(field)}" do nó ${String(nodeId ?? `#${index}`)} deve ser numérico finito.`);
        }
      }
    }
  }

  if (Array.isArray(candidate.displacements)) {
    for (const [index, displacement] of candidate.displacements.entries()) {
      if (!displacement || typeof displacement !== 'object') {
        errors.push(`O deslocamento na posição ${index} não é um objeto válido.`);
        continue;
      }

      const typedNode = displacement as Record<string, unknown>;
      const nodeId = typedNode.nodeId;
      if (typeof nodeId !== 'string' || nodeId.trim().length === 0) {
        errors.push(`O deslocamento na posição ${index} não possui "nodeId" válido.`);
        continue;
      }

      for (const field of numericResultFields) {
        if (field in typedNode && !isFiniteNumber(typedNode[field])) {
          errors.push(`O campo "${String(field)}" do deslocamento ${nodeId} deve ser numérico finito.`);
        }
      }
    }
  }

  if (candidate.summary !== undefined && candidate.summary !== null && typeof candidate.summary === 'object') {
    const summary = candidate.summary as Record<string, unknown>;
    for (const [key, value] of Object.entries(summary)) {
      if (key === 'maxDisplacementMm' || key === 'maxRotationRad') {
        if (!isFiniteNumber(value)) {
          errors.push(`O campo "${key}" do resumo deve ser numérico finito.`);
        }
      }
      if (key === 'reactionCount' && typeof value !== 'number') {
        errors.push('O campo "reactionCount" do resumo deve ser numérico.');
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      message: `Arquivo de resultados inválido: ${errors[0]}`,
      errors,
    };
  }

  return {
    valid: true,
    message: 'Arquivo de resultados validado com sucesso.',
    errors: [],
    data: candidate as unknown as StructuralResultsDocument,
  };
};

export const createResultsImportService = (): ResultsImportService => ({
  async importFile(file: File, expectedNodeCount?: number): Promise<ResultsImportOutcome> {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      return parseResultsFile(payload, expectedNodeCount);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        message: `Não foi possível ler o arquivo de resultados: ${message}`,
        errors: [`JSON inválido ou inacessível: ${message}`],
      };
    }
  },
});
