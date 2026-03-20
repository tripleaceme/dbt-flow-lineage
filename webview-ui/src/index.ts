import { GraphRenderer } from './graph/renderer';
import { AnimationEngine } from './graph/animation';
import { traceColumnPath } from './graph/highlight';
import { searchGraph, getModelTooltipHtml } from './graph/interaction';
import { LineageGraph, ExtensionToWebviewMessage, ModelNode } from '../../src/lineage/graphTypes';

// VS Code webview API
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

  renderer = new GraphRenderer(container);
  renderer.init();

  animation = new AnimationEngine();

  // Wire up column click → highlight path + animate
  renderer.setOnColumnClick((columnId, modelId) => {
    if (!graph) return;

    const edgeIds = traceColumnPath(columnId, modelId, graph);

    if (edgeIds.size === 0) return;

    renderer.highlightEdges(edgeIds);
    animation.setHighlightedEdges(edgeIds);
  });

  // Wire up model double-click → open file in editor
  renderer.setOnModelDblClick((filePath) => {
    vscode.postMessage({ type: 'openFile', payload: { filePath } });
  });

  // Wire up hover → tooltip
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

  // Search
  searchInput.addEventListener('input', () => {
    if (!graph) return;

    const query = searchInput.value;
    if (!query.trim()) {
      renderer.clearHighlights();
      animation.setHighlightedEdges(null);
      return;
    }

    const results = searchGraph(query, graph);
    if (results.modelIds.size > 0) {
      // Center on first match
      const firstModelId = results.modelIds.values().next().value;
      if (firstModelId) {
        renderer.centerOnModel(firstModelId);
      }
    }
  });

  // Click background to clear selection
  container.addEventListener('click', (event) => {
    const target = event.target as Element;
    if (target.tagName === 'svg' || target.classList.contains('root')) {
      renderer.clearHighlights();
      animation.setHighlightedEdges(null);
    }
  });

  // Listen for messages from extension host
  window.addEventListener('message', (event) => {
    const message = event.data as ExtensionToWebviewMessage;

    switch (message.type) {
      case 'setGraphData':
        graph = message.payload;
        loading.style.display = 'none';

        stats.textContent = `${graph.metadata.totalModels} models · ${graph.metadata.totalColumns} columns · ${graph.metadata.parseSuccessRate}% parsed`;

        renderer.render(graph);

        // Set up particles on all edges
        const particlesLayer = renderer.getParticlesLayer();
        animation.init(particlesLayer);
        animation.createParticles(renderer.getEdgePaths());
        animation.start();
        break;

      case 'highlightModel':
        renderer.centerOnModel(message.payload.modelId);
        break;

      case 'updateTheme':
        // Theme updates handled via CSS variables automatically
        break;
    }
  });

  // Tell extension we're ready
  vscode.postMessage({ type: 'ready' });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
