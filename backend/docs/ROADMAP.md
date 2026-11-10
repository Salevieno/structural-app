# Roadmap do backend

Implemente e valide uma etapa antes da próxima. Não avance sem autorização.

## Etapa 0 — Fundação
Inspecionar `Cargo.toml`/`main.rs`; separar biblioteca do host desktop; usar `structure.rs`; manter formatação, check e testes Rust sem depender da interface.

**Aceite:** biblioteca compila e o host Tauri a utiliza; sem FEM fictício.

## Etapa 1 — Contrato e protocolo
Implementar envelope camelCase, versão, requestId, operation, payload, resposta success/error, fixtures e testes round-trip. Rejeitar versão/operação desconhecida.

**Aceite:** exemplos do DATA_CONTRACTS são serializados exatamente e requestId é preservado.

## Etapa 2 — Estrutura e validação
Implementar tipos internos de nós, elementos, materiais, seções, cargas, apoios e deslocamentos conforme decisões aprovadas. Validar IDs, referências, finitude, conectividade e propriedades. Sem formulações ainda.

**Aceite:** erros múltiplos com code/path; estrutura válida converte para domínio.

## Etapa 3 — DOF map e montagem mínima
Definir DOFs explícitos; mapear sem impor seis por nó; definir contribuição elementar mínima; montar K/F esparsos; testar mapeamento e acumulação.

**Aceite:** índices rastreáveis, soma correta e nenhuma rigidez artificial.

## Etapa 4 — Treliça 1D
Confirmar escopo plano/3D, DOFs, transformação, propriedades, unidades e sinais. Documentar formulação/benchmark. Implementar rigidez, transformação, assembly e resultados.

**Aceite:** caso analítico reproduzido dentro de tolerância documentada; casos inválidos diagnosticados.

## Etapa 5 — Condições de contorno e solver linear
Implementar apoios e deslocamentos prescritos (inclusive não nulos), solver esparso escolhido, reações, singularidade e equilíbrio.

**Aceite:** treliça ponta a ponta e equilíbrio de forças.

## Etapa 6 — Chapa retangular simples 4 nós
Esta etapa vem imediatamente após treliça. Primeiro aprovar teoria, DOFs, orientação, propriedades, integração, locking, cargas, resultados e benchmarks. **Não implementar matriz sem aprovação.** Depois implementar geometria, ordem anti-horária iniciando inferior esquerdo, funções de forma/derivadas/Jacobiano/integração conforme formulação, assembly e recuperação.

**Aceite:** patch test e benchmarks passam; elemento integrado ao pipeline comum.

## Etapa 7 — Cargas e resultados adicionais
Implementar somente cargas com unidades/direções/distribuição definidas. Resultados nodais e por elemento conforme formulação; preservar IDs/metadados.

**Aceite:** contrato exato, sem valores fictícios.

## Etapa 8 — Tauri
Configurar o host Tauri 2; registrar comandos finos de diagnóstico/análise; tratar erros IPC; progresso/cancelamento somente se suportados ponta a ponta. A análise deve permanecer sem resultados até que o solver real seja implementado.

**Aceite de integração:** o front-end verifica o diagnóstico via IPC; `run_analysis` recebe a solicitação e nunca devolve resultados fictícios. A análise real depende das etapas 1–7 e não foi iniciada nesta integração.

## Etapa 9 — Expansão
Planejar vigas, outros elementos, ordem superior e não linearidade. Criar abstrações apenas quando casos reais justificarem.

**Aceite:** plano documentado, sem antecipar implementação.

## Fechamento de cada etapa
Informar arquivos alterados, resumo, comandos, testes e resultados, pendências/limitações e confirmar que não iniciou a etapa seguinte.
