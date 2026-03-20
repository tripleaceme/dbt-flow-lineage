import dagre from 'dagre';

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  id: string;
  points: Array<{ x: number; y: number }>;
}

export interface LayoutResult {
  nodes: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  width: number;
  height: number;
}

const MODEL_HEADER_HEIGHT = 32;
const COLUMN_ROW_HEIGHT = 24;
const MODEL_PADDING = 8;
const MODEL_MIN_WIDTH = 180;

export function computeLayout(
  models: Array<{ id: string; columns: Array<{ id: string }> }>,
  modelEdges: Array<{ sourceModelId: string; targetModelId: string }>
): LayoutResult {
  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: 'LR',
    nodesep: 60,
    ranksep: 120,
    edgesep: 20,
    marginx: 40,
    marginy: 40,
  });

  g.setDefaultEdgeLabel(() => ({}));

  // Add model nodes with computed dimensions
  for (const model of models) {
    const colCount = Math.max(model.columns.length, 1);
    const height = MODEL_HEADER_HEIGHT + colCount * COLUMN_ROW_HEIGHT + MODEL_PADDING * 2;
    const width = MODEL_MIN_WIDTH;

    g.setNode(model.id, { width, height });
  }

  // Add model-level edges (deduplicated)
  const edgeSet = new Set<string>();
  for (const edge of modelEdges) {
    const key = `${edge.sourceModelId}->${edge.targetModelId}`;
    if (!edgeSet.has(key) && g.hasNode(edge.sourceModelId) && g.hasNode(edge.targetModelId)) {
      edgeSet.add(key);
      g.setEdge(edge.sourceModelId, edge.targetModelId);
    }
  }

  dagre.layout(g);

  // Extract positioned nodes
  const nodes = new Map<string, LayoutNode>();
  for (const nodeId of g.nodes()) {
    const nodeData = g.node(nodeId);
    if (nodeData) {
      nodes.set(nodeId, {
        id: nodeId,
        x: nodeData.x - nodeData.width / 2,
        y: nodeData.y - nodeData.height / 2,
        width: nodeData.width,
        height: nodeData.height,
      });
    }
  }

  // Extract edges with waypoints
  const edges: LayoutEdge[] = [];
  for (const e of g.edges()) {
    const edgeData = g.edge(e);
    if (edgeData && edgeData.points) {
      edges.push({
        id: `${e.v}->${e.w}`,
        points: edgeData.points.map((p: any) => ({ x: p.x, y: p.y })),
      });
    }
  }

  const graphData = g.graph();

  return {
    nodes,
    edges,
    width: (graphData as any).width || 800,
    height: (graphData as any).height || 600,
  };
}

/**
 * Get the Y position of a specific column within its model node.
 * Used for drawing column-level edges to/from specific column dots.
 */
export function getColumnY(
  modelLayout: LayoutNode,
  columnIndex: number
): number {
  return modelLayout.y + MODEL_HEADER_HEIGHT + MODEL_PADDING + columnIndex * COLUMN_ROW_HEIGHT + COLUMN_ROW_HEIGHT / 2;
}

/**
 * Get the X position of a column's right dot (output connection point).
 */
export function getColumnRightX(modelLayout: LayoutNode): number {
  return modelLayout.x + modelLayout.width;
}

/**
 * Get the X position of a column's left dot (input connection point).
 */
export function getColumnLeftX(modelLayout: LayoutNode): number {
  return modelLayout.x;
}
