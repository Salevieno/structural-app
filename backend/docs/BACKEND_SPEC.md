# BACKEND_SPEC — especificação detalhada

## 1. Objetivo
Construir o backend Rust do aplicativo FEM. Ele recebe uma estrutura serializada, valida domínio e engenharia, executa análises e devolve resultados. A implementação deve evoluir incrementalmente.

Ordem de autoridade: decisões confirmadas pelo usuário; `DATA_CONTRACTS.md` para comunicação; `ARCHITECTURE.md` para divisão interna; este documento para sequência. Não complete lacunas de engenharia por conta própria.

## 2. Requisitos gerais
- Rust estável.
- `serde` com `derive` e `serde_json` para protocolo.
- `thiserror` ou mecanismo equivalente para erros tipados.
- Biblioteca numérica escolhida e versionada em `DECISIONS.md`, após verificar suporte real a matrizes esparsas/fatoração, compatibilidade e licença.
- `lib.rs` contém a API e os comandos finos Tauri; `main.rs` inicia o aplicativo desktop.
- Tipos de domínio não dependem de JSON. DTOs de protocolo são convertidos explicitamente para domínio.
- IDs são estáveis e não dependem da posição em vetores.
- Validar `is_finite()` para coordenadas, propriedades, cargas, deslocamentos e resultados.
- Rejeitar campos desconhecidos na versão atual quando viável, para detectar divergências.
- Nunca usar NaN/Infinity como sinalizador de erro.

## 3. Responsabilidade dos módulos

### `protocol.rs`
DTOs de request/response, versionamento, serialização camelCase, validação do envelope e conversão para domínio. Não contém FEM.

### `structure.rs`
Nós, elementos, materiais, seções, atribuições, cargas, deslocamentos prescritos e apoios. Não contém matriz global, fatoração ou resultados.

### `elements.rs`
Interface mínima comum e formulações concretas. Define requisitos, DOFs elementares, rigidez local, vetor equivalente de carga e recuperação de resultados. Não conhece armazenamento global.

### `assembly.rs`
DOF map, transformação local-global, montagem esparsa de K e F, soma de contribuições e aplicação matematicamente consistente de restrições. Deve manter rastreabilidade índice global ↔ nó/componente.

### `solver.rs`
Recebe sistema numérico pronto e retorna solução ou erro numérico tipado. Não conhece famílias de elementos. Diagnostica singularidade/falha de fatoração quando possível.

### `analysis.rs`
Orquestra validação, DOF map, cálculo elementar, montagem, condições de contorno, solução e recuperação de resultados.

### `error.rs`
Categorias estáveis: protocolo/versão, desserialização, validação de dados, validação de engenharia, formulação não suportada, sistema singular/mecanismo, falha numérica e erro interno.

## 4. Regras de estrutura e DOFs

### Nós e conectividade
Cada nó tem ID único e coordenadas 3D finitas. Elementos têm ID único, tipo e referências a nós existentes. Quantidade e ordem de nós dependem do tipo. Comprimento/área/volume degenerados geram erro. Não deduplicar elementos silenciosamente.

Elementos 2D gerados por malha e elementos 1D criados manualmente podem coexistir no mesmo conjunto.

### DOFs
O usuário definiu que os DOFs relevantes devem ser considerados globalmente e que um elemento sem resistência em determinado DOF não deve ganhar rigidez artificial. Isso não autoriza descartar DOFs ou presumir mapeamentos.

Cada formulação declara:
- DOFs locais e seu significado;
- associação aos DOFs nodais;
- transformação local-global;
- contribuição de rigidez em cada componente.

Não codificar `6 * node_index + dof` como regra universal. Não criar rotações para treliça por conveniência. Não tratar DOF axial como `ux`, `uy` ou `uz` sem transformação. Elementos conectados devem compartilhar deslocamentos físicos compatíveis segundo uma regra matemática explícita.

## 5. Elementos iniciais

### Elemento 1 — Treliça 1D
Antes de implementar, confirmar se o primeiro caso é plano ou espacial, DOFs globais/locais, transformação, unidades, sinais e propriedades exigidas. Não assumir esses detalhes.

Implementar validação geométrica/conectividade, rigidez local, transformação se necessária, integração com assembly e recuperação dos resultados definidos.

Testes: barra com solução analítica; barra inclinada se estiver no escopo; equilíbrio; transformação; comprimento nulo; propriedade ausente/inválida; estrutura com restrição insuficiente deve falhar com diagnóstico.

### Elemento 2 — Chapa retangular simples de 4 nós
Este elemento deve vir imediatamente depois da treliça.

**Bloqueio obrigatório:** “chapa retangular simples” não define teoria, DOFs, interpolação, integração, cisalhamento ou rigidez. Antes de escrever a matriz, solicitar/registrar aprovação de:
- teoria/formulação (não escolher silenciosamente Kirchhoff-Love, Mindlin-Reissner ou outra);
- DOFs nodais e significado;
- hipótese geométrica e orientação do plano;
- propriedades materiais/geométricas;
- interpolação e integração numérica;
- tratamento de shear locking, se aplicável;
- cargas e resultados suportados;
- benchmarks e tolerâncias.

Após aprovação, implementar validação de geometria, ordem de nós, funções de forma/derivadas/Jacobiano/integral conforme formulação, rigidez elementar, integração ao pipeline e recuperação de resultados.

Convenção de conectividade da malha inicial: quatro nós anti-horários, começando pelo canto inferior esquerdo no plano local: inferior esquerdo, inferior direito, superior direito, superior esquerdo. Não assumir alinhamento global X/Y se isso não estiver aprovado.

Testes: retângulo regular e não quadrado; orientação invertida; geometria degenerada; patch test apropriado; benchmark independente; distorção dentro do domínio declarado.

## 6. Materiais, seções, cargas e apoios
Materiais e seções são entidades por ID; elementos referenciam IDs. Validar existência e compatibilidade com o tipo. Cargas nodais e distribuídas são categorias diferentes. Apoio (DOF bloqueado) é diferente de deslocamento prescrito (valor imposto). Não converter unidades implicitamente. Cargas distribuídas ficam bloqueadas até definir unidade, direção, sistema de coordenadas, distribuição espacial e equivalência nodal.

## 7. Condições de contorno e solver
Implementar método matematicamente consistente. Eliminação de DOFs restritos é opção inicial, mas deslocamentos prescritos não nulos exigem correção apropriada do vetor do lado direito. Validar DOF inexistente, restrições conflitantes, mecanismos e singularidade. Recuperar reações conforme convenção aprovada.

Não presumir que a matriz global será sempre SPD: estabilidade, apoios, mecanismos e formulações afetam isso.

## 8. Resultados
Incluir deslocamentos por nó, rotações quando aplicáveis, reações e grandezas por elemento somente quando definidas pela formulação. Preservar IDs. Incluir `analysisId`, `modelRevision` e metadados de contrato. Não enviar matriz global completa ao front-end por padrão.

## 9. Erros
Erros esperados viram `status: "error"` e lista de diagnósticos. Erros inesperados são registrados e convertidos em erro interno seguro. Não usar `process::exit` na biblioteca. Não retornar sucesso se validação/solução falhar. Cada erro tem `code`, `message` e `path` opcional; `details` opcional.

## 10. Conclusão de etapa
Código compila; formatação e testes passam; testes matemáticos pertinentes passam; contrato/documentação atualizados; próxima etapa não iniciada. Copilot informa arquivos, comandos, resultados e pendências.
