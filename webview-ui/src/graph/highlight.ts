import { LineageGraph, ColumnEdge } from '../../../src/lineage/graphTypes';

export interface TraceResult {
  edgeIds: Set<string>;
  columnIds: Set<string>;
}

/**
 * Traces the full upstream and downstream path from a selected column.
 * Returns both the edge IDs (for edge highlighting) and column IDs
 * (for greying out unconnected columns).
 */
export function traceColumnPath(
  columnId: string,
  modelId: string,
  graph: LineageGraph
): TraceResult {
  const edgeIds = new Set<string>();
  const columnIds = new Set<string>();
  columnIds.add(columnId);

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

  // BFS downstream
  const downQueue = [columnId];
  const visitedDown = new Set<string>();
  while (downQueue.length > 0) {
    const current = downQueue.shift()!;
    if (visitedDown.has(current)) continue;
    visitedDown.add(current);
    columnIds.add(current);

    for (const edge of edgesBySource.get(current) || []) {
      edgeIds.add(edge.id);
      columnIds.add(edge.targetColumnId);
      downQueue.push(edge.targetColumnId);
    }
  }

  // BFS upstream
  const upQueue = [columnId];
  const visitedUp = new Set<string>();
  while (upQueue.length > 0) {
    const current = upQueue.shift()!;
    if (visitedUp.has(current)) continue;
    visitedUp.add(current);
    columnIds.add(current);

    for (const edge of edgesByTarget.get(current) || []) {
      edgeIds.add(edge.id);
      columnIds.add(edge.sourceColumnId);
      upQueue.push(edge.sourceColumnId);
    }
  }

  return { edgeIds, columnIds };
}
