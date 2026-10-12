# Plano de implementação por etapas

Implemente e valide uma etapa por vez. Não implemente toda a aplicação em uma única alteração. Ao concluir uma etapa, pare e informe os resultados antes de iniciar a seguinte.

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
- Criar elementos 1D conectando dois nós escolhidos pelo usuário.
- Preparar a arquitetura para elementos de malha 2D gerados automaticamente, sem inventar algoritmos/formulações não especificados.
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

**Aceite:** botão habilita/desabilita conforme o modelo e os problemas são explicados; nenhuma análise real é simulada como concluída. Cargas não fazem parte da condição de completude definida para esta etapa. Antes da geração de malha, a análise pode permanecer bloqueada com diagnóstico explícito.

## Etapa 7 — Geração de malha 2D e regras de graus de liberdade
- O contorno é formado por todos os nós criados manualmente; a ordem de criação não importa. Ordenar os pontos angularmente ao redor do centroide, corrigir a orientação para anti-horária e iniciar pelo ponto inferior esquerdo. Como a ordenação não consegue determinar a borda côncava com segurança sem conectividade explícita, aceitar apenas contornos convexos e informar claramente quando o conjunto de pontos for côncavo ou inválido. O fechamento é implícito. Elementos 1D não definem o contorno.
- Desabilitar a geração quando faltarem requisitos básicos para formar pelo menos uma célula, exibindo junto ao botão o motivo específico e atualizando-o conforme nós, plano e espaçamento mudem.
- A malha usa o plano de trabalho ativo e o espaçamento do grid como tamanho das células.
- Implementar geração automática de malha cartesiana a partir de um único contorno 2D: polígono simples, fechado, planar, sem furos ou regiões múltiplas.
- Nesta versão, gerar apenas elementos quadriláteros de 4 nós.
- Ordem dos nós de cada quadrilátero: anti-horária, começando no canto inferior esquerdo: 1 inferior esquerdo, 2 inferior direito, 3 superior direito, 4 superior esquerdo.
- Incluir apenas células inteiramente contidas no polígono. Não basta verificar se os quatro vértices estão dentro: a célula inteira deve estar contida, inclusive em regiões côncavas.
- Detectar e informar quando a malha gerar zero elementos ou quando regiões estreitas do contorno forem omitidas pela regra de inclusão.
- Manter os elementos 1D distintos dos elementos 2D da malha. O usuário cria elementos 1D selecionando dois nós; esses nós podem ser do contorno ou nós internos produzidos pela malha.
- Não fixar seis graus de liberdade em todos os nós. Os graus de liberdade disponíveis pertencem ao modelo/nó e são definidos por uma regra central de domínio; cada tipo de elemento contribui rigidez apenas aos graus de liberdade que possui.
- Provisoriamente, quadriláteros no plano XY disponibilizam ux/uy; no XZ, ux/uz; no YZ, uy/uz. Elementos 1D visuais não definem graus de liberdade nesta etapa. Revisar esses conjuntos quando os tipos/formulações dos elementos forem definidos.
- Deslocamentos prescritos precisam indicar explicitamente quais componentes estão ativos para distinguir uma atribuição de valor zero de uma componente não atribuída.
- Uma carga/deslocamento em um grau de liberdade globalmente válido não deve ser rejeitada só porque um dos elementos conectados não possui rigidez nesse grau de liberdade. Rejeitar atribuições a graus de liberdade inválidos para o nó/modelo, com mensagem clara; nunca ignorar silenciosamente uma atribuição.
- Não tentar resolver nesta etapa mecanismos ou singularidades da matriz global. Registrar como limitação: graus de liberdade sem rigidez global e modelos instáveis precisam ser detectados/diagnosticados pelo backend numérico.
- Projetar tipos e interfaces para permitir adicionar futuramente quadriláteros de 8 nós (cantos + meios das arestas) e 9 nós (cantos + meios das arestas + nó interno), sem implementá-los agora.
- Regenerar a malha não pode apagar silenciosamente elementos 1D, cargas, apoios ou atribuições que dependam de nós/elementos removidos. Se houver dependências afetadas, bloquear a operação ou pedir confirmação explícita e explicar o impacto.
- Adicionar testes automatizados para ordenação dos nós, células dentro/fora de polígonos convexos e côncavos, malha vazia, e preservação/detecção de dependências ao regenerar.

