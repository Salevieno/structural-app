# Backend FEM — guia de desenvolvimento

## O que é este backend?

Este diretório contém o núcleo computacional de uma aplicação desktop de análise estrutural pelo Método dos Elementos Finitos (MEF/FEM). O front-end permite construir e visualizar a estrutura; este backend interpreta os dados segundo regras de engenharia, valida o modelo, monta o problema matemático, executa a análise e devolve resultados.

A aplicação é inicialmente um único produto desktop:
- **Front-end:** Svelte + TypeScript + Vite.
- **Desktop/IPC:** Tauri.
- **Domínio e cálculo:** Rust.
- **Persistência:** sem banco de dados no início; arquivos locais poderão ser definidos posteriormente.

O backend deve funcionar e ser testável sem abrir a interface. A lógica FEM não pode depender de Tauri, Svelte, Three.js ou HTML. Tauri será somente um adaptador que chama a biblioteca Rust.

## Responsabilidades

1. Receber solicitações segundo um contrato JSON versionado.
2. Desserializar e validar os dados.
3. Construir a representação interna da estrutura.
4. Identificar os graus de liberdade (DOFs) globais ativos.
5. Validar conectividade, propriedades, cargas, apoios e compatibilidade.
6. Calcular contribuições elementares.
7. Transformar contribuições locais para o sistema global quando necessário.
8. Montar matriz global de rigidez esparsa e vetor de forças.
9. Aplicar condições de contorno e deslocamentos prescritos.
10. Resolver o sistema e recuperar resultados.
11. Devolver resposta JSON estruturada, com sucesso ou diagnóstico de erro.

O backend não desenha a estrutura, não implementa regras de interação visual, não inventa unidades/formulações e não pode retornar números fictícios como análise real.

## Domínio e elementos iniciais

A ordem inicial é intencional:
1. **Treliça 1D:** primeiro elemento para validar domínio, DOFs, rigidez, montagem e solução.
2. **Chapa retangular simples de 4 nós:** primeiro elemento bidimensional, implementado logo após a treliça. O nome/forma não define a teoria de placa. A formulação, DOFs, orientação, integração, cargas e benchmarks precisam ser aprovados antes de implementar a matriz.
3. Vigas e outras famílias de chapa/laje ficam para etapas posteriores.

Não implementar todo o catálogo de elementos de uma vez.

## Conceitos fundamentais

### Estrutura (`structure`)
`structure` representa a estrutura física: nós, elementos, materiais, seções, cargas, deslocamentos prescritos, apoios e atribuições. O módulo raiz chama-se `structure.rs`, **não** `model.rs`.

A estrutura não armazena matriz global montada, estado temporário de solução ou resultados.

### Elementos
Cada família tem formulação própria. Um elemento conhece conectividade, DOFs locais, propriedades exigidas, matriz de rigidez local, vetor equivalente de cargas e recuperação de resultados. Não monta diretamente a matriz global.

### Graus de liberdade
Não impor seis DOFs a todo nó. O mapa global de DOFs deve ser central e derivado das formulações. Um elemento sem resistência em uma componente não deve receber rigidez artificial. DOFs locais (por exemplo, axial) não podem ser confundidos com X/Y/Z globais sem transformação geométrica explícita.

### Montagem e solver
A montagem agrega contribuições em matriz esparsa e vetores globais. O solver recebe o sistema numérico e não conhece treliças, chapas ou vigas. Mantenha uma interface para permitir trocar a biblioteca numérica sem alterar formulações.

### Validação
Separar validação de formato (JSON/tipos/campos) de validação de engenharia (conectividade, DOFs, estabilidade, propriedades, apoios). Uma estrutura visualmente válida pode ser inválida para análise.

## Comunicação com o front-end

A referência oficial é [`docs/DATA_CONTRACTS.md`](docs/DATA_CONTRACTS.md). JSON usa **camelCase**, pois essa é a convenção do front-end. Rust pode usar `snake_case` internamente com Serde (`rename_all = "camelCase"`).

Envelope comum: `contractVersion`, `requestId`, `operation`, `payload`. A resposta repete versão e ID e contém `status`, `result`, `errors` e `warnings`. Não mantenha contratos paralelos camelCase/snake_case. Se o estado interno do front-end divergir, crie um adaptador explícito na fronteira.

## Organização inicial

```text
backend/
├── Cargo.toml
├── README.md
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── protocol.rs
│   ├── structure.rs
│   ├── elements.rs
│   ├── assembly.rs
│   ├── solver.rs
│   ├── analysis.rs
│   └── error.rs
├── tests/
│   └── fixtures/
└── docs/
    ├── BACKEND_SPEC.md
    ├── DATA_CONTRACTS.md
    ├── ARCHITECTURE.md
    ├── ROADMAP.md
    ├── TESTING.md
    └── DECISIONS.md
```

Não crie arquivos vazios para antecipar arquitetura. Quando um módulo crescer, ele poderá declarar submódulos usando `structure.rs` + diretório `structure/`, por exemplo. `mod.rs` não é obrigatório.

## Como trabalhar com Copilot

Leia este README e todos os documentos em `docs/`. Inspecione o código existente antes de alterar. Implemente somente a próxima etapa não concluída do ROADMAP. Se faltar uma decisão de engenharia necessária, pare e pergunte; não improvise. Ao terminar, informe arquivos alterados, comandos, testes, limitações e confirme que não começou a etapa seguinte.

## Estado inicial

Já existiu um protótipo CLI que lê JSON por stdin e escreve resposta por stdout com `serde`/`serde_json`. Ele comprovou a comunicação básica, mas não é o contrato definitivo nem deve conter lógica FEM. Preserve-o como adaptador temporário se ainda funcionar; mova o domínio para `lib.rs`.
