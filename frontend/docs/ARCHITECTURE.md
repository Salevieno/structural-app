# Especificação funcional do front-end

## 1. Objetivo

Criar uma interface desktop para construir um modelo estrutural 3D, preparar uma análise, receber resultados do backend ou de arquivo e visualizar esses resultados. O front-end será implementado primeiro com dados simulados, sem fingir que existe um solver funcional.

## 2. Layout conceitual

A composição exata pode evoluir, mas deve reservar áreas para:

- **Barra superior:** arquivo/projeto, desfazer/refazer (quando implementado), comandos principais e iniciar análise.
- **Barra de ferramentas:** seleção, criação de nós, criação de elementos/malha e comandos de atribuição.
- **Viewport 3D:** estrutura, nós, elementos, grid, cargas, apoios e resultados.
- **Painel lateral:** árvore do modelo, propriedades do item selecionado e formulários contextuais.
- **Painel inferior ou acoplável:** logs, avisos, erros e estado das operações.

Evitar poluição visual. Ações incompatíveis com a seleção atual devem ficar desabilitadas ou explicar o motivo.

## 3. Construção do modelo

### 3.0 Nós provisórios e seleção (etapa atual)
- A ferramenta **Nós** cria um nó ao clicar no plano de trabalho ativo; o snap configurado no viewport define as coordenadas enviadas ao estado do modelo.
- A ferramenta **Seleção** permite escolher nós no viewport; a lista de nós também permite selecioná-los e consultar propriedades básicas.
- Nós recebem destaque visual quando selecionados. O painel apresenta ID e coordenadas, sem assumir unidades.
- A forma do nó no front-end é provisória e não estabelece o contrato definitivo do backend.
- Duplicatas são reconhecidas somente quando as três coordenadas são exatamente iguais. Não se aplica tolerância geométrica; a regra pode mudar quando o contrato de domínio for definido.

### 3.1 Seleção de tipo de elemento
Permitir selecionar o tipo de elemento antes de criar elementos. Os tipos e suas propriedades definitivas serão definidos posteriormente. Não inventar formulações de elementos.

### 3.2 Criar nós no canvas
- O usuário seleciona a ferramenta de criação de nós e clica no viewport.
- O clique deve ser convertido em uma posição 3D coerente com o plano de trabalho/vista ativa.
- O grid deve ter espaçamento configurável.
- Com **snap-to-grid** habilitado, a posição criada deve ser ajustada ao grid.
- Mostrar feedback visual da posição e da criação.
- Prevenir ou avisar sobre nós duplicados conforme uma tolerância configurável; a regra final precisa ser confirmada antes de torná-la uma regra de engenharia.
- Uma vista 2D não determina sozinha uma coordenada 3D. A interface deverá usar um plano de trabalho ativo e tornar esse plano visível/identificável.

### 3.3 Criar elementos e malha
Na ferramenta **Elementos**, o usuário seleciona dois nós existentes e distintos para criar um elemento 1D visual. Ele guarda os IDs dos nós extremos e é desenhado como uma linha; não define rigidez nem graus de liberdade. Conexões 1D repetidas entre o mesmo par são bloqueadas sem considerar a ordem dos nós.

A ferramenta **Malha** usa todos os nós criados manualmente como pontos do contorno e reconstrói a ordem por ângulo ao redor do centroide; não depende da ordem de criação e normaliza o polígono para anti-horário a partir do ponto inferior esquerdo. Como pontos sem conectividade não definem com segurança a borda de um polígono côncavo, esses contornos são rejeitados com diagnóstico explícito. O espaçamento do grid define o tamanho de célula; o botão fica desabilitado com diagnóstico enquanto faltarem pré-requisitos para gerar ao menos uma célula. O gerador cartesiano aceita polígonos simples, fechados e planares, sem furos/regiões múltiplas, e produz quadriláteros 2D de 4 nós inteiramente contidos no contorno. Nós e elementos 2D gerados permanecem separados dos nós manuais e dos elementos 1D. Gaps de cobertura são informados pela área omitida. Regeneração é bloqueada se remover nós/elementos com referências de elementos 1D, cargas, deslocamentos, apoios ou atribuições.

Os GDL provisórios dos quadriláteros são apenas as translações do plano (XY: ux/uy; XZ: ux/uz; YZ: uy/uz). Elementos 1D visuais não definem GDL nesta etapa. Cargas, deslocamentos prescritos (inclusive valor zero, quando ativo) e apoios são validados por um serviço de domínio central. Isso não detecta mecanismos nem singularidades globais, que ficam para o backend numérico.

### 3.4 Materiais e seções transversais
Permitir criar, editar, listar e selecionar materiais e seções. O modelo provisório de material contém E e G em GPa e v sem unidade; a seção contém espessura em mm. Os presets informados são Aço (E = 200 GPa, v = 0,3, G = 500 GPa) e Concreto (E = 26,071594 GPa, v = 0,2, G = 500 GPa); seus valores podem ser editados. Excluir um material ou seção limpa suas referências nos elementos; editar preserva as referências pelo ID.

### 3.5 Cargas e deslocamentos aplicados
A interface aplica cargas concentradas Fx/Fy/Fz em kN e Mx/My/Mz em kNm somente a nós, e deslocamentos ux/uy/uz em mm e rotações tx/ty/tz em rad a nós. Cargas distribuídas serão implementadas posteriormente como uma categoria separada, aplicada a elementos. Apoios armazenam um booleano por grau de liberdade (verdadeiro bloqueia, falso deixa livre), com presets para ux, uy ou uz isolados, as três translações e os seis graus.

A unidade por comprimento e a lei espacial das cargas distribuídas, convenção de sinais e sistemas de coordenadas ainda precisam ser definidos antes da implementação e validação para análise.

