# Contrato JSON — Front-end ↔ Backend

## 1. Regra única
Este é o contrato externo oficial. JSON usa **camelCase**, igual ao front-end. Rust pode usar `snake_case` internamente com `#[serde(rename_all = "camelCase")]`. Não manter dois contratos.

UTF-8; IDs string opacos e estáveis; números finitos; campo ausente não equivale a zero; não incluir estado visual da UI. `contractVersion` identifica a versão. Mudanças incompatíveis exigem revisão de versão e atualização coordenada.

## 2. Solicitação

```json
{
  "contractVersion": "1.0",
  "requestId": "req-000001",
  "operation": "analysis.run",
  "payload": {
    "analysisType": "linearStatic",
    "structure": {
      "nodes": [],
      "elements": [],
      "materials": [],
      "sections": [],
      "nodalLoads": [],
      "elementLoads": [],
      "supports": [],
      "prescribedDisplacements": []
    }
  }
}
```

Operações iniciais: `analysis.validate`, `analysis.run`, `backend.info`. Não implementar operação fora do roadmap. `requestId` é gerado pelo front-end e deve ser devolvido sem alteração.

## 3. Resposta

Sucesso:
```json
{
  "contractVersion": "1.0",
  "requestId": "req-000001",
  "status": "success",
  "result": {
    "analysisId": "analysis-000001",
    "modelRevision": "revision-000001",
    "analysisType": "linearStatic",
    "results": {
      "nodalResults": [],
      "elementResults": []
    }
  },
  "errors": [],
  "warnings": []
}
```

Erro:
```json
{
  "contractVersion": "1.0",
  "requestId": "req-000001",
  "status": "error",
  "result": null,
  "errors": [
    {
      "code": "STRUCTURE_UNKNOWN_NODE",
      "message": "O elemento E2 referencia um nó inexistente.",
      "path": "payload.structure.elements[1].nodeIds[0]",
      "details": {"elementId": "E2", "nodeId": "N99"}
    }
  ],
  "warnings": []
}
```

`result` é objeto em sucesso e `null` em erro. `errors` e `warnings` sempre existem. `code` é estável; `path` aponta para o campo no JSON. Não incluir stack trace em mensagem ao usuário.

## 4. Estrutura de dados

### Nó
```json
{"id":"N1","coordinates":{"x":0.0,"y":0.0,"z":0.0}}
```
Coordenadas 3D. Unidades devem ser definidas antes de análise física real.

### Elemento
```json
{
  "id":"E1",
  "type":"truss1D",
  "nodeIds":["N1","N2"],
  "materialId":"MAT1",
  "sectionId":"SEC1",
  "properties":{}
}
```
Tipos previstos: `truss1D`, `rectangularPlate4`. `properties` recebe somente propriedades específicas aprovadas; não duplicar dados que pertencem à seção.

`rectangularPlate4`: quatro IDs na ordem anti-horária, começando no canto inferior esquerdo do plano local.

### Materiais e seções
```json
{
  "materials":[{"id":"MAT1","name":"Material A","properties":{}}],
  "sections":[{"id":"SEC1","name":"Seção A","type":"truss","properties":{}}]
}
```
Os objetos `properties` serão tipados e validados conforme família de elemento. Não inventar campos físicos/unidades.

### Carga nodal
```json
{
  "id":"LOAD1",
  "nodeId":"N2",
  "force":{"x":0.0,"y":0.0,"z":-10.0},
  "moment":{"x":0.0,"y":0.0,"z":0.0}
}
```
Momentos só são válidos quando os DOFs/formulação os suportam. Componentes incompatíveis devem ser diagnosticados, nunca ignorados. Unidades e sinais ainda precisam de aprovação.

### Apoio
```json
{
  "id":"SUP1",
  "nodeId":"N1",
  "restrainedDofs":{
    "ux":true,"uy":true,"uz":true,
    "rx":false,"ry":false,"rz":false
  }
}
```
Os seis campos representam componentes possíveis no contrato, não a afirmação de que todo nó possui seis DOFs. Backend valida a compatibilidade.

### Deslocamento prescrito
```json
{
  "id":"DISP1",
  "nodeId":"N2",
  "values":{
    "ux":0.0,"uy":null,"uz":null,
    "rx":null,"ry":null,"rz":null
  }
}
```
`null` = não prescrito; `0.0` = valor imposto igual a zero.

### Cargas distribuídas
`elementLoads` permanece vazio até aprovar unidade, direção, sistema local/global, lei de distribuição e conversão em cargas nodais equivalentes.

## 5. Resultados

```json
{
  "nodeId":"N1",
  "displacement":{
    "ux":0.0,"uy":0.0,"uz":0.0,
    "rx":null,"ry":null,"rz":null
  },
  "reaction":{
    "fx":null,"fy":null,"fz":null,
    "mx":null,"my":null,"mz":null
  }
}
```
`null` = não calculado/não aplicável; não significa zero. Resultados por elemento devem conter `elementId` e `values` definidos pela formulação. Metadados recomendados: `analysisId`, `modelRevision`, `analysisType`, `contractVersion`, `solverInfo` e `units` somente quando aprovados. Não enviar a matriz global inteira por padrão.

## 6. Integração com tipos existentes
Antes de integrar, inspecionar os tipos TypeScript reais de nós, elementos, materiais, seções, cargas e apoios. Criar tabela de mapeamento campo a campo. Registrar campos sem correspondência e transformações necessárias. Não perder dados nem renomear estado interno indiscriminadamente. Se houver conflito com conceito já confirmado no front-end, parar e apresentar a divergência antes de alterar o contrato.

## 7. Rust e versionamento
Mapeamento esperado: TypeScript `requestId`, Rust `request_id`; JSON `nodeIds`, Rust `node_ids`. Usar Serde com renomeação explícita. Enums como `linearStatic` devem ter serialização explícita. Criar fixtures compartilhadas e testes de round-trip.

Mudança de significado, tipo, unidade, ordem de nós ou semântica de null exige revisão da versão do contrato. Atualizar docs, DTOs Rust, tipos TS e fixtures juntos.
