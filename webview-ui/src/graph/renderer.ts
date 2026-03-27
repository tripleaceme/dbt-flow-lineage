import * as d3 from 'd3';
import { LineageGraph, ModelNode, ColumnEdge } from '../../../src/lineage/graphTypes';
import {
  computeLayout,
  getColumnY,
  getColumnLeftX,
  getColumnRightX,
  LayoutNode,
} from './layout';

/**
 * Theme-aware colors: uses VS Code CSS variables with fallbacks.
 * Light theme, dark theme, and high contrast all work automatically.
 */
const EDGE_COLORS: Record<string, string> = {
  passthrough: '#3b82f6',
  rename: '#10b981',
  transform: '#f59e0b',
  aggregate: '#8b5cf6',
};

export class GraphRenderer {
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private rootGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private graph: LineageGraph | null = null;
  private layoutNodes = new Map<string, LayoutNode>();
  private columnIndexMap = new Map<string, number>();
  private onColumnClick: ((columnId: string, modelId: string) => void) | null = null;
  private onModelDblClick: ((filePath: string) => void) | null = null;
  private onNodeHover: ((model: ModelNode | null, x: number, y: number) => void) | null = null;
  private onColumnHover: ((col: { name: string; dataType: string | null; description: string } | null, x: number, y: number) => void) | null = null;
  private onEdgeHover: ((edge: ColumnEdge | null, x: number, y: number) => void) | null = null;
  private onDragEnd: (() => void) | null = null;

  constructor(private container: HTMLElement) {}

  init() {
    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%');

    this.rootGroup = this.svg.append('g').attr('class', 'root');

    this.rootGroup.append('g').attr('class', 'edges-layer');
    this.rootGroup.append('g').attr('class', 'particles-layer');
    this.rootGroup.append('g').attr('class', 'nodes-layer');

    this.zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.rootGroup.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    this.svg.on('click', (event) => {
      if (event.target === this.svg.node()) {
        this.clearHighlights();
      }
    });
  }

  setOnColumnClick(handler: (columnId: string, modelId: string) => void) { this.onColumnClick = handler; }
  setOnModelDblClick(handler: (filePath: string) => void) { this.onModelDblClick = handler; }
  setOnNodeHover(handler: (model: ModelNode | null, x: number, y: number) => void) { this.onNodeHover = handler; }
  setOnColumnHover(handler: (col: { name: string; dataType: string | null; description: string } | null, x: number, y: number) => void) { this.onColumnHover = handler; }
  setOnEdgeHover(handler: (edge: ColumnEdge | null, x: number, y: number) => void) { this.onEdgeHover = handler; }
  setOnDragEnd(handler: () => void) { this.onDragEnd = handler; }

  render(graph: LineageGraph) {
    this.graph = graph;

    this.columnIndexMap.clear();
    for (const model of graph.models) {
      model.columns.forEach((col, idx) => {
        this.columnIndexMap.set(col.id, idx);
      });
    }

    const allModelEdges = [
      ...graph.modelEdges,
      ...graph.columnEdges.map((e) => ({
        sourceModelId: e.sourceModelId,
        targetModelId: e.targetModelId,
      })),
    ];

    const layout = computeLayout(graph.models, allModelEdges);
    this.layoutNodes = layout.nodes;

    this.rootGroup.select('.nodes-layer').selectAll('*').remove();
    this.rootGroup.select('.edges-layer').selectAll('*').remove();
    this.rootGroup.select('.particles-layer').selectAll('*').remove();

    this.renderColumnEdges(graph.columnEdges);
    this.renderModelNodes(graph.models, graph.focusModelId);
    this.fitToView(layout.width, layout.height);
  }

