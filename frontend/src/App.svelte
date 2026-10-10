<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { logger, type LogEntry, type LogLevel } from './lib/logging';
  import SceneViewport from './lib/viewport/SceneViewport.svelte';
  import type { CameraView } from './lib/viewport/types';
  import type { WorkPlane } from './lib/viewport/workPlane';

  type ToolType = 'select' | 'nodes' | 'elements' | 'materials' | 'sections' | 'loads' | 'supports';
  type LogFilter = LogLevel | 'all';

  const tools: Array<{ id: ToolType; label: string }> = [
    { id: 'select', label: 'Seleção' },
    { id: 'nodes', label: 'Nós' },
    { id: 'elements', label: 'Elementos' },
    { id: 'materials', label: 'Materiais' },
    { id: 'sections', label: 'Seções' },
    { id: 'loads', label: 'Cargas' },
    { id: 'supports', label: 'Apoios' },
  ];

  const logFilters: Array<{ value: LogFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'debug', label: 'Debug' },
    { value: 'info', label: 'Info' },
    { value: 'warn', label: 'Warn' },
    { value: 'error', label: 'Error' },
  ];

  const cameraViews: Array<{ id: CameraView; label: string }> = [
    { id: 'top', label: 'Topo' },
    { id: 'bottom', label: 'Base' },
    { id: 'front', label: 'Frente' },
    { id: 'back', label: 'Trás' },
    { id: 'left', label: 'Esquerda' },
    { id: 'right', label: 'Direita' },
    { id: 'isometric', label: 'Isométrica' },
  ];

  let activeTool: ToolType = 'select';
  let logFilter: LogFilter = 'all';
  let logs: LogEntry[] = [];
  let gridSpacing = 1;
  let lastValidGridSpacing = gridSpacing;
  let snapToGrid = true;
  let workPlane: WorkPlane = 'XY';
  let cameraView: CameraView = 'isometric';

  const setTool = (toolId: ToolType): void => {
    activeTool = toolId;
    logger.info('model.tool.changed', 'Ferramenta de edição alterada', {
      toolId,
      source: 'toolbar',
    });
  };

  const handleGridSpacingChange = (event: Event): void => {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || value < 0.1 || value > 10) {
      logger.warn(
        'viewport.grid.spacing.invalid',
        'Espaçamento fora do intervalo permitido; valor anterior mantido.',
        { value: input.value, minimum: 0.1, maximum: 10 },
      );
      gridSpacing = lastValidGridSpacing;
      return;
    }

    lastValidGridSpacing = value;
    logger.info('viewport.grid.changed', 'Espaçamento do grid alterado', {
      spacing: value,
      workPlane,
    });
  };

  const handleSnapChange = (): void => {
    logger.info('viewport.snap.changed', 'Snap-to-grid alterado', {
      enabled: snapToGrid,
      workPlane,
      spacing: gridSpacing,
    });
  };

  const handleWorkPlaneChange = (): void => {
    logger.info('viewport.work_plane.changed', 'Plano de trabalho alterado', {
      workPlane,
    });
  };

  const unsubscribe = logger.subscribe((entry) => {
    logs = [entry, ...logs].slice(0, 60);
  });

  onMount(() => {
    logger.info('app.started', 'Aplicação iniciada', {
      layout: 'shell',
      toolCount: tools.length,
    });
    logger.warn('layout.initialized', 'Layout inicial em modo de estrutura vazia.', {
      activeTool,
      status: 'waiting-for-model-data',
    });
  });

  onDestroy(() => {
    unsubscribe();
  });

  $: filteredLogs = logs.filter((entry) => logFilter === 'all' || entry.level === logFilter);
</script>

