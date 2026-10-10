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
Disponibilizar ferramentas para criar elementos conectando nós e para gerar malha. O algoritmo, os tipos de elementos, as regras de compatibilidade e os parâmetros da malha serão especificados depois. Não gerar conectividade fictícia nem afirmar que uma malha é válida sem validação.

### 3.4 Materiais e seções transversais
Permitir criar, editar, listar e selecionar materiais e seções. Os campos físicos e unidades ainda serão especificados. Manter formulários desacoplados do viewport e do formato definitivo de dados.

### 3.5 Cargas e deslocamentos aplicados
A interface deverá suportar:
- cargas concentradas aplicadas a nós;
- deslocamentos prescritos aplicados a nós;
- cargas distribuídas aplicadas a elementos.

A convenção de eixos, unidades, sistemas de coordenadas, sinais e formatos dos valores ainda precisa ser definida. Não assumir silenciosamente convenções físicas.

### 3.6 Atribuições
- Materiais e seções: selecionar elementos e atribuir a seleção.
- Cargas concentradas, deslocamentos prescritos e apoios: selecionar nós e atribuir.
- Cargas distribuídas: selecionar elementos e atribuir.
- Mostrar visualmente as atribuições no modelo e/ou painel de propriedades.
- Mostrar claramente o item selecionado e as atribuições existentes.
- Permitir editar/remover atribuições quando o modelo de domínio suportar essa operação.

### 3.7 Apoios/condições de contorno
Permitir aplicar condições de apoio aos nós. Os graus de liberdade disponíveis variam conforme os tipos de elemento e a definição de modelo. A UI não deve fixar universalmente seis graus de liberdade por nó; aguardar o contrato do modelo/DOF do backend.

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

Evitar conflitos entre orbitar a câmera, selecionar objetos e criar nós. A escolha da biblioteca 3D deve ser uma decisão explícita e documentada. A decisão inicial é Three.js com `OrbitControls`, Z como eixo vertical e XY como plano de trabalho inicial; ver D-009 em `DATA_CONTRACTS.md`.

## 5. Preparação e início de análise (etapa futura)

O comando **Iniciar análise** deve permanecer desabilitado enquanto o modelo não estiver pronto. Regra mínima fornecida pelo usuário:

- existem nós;
- existem elementos;
- existem apoios;
- existem cargas;
- todos os elementos têm material;
- todos os elementos têm seção transversal.

Essa regra é apenas o mínimo explícito. Antes da execução real, deverá existir um validador central que informe todos os problemas encontrados, não apenas o primeiro. Regras adicionais de conectividade, unidades, graus de liberdade, estabilidade, tipos de carga e compatibilidade devem ser definidas pelo domínio/backend.

Ao iniciar:
1. validar o modelo;
2. mostrar os erros/avisos encontrados;
3. registrar o início;
4. bloquear ou controlar comandos incompatíveis durante a análise;
5. apresentar progresso se o backend fornecer progresso;
6. registrar sucesso ou falha com contexto;
7. não descartar o modelo em caso de erro.

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