  private renderModelNodes(models: ModelNode[], focusModelId?: string) {
    const nodesLayer = this.rootGroup.select<SVGGElement>('.nodes-layer');

    for (const model of models) {
      const pos = this.layoutNodes.get(model.id);
      if (!pos) continue;

      const isSource = model.resourceType === 'source';
      const isFocused = model.id === focusModelId;
      const group = nodesLayer
        .append('g')
        .attr('class', `model-node${isFocused ? ' focused-model' : ''}`)
        .attr('data-model-id', model.id)
        .attr('transform', `translate(${pos.x}, ${pos.y})`);

      // Drag behavior
      const dragBehavior = d3.drag<SVGGElement, unknown>()
        .on('start', (event) => { event.sourceEvent.stopPropagation(); })
        .on('drag', (event) => {
          pos.x += event.dx;
          pos.y += event.dy;
          group.attr('transform', `translate(${pos.x}, ${pos.y})`);
          this.redrawEdges();
        })
        .on('end', () => { if (this.onDragEnd) this.onDragEnd(); });
      group.call(dragBehavior);

      // Background — uses CSS classes for theme colors
      group.append('rect')
        .attr('class', `node-bg ${isSource ? 'source-bg' : 'model-bg'}`)
        .attr('width', pos.width).attr('height', pos.height)
        .attr('rx', 6).attr('ry', 6);

      // Header
      group.append('rect')
        .attr('class', `node-header ${isSource ? 'source-header' : 'model-header'}`)
        .attr('width', pos.width).attr('height', 28)
        .attr('rx', 6).attr('ry', 6);
      group.append('rect')
        .attr('class', `node-header ${isSource ? 'source-header' : 'model-header'}`)
        .attr('y', 14).attr('width', pos.width).attr('height', 14);

      // Model name
      group.append('text')
        .attr('class', 'header').attr('x', 10).attr('y', 18)
        .text(model.name)
        .on('dblclick', () => {
          if (model.filePath && this.onModelDblClick) this.onModelDblClick(model.filePath);
        });

      // Materialization badge
      group.append('text')
        .attr('class', 'badge')
        .attr('x', pos.width - 8).attr('y', 18)
        .attr('text-anchor', 'end')
        .text(model.materialization);

      // Model hover
      group
        .on('mouseenter', (event) => { if (this.onNodeHover) this.onNodeHover(model, event.pageX, event.pageY); })
        .on('mouseleave', () => { if (this.onNodeHover) this.onNodeHover(null, 0, 0); });

      // Columns
      model.columns.forEach((col, idx) => {
        const colY = 32 + 8 + idx * 24;

        // Column text — with hover for tooltip
        group.append('text')
          .attr('class', 'column-row')
          .attr('x', 20).attr('y', colY + 15)
          .attr('data-column-id', col.id)
          .text(col.name)
          .on('click', () => { if (this.onColumnClick) this.onColumnClick(col.id, model.id); })
          .on('mouseenter', (event) => { if (this.onColumnHover) this.onColumnHover(col, event.pageX, event.pageY); })
          .on('mouseleave', () => { if (this.onColumnHover) this.onColumnHover(null, 0, 0); });

        // Left dot
        group.append('circle')
          .attr('class', 'column-dot input-dot')
          .attr('cx', 0).attr('cy', colY + 12).attr('r', 4)
          .attr('data-column-id', col.id).attr('data-side', 'left');

        // Right dot
        group.append('circle')
          .attr('class', 'column-dot output-dot')
          .attr('cx', pos.width).attr('cy', colY + 12).attr('r', 4)
          .attr('data-column-id', col.id).attr('data-side', 'right');

        // Data type label
        if (col.dataType) {
          group.append('text')
            .attr('class', 'col-type')
            .attr('x', pos.width - 8).attr('y', colY + 15)
            .attr('text-anchor', 'end')
            .text(col.dataType.toLowerCase());
        }
      });
    }
  }

