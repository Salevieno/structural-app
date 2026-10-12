# Arquitetura proposta

## 1. Visão geral

Uma única aplicação desktop, com tecnologias diferentes em camadas:

- Svelte + TypeScript: interface.
- Tauri: empacotamento desktop e comunicação entre UI e backend.
- Rust: domínio estrutural, orquestração da análise e integração com o solver.
- CHOLMOD: resolução de sistemas lineares esparsos, chamado pelo backend Rust.

O front-end pode ser desenvolvido primeiro com serviços simulados, mantendo a futura integração isolada.

## 2. Organização sugerida do front-end
```
frontend/
├── src/
│   ├── app.css
│   ├── app.html
│   ├── main.ts
│   ├── App.svelte
│   └── lib/
│       ├── components/
│       │   ├── layout/
│       │   ├── toolbar/
│       │   ├── model-tree/
│       │   ├── properties/
│       │   ├── dialogs/
│       │   └── logs/
│       ├── viewport/
│       │   ├── SceneViewport.svelte
│       │   ├── camera/
│       │   ├── grid/
│       │   ├── picking/
│       │   └── rendering/
│       ├── domain/
│       │   ├── model/
│       │   └── results/
│       ├── state/
│       ├── services/
│       │   ├── analysis/
│       │   ├── model-io/
│       │   └── results-io/
│       ├── validation/
│       ├── logging/
│       └── utils/
├── package.json
└── vite.config.ts
```
A estrutura é uma orientação, não uma exigência de criar todos os diretórios vazios agora. Criar arquivos quando houver uma etapa que os utilize.

## 3. Responsabilidades

- `components/`: componentes visuais reutilizáveis; não implementar regras FEM aqui.
- `viewport/`: cena 3D, câmera, grid, seleção e representação visual.
- `domain/`: tipos de domínio provisórios e independentes da UI.
- `state/`: estado compartilhado do modelo, seleção, ferramentas e operações.
- `services/`: portas para backend, importação/exportação e operações assíncronas.
- `validation/`: validações de modelo e resultados, independentes de componentes.
- `logging/`: API central e destinos dos logs.
- `utils/`: funções genéricas sem dependências de UI ou de engenharia.

## 4. Dependências e fronteiras

- Componentes dependem de serviços/estado e tipos de domínio, não de implementações nativas Tauri diretamente.
- Serviços definem interfaces claras; a implementação simulada pode ser trocada por uma implementação Tauri.
- O viewport recebe dados de modelo e seleção e emite intenções/eventos; não deve ser dono da verdade do modelo.
- Validação não deve depender de componentes Svelte.
- Logging deve ser chamado por serviços e fluxos de domínio, com componentes registrando apenas eventos de interação úteis.
- Backend/solver é a autoridade para validações matemáticas e análise estrutural.
- Front-end pode validar completude básica para UX, mas não substitui a validação do backend.

## 5. Interfaces provisórias

Portas em uso ou previstas:

- `ModelService`: criar/editar modelo e obter estado do modelo.
- `AnalysisService`: validar e iniciar análise; acompanhar progresso; receber resultados.
- `ResultsImportService`: selecionar, ler e validar arquivo de resultados.
- `Logger`: registrar eventos estruturados.

Os contratos de modelo e resultados continuam provisórios. O contrato de transporte da Etapa 8 está documentado em `docs/FRONTEND_SPEC.md`; ele não define formulações nem resultados de engenharia.

### Etapa 8 — análise

O serviço e seus adaptadores ficam em `src/lib/services/analysis/`. No navegador, a aplicação usa um serviço simulado com progresso, cancelamento e indicação explícita de que nenhum cálculo estrutural foi executado. No runtime Tauri, o adaptador usa `analysis_start`/`analysis_cancel` e os eventos `analysis://progress`, `analysis://completed`, `analysis://failed` e `analysis://cancelled`, correlacionados por `analysisId`. O backend Rust ainda não implementa esses handlers.

## 6. Estado da aplicação

Manter separados:
- modelo estrutural;
- seleção atual;
- ferramenta ativa;
- configurações do viewport (câmera, grid, snap, plano de trabalho);
- estado da análise;
- resultados atuais e origem deles;
- mensagens/logs.

Evitar guardar todo o estado em `App.svelte` ou duplicar a mesma informação em componentes diferentes.
