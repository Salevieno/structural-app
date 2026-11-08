# Instruções permanentes do Copilot — backend FEM

Antes de alterar código, leia `README.md`, `docs/BACKEND_SPEC.md`, `docs/DATA_CONTRACTS.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/TESTING.md` e `docs/DECISIONS.md`.

## Regras obrigatórias
- Implemente somente a etapa explicitamente solicitada; não antecipe etapas.
- Inspecione os arquivos reais antes de modificá-los. Preserve funcionalidades válidas.
- O módulo raiz chama-se `structure.rs`, nunca `model.rs`.
- JSON externo usa exclusivamente `camelCase`; Rust interno pode usar `snake_case` via Serde.
- Não crie campos/aliases sem atualizar contrato, fixtures e testes.
- Domínio FEM e testes independem de Tauri e da UI.
- Não imponha seis DOFs a todo nó; não invente mapeamentos entre DOFs locais e globais.
- Não adicione rigidez artificial para mascarar DOF sem resistência, mecanismo ou singularidade.
- Não invente unidades, sinais, eixos locais ou formulações de elementos.
- Formulação ainda não aprovada é bloqueio: pergunte antes de codificar a matriz.
- Não retorne dados simulados como análise real bem-sucedida.
- Valide números finitos; JSON não aceita NaN/Infinity.
- Use erros tipados e contextualizados; evite `unwrap()`/`expect()` em entrada do usuário.
- Não adicione dependências sem justificar necessidade, compatibilidade e licença.
- Não crie múltiplos solvers para comparação. Siga `DECISIONS.md`.
- Use Rust estável; não exija nightly sem autorização.

## Verificação
Execute `cargo fmt --check`, `cargo check` e os testes pertinentes. Compilação não comprova correção matemática. Elementos precisam de testes analíticos/benchmarks independentes. Ao concluir, liste arquivos, comandos, testes, pendências e confirme que não iniciou a próxima etapa.
