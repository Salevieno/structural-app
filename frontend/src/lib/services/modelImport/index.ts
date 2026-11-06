import type {
  StructuralElement1D,
  StructuralMaterial,
  StructuralMesh2D,
  StructuralNodalLoad,
  StructuralNode,
  StructuralQuadElement2D,
  StructuralSection,
  PrescribedNodalDisplacement,
  NodalSupport,
} from '../../domain/model';
import type { WorkPlane } from '../../viewport/workPlane';

export interface StructuralModelDocument {
  schema: 'structural-model';
  version: 1;
  projectId?: string;
  name?: string;
  generatedAt: string;
  activeWorkPlane: WorkPlane;
  model: {
    nodes: StructuralNode[];
    lineElements: StructuralElement1D[];
    mesh: StructuralMesh2D<StructuralQuadElement2D>;
    materials: StructuralMaterial[];
    sections: StructuralSection[];
    nodalLoads: StructuralNodalLoad[];
    prescribedDisplacements: PrescribedNodalDisplacement[];
    nodalSupports: NodalSupport[];
  };
}

export interface ModelImportOutcome {
  valid: boolean;
  message: string;
  errors: string[];
  data?: StructuralModelDocument;
}

export interface ModelImportService {
  importFile(file: File): Promise<ModelImportOutcome>;
}

const hasArray = (value: unknown): value is unknown[] => Array.isArray(value);

export const parseModelFile = (payload: unknown): ModelImportOutcome => {
  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      message: 'O arquivo de modelo não é um JSON válido.',
      errors: ['O conteúdo do arquivo não é um objeto JSON válido.'],
    };
  }

  const candidate = payload as Record<string, unknown>;
  const errors: string[] = [];

  if (candidate.schema !== 'structural-model') {
    errors.push('O campo "schema" deve ser "structural-model".');
  }

  if (candidate.version !== 1) {
    errors.push('O campo "version" deve ser 1.');
  }

  if (typeof candidate.generatedAt !== 'string' || candidate.generatedAt.trim().length === 0) {
    errors.push('O campo "generatedAt" é obrigatório.');
  }

  if (candidate.activeWorkPlane !== 'XY' && candidate.activeWorkPlane !== 'XZ' && candidate.activeWorkPlane !== 'YZ') {
    errors.push('O campo "activeWorkPlane" deve ser "XY", "XZ" ou "YZ".');
  }

  if (!candidate.model || typeof candidate.model !== 'object') {
    errors.push('O campo "model" é obrigatório.');
  }

  if (candidate.model && typeof candidate.model === 'object') {
    const model = candidate.model as Record<string, unknown>;
    const fields: Array<[string, string]> = [
      ['nodes', 'array'],
      ['lineElements', 'array'],
      ['mesh', 'object'],
      ['materials', 'array'],
      ['sections', 'array'],
      ['nodalLoads', 'array'],
      ['prescribedDisplacements', 'array'],
      ['nodalSupports', 'array'],
    ];

    for (const [field, expected] of fields) {
      const value = model[field];
      if (expected === 'array' && !hasArray(value)) {
        errors.push(`O campo "model.${field}" deve ser um array.`);
      }
      if (expected === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) {
        errors.push(`O campo "model.${field}" deve ser um objeto.`);
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      message: `Arquivo de modelo inválido: ${errors[0]}`,
      errors,
    };
  }

  return {
    valid: true,
    message: 'Arquivo de modelo validado com sucesso.',
    errors: [],
    data: candidate as unknown as StructuralModelDocument,
  };
};

export const createModelImportService = (): ModelImportService => ({
  async importFile(file: File): Promise<ModelImportOutcome> {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      return parseModelFile(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        message: `Não foi possível ler o arquivo de modelo: ${message}`,
        errors: [`JSON inválido ou inacessível: ${message}`],
      };
    }
  },
});
