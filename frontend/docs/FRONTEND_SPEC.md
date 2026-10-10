# Plano de implementação por etapas

Implemente e valide uma etapa antes de começar a próxima. Não gerar toda a aplicação em uma única alteração.

## Etapa 0 — Preparar o ambiente e a base
- Criar o projeto Svelte + TypeScript + Vite.
- Ativar TypeScript estrito e verificar scripts de execução/build.
- Criar layout vazio com áreas reservadas para toolbar, viewport, painel lateral e logs.
- Não integrar Tauri/Rust ainda.

**Aceite:** aplicação inicia localmente, layout renderiza e `npm run check`/build (ou scripts equivalentes) passam.

## Etapa 1 — Logging e estrutura visual
- Implementar logger central tipado.
- Implementar painel de logs com filtro por nível.
- Criar layout e navegação entre ferramentas/painéis.
- Registrar inicialização e erros não tratados relevantes.

**Aceite:** logs aparecem no console e painel; filtro por nível funciona; não há chamadas ad hoc de `console.*` em componentes.

## Etapa 2 — Viewport 3D básico
- Escolher e justificar biblioteca 3D.
- Renderizar grid e eixos.
- Implementar orbit/pan/zoom e vistas predefinidas.
- Configurar espaçamento do grid e snap-to-grid.
- Documentar os controles de interação.

**Aceite:** navegação funciona; grid ajusta; snap altera as posições calculadas no plano de trabalho ativo; mudança de configuração é registrada.

## Etapa 3 — Nós e seleção
- Criar nós por clique no viewport, com plano de trabalho ativo.
- Mostrar nós e selecionar nós/elementos.
- Criar realce de seleção e painel de propriedades básico.
- Definir feedback para duplicatas sem impor tolerância de engenharia não aprovada.

**Aceite:** criar/selecionar nós funciona em vistas relevantes; posições respeitam plano de trabalho e snap; logs registram operações sem spam.

## Etapa 4 — Modelo visual e elementos
- Definir tipos provisórios isolados.
- Criar elementos conectando nós.
- Implementar uma primeira interface de criação de malha, sem inventar algoritmos/formulações não especificados.
- Mostrar conectividade e estado de seleção.

**Aceite:** conectividade visível e dados não ficam duplicados em componentes.

## Etapa 5 — Materiais, seções, cargas e apoios
- CRUD de materiais e seções com campos provisórios claramente identificados.
- Atribuir materiais/seções a elementos.
- Aplicar cargas concentradas, deslocamentos prescritos e apoios a nós.
- Aplicar cargas distribuídas a elementos.
- Mostrar atribuições na viewport e/ou painel.

**Aceite:** atribuições mantêm referências coerentes ao selecionar/editar/remover itens; campos ainda não definidos ficam explicitamente provisórios.

## Etapa 6 — Validação de prontidão
- Criar validador central de completude.
- Exigir nós, elementos e uma malha.
- Exigir material e seção válidos em todos os elementos.
- Exigir pelo menos um apoio aplicado a um nó existente.
- Apresentar todos os problemas encontrados.

**Aceite:** botão habilita/desabilita conforme o modelo e os problemas são explicados; nenhuma análise real é simulada como concluída. Cargas não fazem parte da condição de completude definida para esta etapa. Como a geração de malha ainda não está disponível, a análise permanece bloqueada com esse diagnóstico até uma etapa futura implementá-la.

## Etapa 7 — Contrato de análise e integração Tauri
- Definir contrato de comandos/eventos com o backend Rust.
- Criar `AnalysisService` com implementação simulada e implementação Tauri isoladas.
- Tratar progresso, cancelamento (se suportado), sucesso e falha.

**Aceite:** UI funciona com serviço simulado; integração nativa não está espalhada pelos componentes.

## Etapa 8 — Importação e validação de resultados
- Implementar seleção/leitura de arquivo.
- Separar parsing, validação e atualização de estado.
- Conferir quantidade de nós e, quando possível, IDs/identidade do modelo.
- Preservar resultados anteriores se a nova importação falhar.

**Aceite:** arquivos válidos são aceitos; arquivos inválidos geram diagnóstico compreensível e logs estruturados.

## Etapa 9 — Visualização de resultados
- Mostrar deformada, deslocamentos/rotações, reações e resultados por elemento conforme contrato real.
- Escala de cores, legenda e controles de exibição.
- Diferenciar geometria original e deformada.

**Aceite:** visualizações são vinculadas a resultados validados; dados de demonstração têm marcação explícita.

## Etapa 10 — Empacotamento desktop
- Adicionar Tauri.
- Conectar serviços ao backend Rust.
- Configurar build e empacotamento para Windows primeiro, expandindo depois conforme necessidade.

**Aceite:** aplicativo desktop inicia, erros de integração são logados e instruções de build estão documentadas.

## Regra de conclusão de cada etapa

Ao finalizar, informar:
- arquivos criados/alterados;
- comandos para executar;
- testes realizados e resultado;
- limitações/decisões pendentes;
- confirmação de que a etapa seguinte ainda não foi iniciada.
