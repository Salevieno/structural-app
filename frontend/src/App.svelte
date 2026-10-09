<script lang="ts">
  type ToolType = 'select' | 'nodes' | 'elements' | 'materials' | 'sections' | 'loads' | 'supports';

  const tools: Array<{ id: ToolType; label: string }> = [
    { id: 'select', label: 'Seleção' },
    { id: 'nodes', label: 'Nós' },
    { id: 'elements', label: 'Elementos' },
    { id: 'materials', label: 'Materiais' },
    { id: 'sections', label: 'Seções' },
    { id: 'loads', label: 'Cargas' },
    { id: 'supports', label: 'Apoios' },
  ];

  const activeTool = 'select';
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
            <button type="button" class:active={tool.id === activeTool}>
              {tool.label}
            </button>
          </li>
        {/each}
      </ul>
    </aside>

    <main class="viewport-panel" aria-label="Viewport 3D">
      <div class="viewport-surface">
        <div class="viewport-label">Viewport 3D</div>
      </div>
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
      <header>
        <h2>Logs</h2>
      </header>
      <div class="empty-state">Sem eventos registrados</div>
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
  .tool-panel button {
    border: 1px solid #334155;
    background: #0f172a;
    color: #e2e8f0;
    border-radius: 0.5rem;
    padding: 0.55rem 0.85rem;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .toolbar button:hover,
  .tool-panel button:hover {
    border-color: #60a5fa;
    background: #111827;
  }

  .workspace {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) 280px;
    grid-template-rows: minmax(0, 1fr) 200px;
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

  .tool-panel button.active {
    background: #1d4ed8;
    border-color: #60a5fa;
  }

  .viewport-panel {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    padding: 1rem;
    background: #020817;
    border-right: 1px solid #1f2937;
  }

  .viewport-surface {
    position: relative;
    width: 100%;
    min-height: 420px;
    border: 1px dashed #475569;
    border-radius: 1rem;
    background:
      linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
      #0f172a;
    background-size: 24px 24px, 24px 24px, auto;
    display: grid;
    place-items: center;
  }

  .viewport-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.7rem 1.2rem;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid #475569;
    color: #cbd5e1;
    font-weight: 600;
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
  }

  @media (max-width: 980px) {
    .workspace {
      grid-template-columns: 200px minmax(0, 1fr);
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
  }
</style>
