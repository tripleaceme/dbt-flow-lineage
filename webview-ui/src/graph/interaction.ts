import { LineageGraph, ModelNode } from '../../../src/lineage/graphTypes';

/**
 * Handles search filtering — returns model/column IDs matching the query.
 */
export function searchGraph(
  query: string,
  graph: LineageGraph
): { modelIds: Set<string>; columnIds: Set<string> } {
  const modelIds = new Set<string>();
  const columnIds = new Set<string>();

  if (!query.trim()) return { modelIds, columnIds };

  const q = query.toLowerCase();

  for (const model of graph.models) {
    if (model.name.toLowerCase().includes(q)) {
      modelIds.add(model.id);
    }

    for (const col of model.columns) {
      if (col.name.toLowerCase().includes(q)) {
        columnIds.add(col.id);
        modelIds.add(model.id);
      }
    }
  }

  return { modelIds, columnIds };
}

/**
 * Builds tooltip HTML for a model node.
 */
export function getModelTooltipHtml(model: ModelNode): string {
  const statusIcon =
    model.parseStatus === 'parsed' ? '&#9679;' :
    model.parseStatus === 'fallback' ? '&#9675;' : '&#9888;';

  const statusColor =
    model.parseStatus === 'parsed' ? '#4ade80' :
    model.parseStatus === 'fallback' ? '#fbbf24' : '#ef4444';

  return `
    <div class="tip-title">${model.name}</div>
    <div class="tip-type">
      ${model.resourceType} · ${model.materialization}
      <span style="color:${statusColor}">${statusIcon}</span>
    </div>
    <div class="tip-type">${model.database}.${model.schema}</div>
    <div class="tip-type">${model.columns.length} columns</div>
    ${model.description ? `<div class="tip-desc">${model.description}</div>` : ''}
  `;
}
