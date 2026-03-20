import * as d3 from 'd3';
import { LineageGraph, ModelNode, ColumnEdge } from '../../../src/lineage/graphTypes';
import {
  computeLayout,
  getColumnY,
  getColumnLeftX,
  getColumnRightX,
  LayoutNode,
} from './layout';

const COLORS = {
  passthrough: '#3b82f6',
  transform: '#f59e0b',
  aggregate: '#8b5cf6',
  modelBg: '#2d2d2d',
  modelBgSource: '#1a2332',
  modelBorder: '#404040',
  headerBg: '#333333',
  headerBgSource: '#1e3a5f',
  text: '#cccccc',
  textDim: '#888888',
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

  constructor(private container: HTMLElement) {}

  init() {
    this.svg = d3
      .select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%');

    this.rootGroup = this.svg.append('g').attr('class', 'root');

    // Edge group (rendered below nodes)
    this.rootGroup.append('g').attr('class', 'edges-layer');
    // Particle group
    this.rootGroup.append('g').attr('class', 'particles-layer');
    // Node group
    this.rootGroup.append('g').attr('class', 'nodes-layer');

    // Zoom & pan
    this.zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.rootGroup.attr('transform', event.transform);
      });

    this.svg.call(this.zoom);

    // Click background to deselect
    this.svg.on('click', (event) => {
      if (event.target === this.svg.node()) {
        this.clearHighlights();
      }
    });
  }

  setOnColumnClick(handler: (columnId: string, modelId: string) => void) {
    this.onColumnClick = handler;
  }

  setOnModelDblClick(handler: (filePath: string) => void) {
    this.onModelDblClick = handler;
  }

  setOnNodeHover(handler: (model: ModelNode | null, x: number, y: number) => void) {
    this.onNodeHover = handler;
  }

  render(graph: LineageGraph) {
    this.graph = graph;

    // Build column index map
    this.columnIndexMap.clear();
    for (const model of graph.models) {
      model.columns.forEach((col, idx) => {
        this.columnIndexMap.set(col.id, idx);
      });
    }

    // Compute layout
    const allModelEdges = [
      ...graph.modelEdges,
      ...graph.columnEdges.map((e) => ({
        sourceModelId: e.sourceModelId,
        targetModelId: e.targetModelId,
      })),
    ];

    const layout = computeLayout(graph.models, allModelEdges);
    this.layoutNodes = layout.nodes;

    // Clear previous render
    this.rootGroup.select('.nodes-layer').selectAll('*').remove();
    this.rootGroup.select('.edges-layer').selectAll('*').remove();
    this.rootGroup.select('.particles-layer').selectAll('*').remove();

    // Render edges first (below nodes)
    this.renderColumnEdges(graph.columnEdges);

    // Render model nodes
    this.renderModelNodes(graph.models);

    // Fit to viewport
    this.fitToView(layout.width, layout.height);
  }

  private renderModelNodes(models: ModelNode[]) {
    const nodesLayer = this.rootGroup.select<SVGGElement>('.nodes-layer');

    for (const model of models) {
      const pos = this.layoutNodes.get(model.id);
      if (!pos) continue;

      const isSource = model.resourceType === 'source';
      const group = nodesLayer
        .append('g')
        .attr('class', 'model-node')
        .attr('data-model-id', model.id)
        .attr('transform', `translate(${pos.x}, ${pos.y})`);

      // Background rect
      group
        .append('rect')
        .attr('width', pos.width)
        .attr('height', pos.height)
        .attr('fill', isSource ? COLORS.modelBgSource : COLORS.modelBg)
        .attr('stroke', COLORS.modelBorder)
        .attr('rx', 6)
        .attr('ry', 6);

      // Header background
      group
        .append('rect')
        .attr('width', pos.width)
        .attr('height', 28)
        .attr('fill', isSource ? COLORS.headerBgSource : COLORS.headerBg)
        .attr('rx', 6)
        .attr('ry', 6);

      // Square off bottom corners of header
      group
        .append('rect')
        .attr('y', 14)
        .attr('width', pos.width)
        .attr('height', 14)
        .attr('fill', isSource ? COLORS.headerBgSource : COLORS.headerBg);

      // Model name
      group
        .append('text')
        .attr('class', 'header')
        .attr('x', 10)
        .attr('y', 18)
        .attr('fill', COLORS.text)
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .text(model.name)
        .on('dblclick', () => {
          if (model.filePath && this.onModelDblClick) {
            this.onModelDblClick(model.filePath);
          }
        });

      // Materialization badge
      group
        .append('text')
        .attr('x', pos.width - 8)
        .attr('y', 18)
        .attr('text-anchor', 'end')
        .attr('fill', COLORS.textDim)
        .attr('font-size', '9px')
        .text(model.materialization);

      // Hover for tooltip
      group
        .on('mouseenter', (event) => {
          if (this.onNodeHover) {
            this.onNodeHover(model, event.pageX, event.pageY);
          }
        })
        .on('mouseleave', () => {
          if (this.onNodeHover) {
            this.onNodeHover(null, 0, 0);
          }
        });

      // Columns
      model.columns.forEach((col, idx) => {
        const colY = 32 + 8 + idx * 24;

        // Column name text
        group
          .append('text')
          .attr('class', 'column-row')
          .attr('x', 20)
          .attr('y', colY + 15)
          .attr('fill', COLORS.text)
          .attr('font-size', '11px')
          .attr('data-column-id', col.id)
          .text(col.name)
          .on('click', () => {
            if (this.onColumnClick) {
              this.onColumnClick(col.id, model.id);
            }
          });

        // Left dot (input)
        group
          .append('circle')
          .attr('class', 'column-dot input-dot')
          .attr('cx', 0)
          .attr('cy', colY + 12)
          .attr('r', 4)
          .attr('fill', COLORS.modelBorder)
          .attr('data-column-id', col.id)
          .attr('data-side', 'left');

        // Right dot (output)
        group
          .append('circle')
          .attr('class', 'column-dot output-dot')
          .attr('cx', pos.width)
          .attr('cy', colY + 12)
          .attr('r', 4)
          .attr('fill', COLORS.modelBorder)
          .attr('data-column-id', col.id)
          .attr('data-side', 'right');

        // Data type label
        if (col.dataType) {
          group
            .append('text')
            .attr('x', pos.width - 8)
            .attr('y', colY + 15)
            .attr('text-anchor', 'end')
            .attr('fill', COLORS.textDim)
            .attr('font-size', '9px')
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

      // Cubic bezier for smooth curve
      const midX = (sourceX + targetX) / 2;
      const pathData = `M ${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;

      edgesLayer
        .append('path')
        .attr('class', `edge-path ${edge.transformationType}`)
        .attr('d', pathData)
        .attr('data-edge-id', edge.id)
        .attr('data-source-col', edge.sourceColumnId)
        .attr('data-target-col', edge.targetColumnId);
    }
  }

  /**
   * Returns all SVG path elements (for animation engine to attach particles).
   */
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

    this.rootGroup
      .select('.edges-layer')
      .selectAll<SVGPathElement, unknown>('.edge-path')
      .each(function () {
        const el = this as SVGPathElement;
        paths.push({
          element: el,
          edgeId: el.getAttribute('data-edge-id') || '',
          transformationType: el.classList.contains('passthrough')
            ? 'passthrough'
            : el.classList.contains('aggregate')
              ? 'aggregate'
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

  highlightEdges(edgeIds: Set<string>) {
    // Dim everything
    this.rootGroup.selectAll('.model-node').classed('dimmed', true);
    this.rootGroup.selectAll('.edge-path').classed('dimmed', true);

    // Undim highlighted edges and their connected models
    const connectedModels = new Set<string>();

    this.rootGroup
      .selectAll<SVGPathElement, unknown>('.edge-path')
      .each(function () {
        const edgeId = this.getAttribute('data-edge-id') || '';
        if (edgeIds.has(edgeId)) {
          d3.select(this).classed('dimmed', false).classed('highlighted', true);
        }
      });

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
      if (connectedModels.has(modelId)) {
        d3.select(this).classed('dimmed', false);
      }
    });
  }

  clearHighlights() {
    this.rootGroup.selectAll('.dimmed').classed('dimmed', false);
    this.rootGroup.selectAll('.highlighted').classed('highlighted', false);
  }

  fitToView(graphWidth: number, graphHeight: number) {
    const svgNode = this.svg.node();
    if (!svgNode) return;

    const { width, height } = svgNode.getBoundingClientRect();
    const scale = Math.min(width / (graphWidth + 80), height / (graphHeight + 80), 1);
    const tx = (width - graphWidth * scale) / 2;
    const ty = (height - graphHeight * scale) / 2;

    this.svg.call(
      this.zoom.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
  }

  centerOnModel(modelId: string) {
    const pos = this.layoutNodes.get(modelId);
    if (!pos) return;

    const svgNode = this.svg.node();
    if (!svgNode) return;

    const { width, height } = svgNode.getBoundingClientRect();
    const scale = 1;
    const tx = width / 2 - (pos.x + pos.width / 2) * scale;
    const ty = height / 2 - (pos.y + pos.height / 2) * scale;

    this.svg
      .transition()
      .duration(500)
      .call(this.zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }
}