**Aceite:** contorno válido gera quadriláteros de 4 nós com conectividade e orientação consistentes; casos inválidos ou sem células geram diagnóstico claro; elementos 1D continuam distintos; graus de liberdade e atribuições são validados centralmente; `npm run check`, build e testes relevantes passam.

## Etapa 8 — Contrato de análise e integração Tauri
- Definir contrato de comandos/eventos com o backend Rust.
- Criar `AnalysisService` com implementação simulada e implementação Tauri isoladas.
- Tratar progresso, cancelamento (se suportado), sucesso e falha.
- Não espalhar chamadas Tauri pelos componentes.

**Aceite:** UI funciona com serviço simulado; integração nativa fica isolada.

## Etapa 9 — Importação e validação de resultados
- Implementar seleção/leitura de arquivo.
- Separar parsing, validação e atualização de estado.
- Conferir quantidade de nós e, quando possível, IDs/identidade do modelo.
- Preservar resultados anteriores se a nova importação falhar.

**Aceite:** arquivos válidos são aceitos; arquivos inválidos geram diagnóstico compreensível e logs estruturados.

## Etapa 10 — Visualização de resultados
- Mostrar deformada, deslocamentos/rotações, reações e resultados por elemento conforme contrato real.
- Implementar escala de cores, legenda e controles de exibição.
- Diferenciar geometria original e deformada.

**Aceite:** visualizações são vinculadas a resultados validados; dados de demonstração têm marcação explícita.

## Etapa 11 — Feedback visual de atribuições e ações do modelo
- Elementos sem material ou seção devem ter indicação visual evidente; distinguir os dois tipos de pendência e atualizar a aparência após a atribuição.
- Cargas concentradas nodais: setas vermelhas.
- Momentos nodais: símbolo distinto, preferencialmente seta curva ou par de setas.
- Deslocamentos prescritos: setas ciano ou outra cor claramente diferente das cargas.
- Cargas distribuídas: símbolos/setas distribuídos ao longo dos elementos.
- Apoios: símbolos convencionais nos nós, coerentes com os graus de liberdade restringidos.
- Centralizar cores, símbolos e legenda; não depender apenas da cor para comunicar o significado.
- Não produzir logs a cada quadro de renderização.

**Aceite:** cada tipo de atribuição pode ser identificado na viewport e/ou legenda; a visualização acompanha alterações no modelo; logs não são gerados continuamente durante a renderização.

## Etapa 12 — Empacotamento desktop
- Adicionar Tauri.
- Conectar os serviços ao backend Rust.
- Configurar build e empacotamento para Windows primeiro, expandindo depois conforme necessidade.

**Aceite:** aplicativo desktop inicia; erros de integração são logados; instruções de build estão documentadas.

## Regra de conclusão de cada etapa

Ao finalizar, informar:
- arquivos criados/alterados;
- comandos para executar;
- testes realizados e resultado;
- limitações/decisões pendentes;
- confirmação explícita de que a próxima etapa ainda não foi iniciada.

## Regras gerais
- Antes de editar, inspecionar o código atual e respeitar as decisões e convenções já implementadas.
- Não substituir funcionalidades existentes por versões simplificadas sem justificativa.
- Não implementar etapas futuras antecipadamente.
- Se uma decisão indispensável não estiver especificada, explicar a lacuna e fazer a menor alteração segura; não inventar requisitos de engenharia.
- Manter o modelo de domínio separado dos componentes visuais, com uma única fonte de verdade para nós, elementos, graus de liberdade e atribuições.
