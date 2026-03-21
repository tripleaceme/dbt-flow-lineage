import { GraphRenderer } from './graph/renderer';
import { AnimationEngine } from './graph/animation';
import { traceColumnPath } from './graph/highlight';
import { searchGraph, getModelTooltipHtml } from './graph/interaction';
import { LineageGraph, ExtensionToWebviewMessage, ModelNode, ColumnEdge } from '../../src/lineage/graphTypes';

declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};

const vscode = acquireVsCodeApi();

let graph: LineageGraph | null = null;
let renderer: GraphRenderer;
let animation: AnimationEngine;

function init() {
  const container = document.getElementById('graph-container')!;
  const loading = document.getElementById('loading')!;
  const tooltip = document.getElementById('tooltip')!;
  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const stats = document.getElementById('stats')!;
  const focusBadge = document.getElementById('focus-badge')!;
  const zoomInBtn = document.getElementById('zoom-in-btn')!;
  const zoomOutBtn = document.getElementById('zoom-out-btn')!;
  const zoomResetBtn = document.getElementById('zoom-reset-btn')!;
  const directionFilter = document.getElementById('direction-filter')!;
  const exportBtn = document.getElementById('export-btn')!;

  renderer = new GraphRenderer(container);
  renderer.init();
  animation = new AnimationEngine();

  // ── Zoom controls ──
  zoomInBtn.addEventListener('click', () => renderer.zoomIn());
  zoomOutBtn.addEventListener('click', () => renderer.zoomOut());
  zoomResetBtn.addEventListener('click', () => renderer.resetZoom());

  // ── Direction filter ──
  directionFilter.addEventListener('click', (event) => {
    const btn = (event.target as Element).closest('.dir-btn') as HTMLElement;
    if (!btn) return;
    const direction = btn.getAttribute('data-dir') as 'both' | 'upstream' | 'downstream';
    directionFilter.querySelectorAll('.dir-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    vscode.postMessage({ type: 'filterDirection', payload: { direction } });
  });

  // ── Export PNG ──
  exportBtn.addEventListener('click', async () => {
    try {
      const dataUrl = await renderer.exportAsPNG();
      // Send to extension host to save
      vscode.postMessage({ type: 'exportPNG', payload: { dataUrl } });
    } catch (err) {
      console.error('Export failed:', err);
    }
  });

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', (event) => {
    if (event.target === searchInput) return;
    switch (event.key) {
      case '+': case '=': event.preventDefault(); renderer.zoomIn(); break;
      case '-': case '_': event.preventDefault(); renderer.zoomOut(); break;
      case '0': event.preventDefault(); renderer.resetZoom(); break;
      case 'Escape':
        renderer.clearHighlights();
        animation.setHighlightedEdges(null);
        break;
    }
  });

  // ── Column click → trace path ──
  renderer.setOnColumnClick((columnId, modelId) => {
    if (!graph) return;
    const { edgeIds, columnIds } = traceColumnPath(columnId, modelId, graph);
    if (edgeIds.size === 0) return;
    renderer.highlightEdges(edgeIds, columnIds);
    animation.setHighlightedEdges(edgeIds);
  });

  // ── Model double-click → open file ──
  renderer.setOnModelDblClick((filePath) => {
    vscode.postMessage({ type: 'openFile', payload: { filePath } });
  });

  // ── Drag end → restart particles ──
  renderer.setOnDragEnd(() => {
    animation.dispose();
    const particlesLayer = renderer.getParticlesLayer();
    animation.init(particlesLayer);
    animation.createParticles(renderer.getEdgePaths());
    animation.start();
  });

  // ── Model hover → tooltip ──
  renderer.setOnNodeHover((model: ModelNode | null, x: number, y: number) => {
    if (model) {
      tooltip.innerHTML = getModelTooltipHtml(model);
      tooltip.style.display = 'block';
      tooltip.style.left = `${x + 12}px`;
      tooltip.style.top = `${y + 12}px`;
    } else {
      tooltip.style.display = 'none';
    }
  });

  // ── Column hover → tooltip with description & type ──
  renderer.setOnColumnHover((col, x, y) => {
    if (col) {
      const typeStr = col.dataType ? `<div class="tip-type">${col.dataType}</div>` : '';
      const descStr = col.description ? `<div class="tip-desc">${col.description}</div>` : '';
      tooltip.innerHTML = `<div class="tip-title">${col.name}</div>${typeStr}${descStr}`;
      if (typeStr || descStr) {
        tooltip.style.display = 'block';
        tooltip.style.left = `${x + 12}px`;
        tooltip.style.top = `${y + 12}px`;
      }
    } else {
      tooltip.style.display = 'none';
    }
  });

  // ── Edge hover → tooltip with transformation info ──
  renderer.setOnEdgeHover((edge: ColumnEdge | null, x: number, y: number) => {
    if (edge) {
      const srcCol = edge.sourceColumnId.split('::')[1] || '';
      const tgtCol = edge.targetColumnId.split('::')[1] || '';
      const srcModel = edge.sourceModelId.split('.').pop() || '';
      const tgtModel = edge.targetModelId.split('.').pop() || '';
      const typeLabel = edge.transformationType;

      tooltip.innerHTML = `
        <div class="tip-title">
          <span class="tip-edge-label ${typeLabel}">${typeLabel}</span>
        </div>
        <div class="tip-type">${srcModel}.${srcCol} → ${tgtModel}.${tgtCol}</div>
      `;
      tooltip.style.display = 'block';
      tooltip.style.left = `${x + 12}px`;
      tooltip.style.top = `${y + 12}px`;
    } else {
      tooltip.style.display = 'none';
    }
  });

  // ── Search with visual highlighting ──
  searchInput.addEventListener('input', () => {
    if (!graph) return;
    const query = searchInput.value;
    if (!query.trim()) {
      renderer.clearSearch();
      return;
    }

    const results = searchGraph(query, graph);
    renderer.highlightSearch(results.modelIds, results.columnIds);

    if (results.modelIds.size > 0) {
      const firstModelId = results.modelIds.values().next().value;
      if (firstModelId) renderer.centerOnModel(firstModelId);
    }
  });

  // ── Click background to clear ──
  container.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.tagName === 'svg' || target.classList.contains('root')) {
      renderer.clearHighlights();
      animation.setHighlightedEdges(null);
    }
  });

  function renderGraph(graphData: LineageGraph) {
    graph = graphData;
    loading.style.display = 'none';

    const edgeCount = graph.columnEdges.length;
    stats.textContent = `${graph.metadata.totalModels} models · ${graph.metadata.totalColumns} columns · ${edgeCount} edges · ${graph.metadata.parseSuccessRate}% parsed`;

    if (graph.focusModelId) {
      const focusedModel = graph.models.find((m) => m.id === graph!.focusModelId);
      if (focusedModel) {
        focusBadge.textContent = `Focused: ${focusedModel.name}`;
        focusBadge.style.display = 'inline-block';
        directionFilter.style.display = 'flex';
      }
    } else {
      focusBadge.style.display = 'none';
      directionFilter.style.display = 'none';
    }

    renderer.render(graph);

    const particlesLayer = renderer.getParticlesLayer();
    animation.init(particlesLayer);
    animation.createParticles(renderer.getEdgePaths());
    animation.start();
  }

  window.addEventListener('message', (event) => {
    const message = event.data as ExtensionToWebviewMessage;
    switch (message.type) {
      case 'setGraphData': renderGraph(message.payload); break;
      case 'highlightModel': renderer.centerOnModel(message.payload.modelId); break;
      case 'focusModel': break;
      case 'updateTheme': break;
    }
  });

  vscode.postMessage({ type: 'ready' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
