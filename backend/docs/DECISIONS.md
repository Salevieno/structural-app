# Registro de decisões

## D-001 — Aplicação desktop única
Front-end Svelte + TypeScript + Vite; Tauri para desktop/IPC; Rust para domínio e cálculo.

## D-002 — Sem banco inicialmente
Não adicionar banco de dados ou servidor remoto sem necessidade concreta.

## D-003 — Backend independente de Tauri
Domínio, análise e testes funcionam como biblioteca Rust. Tauri é adaptador.

## D-004 — Nome do módulo
Usar `structure.rs`; não usar `model.rs` como módulo raiz.

## D-005 — JSON camelCase
Contrato externo camelCase; Rust interno pode usar snake_case com Serde.

## D-006 — DOFs
Não impor seis DOFs a todos os nós nem rigidez artificial. Compatibilidade deve seguir formulação física.

## D-007 — Ordem dos elementos
Treliça 1D primeiro; chapa retangular simples de quatro nós imediatamente depois. Formulação da chapa precisa ser aprovada antes da rigidez.

## D-008 — Malha 2D
Quadrilateral inicial de quatro nós, anti-horário começando no inferior esquerdo no plano local. Elementos 2D gerados coexistem com elementos 1D manuais.

## Pendências que Copilot não pode decidir sozinho
- P-001: escopo plano/3D e transformação da treliça.
- P-002: teoria, DOFs, hipóteses, integração, shear locking, cargas, resultados e benchmarks da chapa.
- P-003: sistema de unidades, convenção de sinais e eixos locais/globais.
- P-004: campos/unidades definitivos de materiais e seções.
- P-005: biblioteca/versão do solver esparso após auditoria de suporte, licença e compatibilidade.
