# Decisões arquiteturais iniciais

## D-001 — Aplicação desktop única
**Decisão:** a meta é uma única aplicação desktop. Front-end e backend são partes da mesma aplicação, não dois produtos independentes nem necessariamente dois servidores.

**Motivo:** interface rica com acesso local e núcleo numérico em Rust.

## D-002 — Tecnologias
**Decisão inicial:** Svelte + TypeScript + Vite no front-end; Tauri para desktop/IPC; Rust para núcleo de domínio e análise; CHOLMOD como primeira opção de solver esparso.

**Observação:** a integração com CHOLMOD pertence ao backend, não ao front-end. Dependências e licenças devem ser auditadas antes de distribuição.

## D-003 — Sem banco de dados no início
**Decisão:** não adicionar banco de dados nem servidor remoto sem uma necessidade concreta. Arquivos locais serão considerados para projetos/resultados quando seus formatos forem definidos.

## D-004 — Serviços desacoplados da tecnologia de comunicação
**Decisão:** os componentes usam interfaces de serviço. A implementação simulada é usada no desenvolvimento inicial; a implementação Tauri será adicionada depois.

## D-005 — Contratos de engenharia não presumidos
**Decisão:** os formatos definitivos de modelo, DOFs, materiais, seções, cargas, apoios e resultados serão definidos pelo usuário. O front-end não deve fixar prematuramente unidades, sinais ou formulações.

## D-006 — Logging centralizado
**Decisão:** todos os fluxos importantes usam uma API central com níveis debug/info/warn/error, eventos estáveis e contexto estruturado.

## D-007 — Análise não executada no front-end
**Decisão:** o front-end não implementa solver FEM. Pode fazer validação de completude para experiência do usuário, mas o backend permanece responsável pela análise e validações técnicas.

## D-008 — Validação de resultados
**Decisão:** a quantidade de nós dos resultados deve corresponder à quantidade de nós do modelo. Quando o contrato estiver definido, também verificar identidade/IDs e metadados, pois contagens iguais não garantem que os resultados pertençam ao modelo atual.