### 3.6 Atribuições
- Materiais e seções: selecionar elementos e atribuir a seleção.
- Cargas concentradas, deslocamentos prescritos e apoios: selecionar nós e atribuir.
- Cargas distribuídas futuras: selecionar elementos e atribuir quando a categoria for implementada.
- Mostrar visualmente as atribuições no modelo e/ou painel de propriedades.
- Mostrar claramente o item selecionado e as atribuições existentes.
- Permitir editar/remover atribuições quando o modelo de domínio suportar essa operação.

### 3.7 Apoios/condições de contorno
Os presets atuais refletem os seis booleanos ux, uy, uz, tx, ty e tz solicitados. Durante a etapa da malha 2D, atribuições só aceitam os GDL disponíveis no nó segundo os elementos quadrilaterais conectados e seu plano. Uma atribuição válida no nó não é rejeitada apenas porque outro elemento conectado não contribui rigidez para aquele GDL. Mecanismos e GDL sem rigidez global são responsabilidade da validação numérica futura.

## 4. Viewport 3D

Deve suportar:

- renderização de nós e elementos;
- pan, rotação/orbita em 3D e zoom;
- vistas predefinidas: topo, base, frente, trás, esquerda, direita e isométrica;
- grid visível com tamanho/espaçamento ajustável;
- alternância de snap-to-grid;
- seleção de nós e elementos por clique;
- realce de seleção;
- modo de criação de nós;
- representação visual de apoios, cargas e deslocamentos;
- legenda/escala para resultados quando essa fase for implementada.

Os controles de navegação são: arrastar com botão esquerdo para orbitar, arrastar com botão direito para pan e usar a roda para zoom. As vistas predefinidas são topo, base, frente, trás, esquerda, direita e isométrica. A interface permite ajustar o espaçamento do grid, alternar snap-to-grid e selecionar os planos XY, XZ e YZ. Uma prévia no viewport mostra as coordenadas calculadas sob o ponteiro; essa prévia não cria nós.

Na etapa de nós, selecionar a ferramenta **Nós** e clicar no viewport cria um nó no plano ativo; selecionar **Seleção** e clicar num nó destaca-o e exibe as propriedades no painel lateral. Arrastos da câmera são ignorados como cliques. Se o plano estiver visto de lado e não for possível calcular a interseção, a UI apresenta um aviso; use uma vista adequada ou outro plano.

Evitar conflitos entre orbitar a câmera, selecionar objetos e criar nós. A escolha da biblioteca 3D deve ser uma decisão explícita e documentada. A decisão inicial é Three.js com `OrbitControls`, Z como eixo vertical e XY como plano de trabalho inicial; ver D-009 em `DATA_CONTRACTS.md`.

## 5. Preparação e início de análise

O comando **Iniciar análise** permanece desabilitado enquanto o serviço está inicializando ou a validação de prontidão não passa. A regra mínima atual exige nós, elementos e malha atual, material e seção em cada elemento e pelo menos um apoio num nó existente. Cargas não são obrigatórias para prontidão.

Essa regra é apenas o mínimo de UX; regras técnicas de conectividade, unidades, estabilidade e compatibilidade permanecem responsabilidade do domínio/backend.

Ao iniciar:
1. validar o modelo;
2. mostrar os erros/avisos encontrados;
3. registrar o início;
4. bloquear ou controlar comandos incompatíveis durante a análise;
5. apresentar progresso recebido do serviço;
6. permitir cancelamento cooperativo quando suportado;
7. registrar sucesso, cancelamento ou falha com contexto;
8. não descartar o modelo em caso de erro.

O contrato versionado, os comandos/eventos Tauri e as implementações isoladas `AnalysisService` estão em `src/lib/services/analysis/`. O modo web usa serviço simulado, com aviso de que não executa cálculo estrutural. O backend atual (`backend/src/main.rs`) ainda não contém handlers Tauri; portanto a implementação nativa espera os comandos/eventos definidos em `FRONTEND_SPEC.md`. Nenhum resultado FEM é produzido nesta etapa.

## 6. Receber resultados

Fontes futuras:
- resposta do backend após análise;
- arquivo de resultados selecionado pelo usuário.

A importação deve separar leitura, parsing, validação e atualização da UI. Nunca substituir resultados válidos anteriores por dados inválidos sem confirmação clara. Exibir estado e erros de importação.

### Validação mínima obrigatória
- quantidade de nós nos resultados igual à quantidade de nós do modelo atual;
- estrutura dos dados presente e válida;
- valores numéricos finitos quando aplicável (não aceitar NaN/Infinity);
- identificadores ou ordenação de nós coerentes quando o contrato os definir;
- erros apresentados ao usuário sem encerrar a aplicação.

A quantidade igual de nós não prova sozinha que os resultados pertencem ao modelo correto. Quando os contratos forem definidos, preferir também identificador/hash de modelo, IDs de nós e versão de formato.

## 7. Visualização de resultados

Exemplos de recursos a suportar, conforme os resultados disponíveis:
- deformada;
- deslocamentos e rotações;
- reações;
- esforços/tensões por elemento;
- escala de cores e legenda;
- seleção de componente/eixo;
- alternar entre geometria original e deformada.

Não implementar tipos de resultados que o contrato ainda não fornece. Não inventar valores de resultados para além dos dados claramente marcados como demonstração.

## 8. Estado e feedback

Operações importantes precisam de estados claros: aguardando, em execução, concluída ou falha. Exibir feedback acessível e logs técnicos. Erros técnicos completos ficam no painel/log; mensagens ao usuário devem explicar o que fazer em seguida.