<div class="app-shell" aria-label="Aplicação estrutural inicial">
  <header class="topbar" aria-label="Barra superior da aplicação">
    <div class="brand-block">
      <span class="brand-mark">S</span>
      <span>Structural App</span>
    </div>

    <nav class="toolbar" aria-label="Ações gerais">
      <button type="button">Arquivo</button>
      <button type="button">Editar</button>
      <button type="button">Analisar</button>
      <button type="button">Resultados</button>
    </nav>
  </header>

  <div class="workspace" aria-label="Área principal do aplicativo">
    <aside class="tool-panel" aria-label="Barra de ferramentas">
      <h2>Ferramentas</h2>
      <ul>
        {#each tools as tool}
          <li>
            <button
              type="button"
              class:active={tool.id === activeTool}
              aria-pressed={tool.id === activeTool}
              on:click={() => setTool(tool.id)}
            >
              {tool.label}
            </button>
          </li>
        {/each}
      </ul>
    </aside>

    <main class="viewport-panel" aria-label="Viewport 3D">
      <div class="viewport-toolbar" aria-label="Controles do viewport">
        <div class="view-presets" role="group" aria-label="Vistas predefinidas">
          {#each cameraViews as view}
            <button
              type="button"
              class:active={cameraView === view.id}
              aria-pressed={cameraView === view.id}
              on:click={() => (cameraView = view.id)}
            >
              {view.label}
            </button>
          {/each}
        </div>

        <label class="grid-spacing-control">
          <span>Grid</span>
          <input
            type="number"
            min="0.1"
            max="10"
            step="0.1"
            aria-label="Espaçamento do grid"
            bind:value={gridSpacing}
            on:change={handleGridSpacingChange}
          />
        </label>

        <label class="work-plane-control">
          <span>Plano</span>
          <select
            aria-label="Plano de trabalho"
            bind:value={workPlane}
            on:change={handleWorkPlaneChange}
          >
            <option value="XY">XY</option>
            <option value="XZ">XZ</option>
            <option value="YZ">YZ</option>
          </select>
        </label>

        <label class="snap-control">
          <input type="checkbox" bind:checked={snapToGrid} on:change={handleSnapChange} />
          <span>Snap-to-grid</span>
        </label>
      </div>

      <div class="viewport-help">
        Arrastar: orbitar · botão direito: mover · roda: zoom · o marcador mostra a posição calculada
      </div>
      <SceneViewport
        spacing={gridSpacing}
        snapToGrid={snapToGrid}
        {workPlane}
        {cameraView}
      />
    </main>

    <aside class="context-panel" aria-label="Painel lateral do modelo">
      <section>
        <h2>Modelo</h2>
        <div class="empty-state">Árvore do modelo vazia</div>
      </section>
      <section>
        <h2>Propriedades</h2>
        <div class="empty-state">Seleção ainda não definida</div>
      </section>
    </aside>

    <aside class="log-panel" aria-label="Painel de logs e diagnósticos">
      <header class="log-header">
        <h2>Logs</h2>
        <div class="log-filters" aria-label="Filtros de log">
          {#each logFilters as filter}
            <button
              type="button"
              class:selected={logFilter === filter.value}
              on:click={() => (logFilter = filter.value)}
            >
              {filter.label}
            </button>
          {/each}
        </div>
      </header>

      {#if filteredLogs.length === 0}
        <div class="empty-state log-empty">Sem eventos registrados</div>
      {:else}
        <ul class="log-list">
          {#each filteredLogs as log}
            <li class={`log-item ${log.level}`}>
              <div class="log-meta">
                <span class="log-badge">{log.level.toUpperCase()}</span>
                <time>{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</time>
              </div>
              <strong>{log.event}</strong>
              <p>{log.message}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    min-height: 100vh;
    font-family: Inter, 'Segoe UI', sans-serif;
    background: #0f172a;
    color: #e2e8f0;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: #020817;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.875rem 1.25rem;
    background: #111827;
    border-bottom: 1px solid #1f2937;
  }

  .brand-block {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.03em;
  }

  .brand-mark {
    display: inline-grid;
    place-items: center;
    width: 1.8rem;
    height: 1.8rem;
    background: linear-gradient(135deg, #38bdf8, #8b5cf6);
    border-radius: 0.5rem;
    color: #020817;
    font-weight: 800;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .toolbar button,
  .tool-panel button,
  .log-filters button {
    border: 1px solid #334155;
    background: #0f172a;
    color: #e2e8f0;
    border-radius: 0.5rem;
    padding: 0.55rem 0.85rem;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .toolbar button:hover,
  .tool-panel button:hover,
  .view-presets button:hover,
  .log-filters button:hover {
    border-color: #60a5fa;
    background: #111827;
  }

  .workspace {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) 280px;
    grid-template-rows: minmax(0, 1fr) 230px;
    flex: 1;
    min-height: 0;
  }

  .tool-panel,
  .context-panel,
  .log-panel {
    background: #111827;
    border-right: 1px solid #1f2937;
    padding: 1rem;
  }

  .tool-panel {
    grid-column: 1;
    grid-row: 1 / span 2;
  }

  .tool-panel h2,
  .context-panel h2,
  .log-panel h2 {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .tool-panel ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tool-panel button {
    width: 100%;
    text-align: left;
  }

  .tool-panel button.active,
  .log-filters button.selected {
    background: #1d4ed8;
    border-color: #60a5fa;
  }

  .viewport-panel {
    grid-column: 2;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 1rem;
    background: #020817;
    border-right: 1px solid #1f2937;
    min-width: 0;
    min-height: 0;
  }

  .viewport-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .view-presets {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .view-presets button,
  .viewport-toolbar input,
  .viewport-toolbar select {
    min-height: 2.15rem;
    border: 1px solid #334155;
    border-radius: 0.45rem;
    background: #0f172a;
    color: #e2e8f0;
    padding: 0.35rem 0.55rem;
  }

  .view-presets button {
    cursor: pointer;
  }

  .view-presets button.active {
    background: #1d4ed8;
    border-color: #60a5fa;
  }

  .grid-spacing-control,
  .work-plane-control,
  .snap-control {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: #cbd5e1;
    font-size: 0.8rem;
  }

  .grid-spacing-control input {
    width: 4.8rem;
  }

  .viewport-help {
    color: #94a3b8;
    font-size: 0.72rem;
    line-height: 1.35;
  }

  .context-panel {
    grid-column: 3;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .context-panel section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .empty-state {
    border: 1px dashed #475569;
    border-radius: 0.75rem;
    padding: 0.85rem;
    color: #94a3b8;
    background: rgba(15, 23, 42, 0.7);
    min-height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .log-panel {
    grid-column: 2 / span 2;
    grid-row: 2;
    border-top: 1px solid #1f2937;
    border-right: none;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .log-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .log-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow: auto;
  }

  .log-item {
    border: 1px solid #334155;
    border-radius: 0.75rem;
    background: rgba(15, 23, 42, 0.75);
    padding: 0.7rem 0.8rem;
  }

  .log-item.debug {
    border-left: 3px solid #38bdf8;
  }

  .log-item.info {
    border-left: 3px solid #34d399;
  }

  .log-item.warn {
    border-left: 3px solid #fbbf24;
  }

  .log-item.error {
    border-left: 3px solid #f87171;
  }

  .log-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .log-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 3.2rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid #475569;
    padding: 0.2rem 0.45rem;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .log-item time {
    font-size: 0.74rem;
    color: #94a3b8;
  }

  .log-item strong {
    display: block;
    margin-bottom: 0.2rem;
    font-size: 0.82rem;
  }

  .log-item p {
    margin: 0;
    color: #cbd5e1;
    font-size: 0.78rem;
    line-height: 1.4;
  }

  .log-empty {
    min-height: 90px;
  }

  @media (max-width: 980px) {
    .workspace {
      grid-template-columns: 200px minmax(0, 1fr);
      grid-template-rows: minmax(440px, 1fr) auto 230px;
    }

    .context-panel {
      grid-column: 1 / span 2;
      grid-row: 2;
      border-top: 1px solid #1f2937;
    }

    .log-panel {
      grid-column: 1 / span 2;
      grid-row: 3;
    }

    .tool-panel {
      grid-column: 1;
      grid-row: 1;
    }

    .viewport-panel {
      grid-column: 2;
      grid-row: 1;
    }
  }
</style>