  private renderColumnEdges(edges: ColumnEdge[]) {
    const edgesLayer = this.rootGroup.select<SVGGElement>('.edges-layer');

    for (const edge of edges) {
      const sourceLayout = this.layoutNodes.get(edge.sourceModelId);
      const targetLayout = this.layoutNodes.get(edge.targetModelId);
      if (!sourceLayout || !targetLayout) continue;

      const sourceIdx = this.columnIndexMap.get(edge.sourceColumnId) ?? 0;
      const targetIdx = this.columnIndexMap.get(edge.targetColumnId) ?? 0;

      const sourceY = getColumnY(sourceLayout, sourceIdx);
      const targetY = getColumnY(targetLayout, targetIdx);
      const sourceX = getColumnRightX(sourceLayout);
      const targetX = getColumnLeftX(targetLayout);

      const midX = (sourceX + targetX) / 2;
      const pathData = `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;

      // Visible edge
      edgesLayer.append('path')
        .attr('class', `edge-path ${edge.transformationType}`)
        .attr('d', pathData)
        .attr('data-edge-id', edge.id)
        .attr('data-source-col', edge.sourceColumnId)
        .attr('data-target-col', edge.targetColumnId);

      // Invisible wider hit area for hover
      edgesLayer.append('path')
        .attr('class', 'edge-hitarea')
        .attr('d', pathData)
        .attr('data-edge-id', edge.id)
        .on('mouseenter', (event) => { if (this.onEdgeHover) this.onEdgeHover(edge, event.pageX, event.pageY); })
        .on('mouseleave', () => { if (this.onEdgeHover) this.onEdgeHover(null, 0, 0); });
    }
  }

  getEdgePaths(): Array<{
    element: SVGPathElement;
    edgeId: string;
    transformationType: string;
    sourceColumnId: string;
    targetColumnId: string;
  }> {
    const paths: Array<{
      element: SVGPathElement;
      edgeId: string;
      transformationType: string;
      sourceColumnId: string;
      targetColumnId: string;
    }> = [];

    this.rootGroup.select('.edges-layer')
      .selectAll<SVGPathElement, unknown>('.edge-path')
      .each(function () {
        const el = this as SVGPathElement;
        paths.push({
          element: el,
          edgeId: el.getAttribute('data-edge-id') || '',
          transformationType: el.classList.contains('passthrough') ? 'passthrough'
            : el.classList.contains('rename') ? 'rename'
            : el.classList.contains('aggregate') ? 'aggregate'
            : 'transform',
          sourceColumnId: el.getAttribute('data-source-col') || '',
          targetColumnId: el.getAttribute('data-target-col') || '',
        });
      });

    return paths;
  }

  getParticlesLayer(): SVGGElement {
    return this.rootGroup.select<SVGGElement>('.particles-layer').node()!;
  }

  /** Highlight search matches by adding glow to matching model nodes */
  highlightSearch(modelIds: Set<string>, columnIds: Set<string>) {
    this.rootGroup.selectAll<SVGGElement, unknown>('.model-node').each(function () {
      const modelId = this.getAttribute('data-model-id') || '';
      d3.select(this).classed('search-match', modelIds.has(modelId));
      d3.select(this).classed('search-dimmed', !modelIds.has(modelId) && modelIds.size > 0);
    });
    this.rootGroup.selectAll<SVGTextElement, unknown>('.column-row').each(function () {
      const colId = this.getAttribute('data-column-id') || '';
      d3.select(this).classed('search-col-match', columnIds.has(colId));
    });
  }

  clearSearch() {
    this.rootGroup.selectAll('.search-match').classed('search-match', false);
    this.rootGroup.selectAll('.search-dimmed').classed('search-dimmed', false);
    this.rootGroup.selectAll('.search-col-match').classed('search-col-match', false);
  }

  highlightEdges(edgeIds: Set<string>, connectedColumnIds: Set<string>) {
    this.rootGroup.selectAll('.edge-path').classed('dimmed', true);

    this.rootGroup.selectAll<SVGPathElement, unknown>('.edge-path').each(function () {
      const edgeId = this.getAttribute('data-edge-id') || '';
      if (edgeIds.has(edgeId)) {
        d3.select(this).classed('dimmed', false).classed('highlighted', true);
      }
    });

    const connectedModels = new Set<string>();
    if (this.graph) {
      for (const edge of this.graph.columnEdges) {
        if (edgeIds.has(edge.id)) {
          connectedModels.add(edge.sourceModelId);
          connectedModels.add(edge.targetModelId);
        }
      }
    }

    this.rootGroup.selectAll<SVGGElement, unknown>('.model-node').each(function () {
      const modelId = this.getAttribute('data-model-id') || '';
      if (!connectedModels.has(modelId)) d3.select(this).classed('dimmed', true);
    });

    this.rootGroup.selectAll<SVGTextElement, unknown>('.column-row').each(function () {
      const colId = this.getAttribute('data-column-id') || '';
      if (!connectedColumnIds.has(colId)) d3.select(this).classed('column-dimmed', true);
    });
    this.rootGroup.selectAll<SVGCircleElement, unknown>('.column-dot').each(function () {
      const colId = this.getAttribute('data-column-id') || '';
      if (!connectedColumnIds.has(colId)) d3.select(this).classed('column-dimmed', true);
    });
  }

  clearHighlights() {
    this.rootGroup.selectAll('.dimmed').classed('dimmed', false);
    this.rootGroup.selectAll('.highlighted').classed('highlighted', false);
    this.rootGroup.selectAll('.column-dimmed').classed('column-dimmed', false);
  }

  /** Export the SVG as a PNG data URL */
  async exportAsPNG(): Promise<string> {
    const svgNode = this.svg.node();
    if (!svgNode) throw new Error('No SVG to export');

    // Clone SVG and inline computed styles
    const clone = svgNode.cloneNode(true) as SVGSVGElement;
    const bbox = this.rootGroup.node()!.getBBox();
    const pad = 40;
    const w = Math.ceil(bbox.width + pad * 2);
    const h = Math.ceil(bbox.height + pad * 2);
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('viewBox', `${bbox.x - pad} ${bbox.y - pad} ${w} ${h}`);

    // Reset the root group transform so viewBox controls the viewport
    const rootClone = clone.querySelector('.root');
    if (rootClone) rootClone.setAttribute('transform', '');

    // Inline critical styles
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
      .node-bg, .model-bg { fill: #2d2d2d; stroke: #404040; }
      .source-bg { fill: #1a2332; stroke: #404040; }
      .node-header, .model-header { fill: #333333; }
      .source-header { fill: #1e3a5f; }
      .header { fill: #cccccc; font-size: 12px; font-weight: 600; font-family: sans-serif; }
      .badge, .col-type { fill: #888888; font-size: 9px; font-family: sans-serif; }
      .column-row { fill: #cccccc; font-size: 11px; font-family: sans-serif; }
      .column-dot { fill: #404040; }
      .edge-path { fill: none; stroke-width: 1.5; opacity: 0.6; }
      .edge-path.passthrough { stroke: #3b82f6; }
      .edge-path.rename { stroke: #10b981; }
      .edge-path.transform { stroke: #f59e0b; }
      .edge-path.aggregate { stroke: #8b5cf6; }
      .edge-hitarea { display: none; }
      .particle { display: none; }
    `;
    clone.insertBefore(styleEl, clone.firstChild);

    // Remove particles and hit areas from clone
    clone.querySelectorAll('.edge-hitarea, .particle').forEach((el) => el.remove());

    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = bbox.width + pad * 2;
        canvas.height = bbox.height + pad * 2;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  private redrawEdges() {
    if (!this.graph) return;
    const edgesLayer = this.rootGroup.select<SVGGElement>('.edges-layer');
    edgesLayer.selectAll('*').remove();
    this.rootGroup.select('.particles-layer').selectAll('*').remove();
    this.renderColumnEdges(this.graph.columnEdges);
  }

  fitToView(graphWidth: number, graphHeight: number) {
    const svgNode = this.svg.node();
    if (!svgNode) return;
    const { width, height } = svgNode.getBoundingClientRect();
    const scale = Math.min(width / (graphWidth + 80), height / (graphHeight + 80), 1);
    const tx = (width - graphWidth * scale) / 2;
    const ty = (height - graphHeight * scale) / 2;
    this.svg.call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  zoomBy(factor: number) {
    this.svg.transition().duration(200).call(this.zoom.scaleBy, factor);
  }
  zoomIn() { this.zoomBy(1.3); }
  zoomOut() { this.zoomBy(1 / 1.3); }

  resetZoom() {
    if (this.graph) {
      const allModelEdges = [
        ...this.graph.modelEdges,
        ...this.graph.columnEdges.map((e) => ({ sourceModelId: e.sourceModelId, targetModelId: e.targetModelId })),
      ];
      const layout = computeLayout(this.graph.models, allModelEdges);
      this.fitToView(layout.width, layout.height);
    }
  }

  centerOnModel(modelId: string) {
    const pos = this.layoutNodes.get(modelId);
    if (!pos) return;
    const svgNode = this.svg.node();
    if (!svgNode) return;
    const { width, height } = svgNode.getBoundingClientRect();
    const tx = width / 2 - (pos.x + pos.width / 2);
    const ty = height / 2 - (pos.y + pos.height / 2);
    this.svg.transition().duration(500)
      .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(1));
  }
}
