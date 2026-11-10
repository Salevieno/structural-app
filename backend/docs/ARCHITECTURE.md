# Arquitetura do backend

## Fluxo
```text
Tauri IPC
    -> commands (diagnóstico / análise)
    -> biblioteca Rust
    -> análise e solver (a implementar)
    -> resultados
```

## Dependências
- `protocol`: Serde, DTOs e conversores; não contém FEM.
- `structure`: tipos de domínio e invariantes.
- `elements`: formulações; depende de structure e matemática.
- `assembly`: depende de elementos/estrutura e abstração numérica.
- `solver`: recebe matrizes/vetores; não conhece elementos.
- `analysis`: coordena os serviços.
- `error`: erros compartilhados.
- `main`: entrada do aplicativo Tauri.
- `lib`: API pública.

Evitar ciclos. Mover tipos compartilhados para o módulo que conceitualmente os possui.

## Organização física
Começar com `main.rs`, `lib.rs`, `protocol.rs`, `structure.rs`, `elements.rs`, `assembly.rs`, `solver.rs`, `analysis.rs` e `error.rs`. Quando crescer, `structure.rs` pode declarar submódulos em `structure/`; não renomear para `model.rs`. Não criar diretórios/arquivos vazios antecipadamente.

## DTO e domínio
DTO representa JSON; domínio representa engenharia. Conversão valida e gera erros. Não espalhar Serde por todos os tipos internos sem justificativa.

## DOF map
Deve permitir consultar índice global de um DOF físico de um nó, listar DOFs ativos, obter DOFs globais de um elemento e mapear índice global de volta para nó/componente. Ativação vem das formulações. Transformações locais-globais são responsabilidade explícita. Não assumir seis DOFs por nó.

## Matriz global
Usar armazenamento esparso na produção. Matriz densa pode ser usada em testes pequenos, isolada. Somar contribuições repetidas, validar dimensões e finitude, preservar simetria quando aplicável. Não inserir rigidez fictícia nem modificar matriz para esconder mecanismo.

## Solver
Abstração recebe sistema pronto e retorna solução/erro. A expectativa de K simétrica positiva definida vale somente quando hipóteses e restrições garantem isso. Mecanismos, apoios insuficientes e não linearidade podem produzir sistema singular/indefinido.

## Tauri
Tauri 2 inicia a aplicação desktop e registra `backend_diagnostic` e `run_analysis` na biblioteca. O diagnóstico retorna um marcador verificável. Enquanto o solver não estiver implementado, `run_analysis` valida a versão, o ID e os nós da solicitação e retorna o fixture `frontend/docs/structural-results-example.json`, adaptando os IDs e posições dos nós ao modelo enviado. Esses valores são mock para integração de interface e não representam uma análise FEM.
