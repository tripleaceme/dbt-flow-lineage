import { LineageGraph, ColumnEdge } from '../../../src/lineage/graphTypes';

/**
 * Traces the full upstream and downstream path from a selected column.
 * Uses BFS to find all connected edges in both directions.
 */
export function traceColumnPath(
  columnId: string,
  modelId: string,
  graph: LineageGraph
): Set<string> {
  const highlightedEdgeIds = new Set<string>();

  // Index edges by source and target column for fast lookup
  const edgesBySource = new Map<string, ColumnEdge[]>();
  const edgesByTarget = new Map<string, ColumnEdge[]>();

  for (const edge of graph.columnEdges) {
    if (!edgesBySource.has(edge.sourceColumnId)) {
      edgesBySource.set(edge.sourceColumnId, []);
    }
    edgesBySource.get(edge.sourceColumnId)!.push(edge);

    if (!edgesByTarget.has(edge.targetColumnId)) {
      edgesByTarget.set(edge.targetColumnId, []);
    }
    edgesByTarget.get(edge.targetColumnId)!.push(edge);
  }

  // BFS downstream (follow edges where this column is the source)
  const downstreamQueue = [columnId];
  const visitedDownstream = new Set<string>();

  while (downstreamQueue.length > 0) {
    const currentCol = downstreamQueue.shift()!;
    if (visitedDownstream.has(currentCol)) continue;
    visitedDownstream.add(currentCol);

    const outgoing = edgesBySource.get(currentCol) || [];
    for (const edge of outgoing) {
      highlightedEdgeIds.add(edge.id);
      downstreamQueue.push(edge.targetColumnId);
    }
  }

  // BFS upstream (follow edges where this column is the target)
  const upstreamQueue = [columnId];
  const visitedUpstream = new Set<string>();

  while (upstreamQueue.length > 0) {
    const currentCol = upstreamQueue.shift()!;
    if (visitedUpstream.has(currentCol)) continue;
    visitedUpstream.add(currentCol);

    const incoming = edgesByTarget.get(currentCol) || [];
    for (const edge of incoming) {
      highlightedEdgeIds.add(edge.id);
      upstreamQueue.push(edge.sourceColumnId);
    }
  }

  return highlightedEdgeIds;
}
