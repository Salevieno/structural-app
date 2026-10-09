# Padrão de logging

## Objetivo

Logs consistentes e úteis para entender o que acontece em todas as operações. Centralizar a API em `src/lib/logging/`; não espalhar chamadas diretas a `console.*` pela aplicação.

## Níveis

- `debug`: detalhes de desenvolvimento, decisões de interação e dados resumidos.
- `info`: início/fim de operações relevantes e mudanças normais de estado.
- `warn`: entrada suspeita, ação bloqueada, configuração incomum ou recuperação possível.
- `error`: operação que falhou e exige atenção.

Não usar `error` para validações esperadas que o usuário pode corrigir; em geral, `warn` ou resultado de validação é mais apropriado.

## Formato

Cada entrada deve ser um objeto estruturado, preferencialmente com:

```ts
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;        // ISO 8601
  level: LogLevel;
  event: string;             // nome estável, ex.: "model.node.create"
  message: string;           // texto legível
  context?: Record<string, unknown>;
  correlationId?: string;    // relaciona eventos de uma operação
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
}
```

O formato pode evoluir, mas mantenha os campos comuns e use nomes de evento estáveis.

## API central

Criar uma API pequena, por exemplo:

```ts
logger.debug("viewport.grid.changed", "Espaçamento do grid alterado", {
  spacing: 1
});

logger.info("model.node.create", "Nó criado", {
  nodeId: "temporary-id",
  position: { x: 0, y: 0, z: 0 }
});

logger.warn("analysis.start.blocked", "Análise bloqueada por validação", {
  issueCount: 3
});

logger.error("results.import.failed", "Falha ao importar resultados", {
  fileName: "results.json"
}, error);
```

A assinatura final pode variar, mas deve ser consistente e tipada. Os exemplos usam IDs fictícios e não definem o contrato de domínio.

## Destinos

Na fase inicial:
- console de desenvolvimento;
- painel de logs dentro da aplicação, com filtro por nível e busca textual quando implementado.

A integração desktop poderá encaminhar logs para arquivo local em etapa posterior. Não presumir que `console` será persistido automaticamente em arquivo.

## Regras

- Registrar início, conclusão e falha de operações demoradas/importantes.
- Incluir contexto útil: ferramenta, ID do item, quantidade de itens, duração, nome do arquivo, etapa.
- Em falhas, preservar mensagem e stack quando disponível.
- Evitar registrar matrizes grandes, buffers, modelos inteiros ou milhares de eventos repetitivos.
- Para ações em lote, registrar um resumo e, quando necessário, contagens de sucesso/falha.
- Não emitir o mesmo erro em cada camada. A camada que consegue tratar a falha deve registrar ou propagar; evitar logs duplicados.
- Não engolir erros silenciosamente.
- A UI deve separar mensagem amigável de detalhes técnicos.
- Em produção, permitir reduzir logs `debug`; não remover os níveis `info`, `warn` e `error`.

## Eventos iniciais sugeridos

- `app.started`
- `viewport.camera.changed`
- `viewport.grid.changed`
- `viewport.snap.changed`
- `model.node.create.started`, `model.node.create.completed`, `model.node.create.failed`
- `model.selection.changed`
- `model.validation.completed`
- `analysis.start.requested`, `analysis.start.blocked`, `analysis.started`, `analysis.completed`, `analysis.failed`
- `results.import.started`, `results.import.validation_failed`, `results.import.completed`, `results.import.failed`
