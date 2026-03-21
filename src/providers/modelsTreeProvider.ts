import * as vscode from 'vscode';
import { LineageGraph, ModelNode, ColumnNode } from '../lineage/graphTypes';

type TreeItem = ModelTreeItem | ColumnTreeItem;

class ModelTreeItem extends vscode.TreeItem {
  constructor(public readonly model: ModelNode) {
    super(model.name, vscode.TreeItemCollapsibleState.Collapsed);

    const icon = model.resourceType === 'source' ? 'database' : 'symbol-class';
    this.iconPath = new vscode.ThemeIcon(icon);
    this.description = `${model.materialization} · ${model.columns.length} cols`;
    this.tooltip = new vscode.MarkdownString(
      `**${model.name}**\n\n` +
      `Type: ${model.resourceType}\n\n` +
      `Materialization: ${model.materialization}\n\n` +
      `Schema: ${model.database}.${model.schema}\n\n` +
      (model.description ? `${model.description}\n\n` : '') +
      `Parse status: ${model.parseStatus}`
    );

    this.contextValue = 'model';

    // Click model → show lineage focused on this model
    this.command = {
      command: 'dbtFlowLineage.showLineageForModelId',
      title: 'Show Lineage',
      arguments: [model.id],
    };
  }
}

class ColumnTreeItem extends vscode.TreeItem {
  constructor(
    public readonly column: ColumnNode,
    public readonly modelId: string
  ) {
    super(column.name, vscode.TreeItemCollapsibleState.None);

    this.iconPath = new vscode.ThemeIcon('symbol-field');
    this.description = column.dataType || '';
    this.tooltip = new vscode.MarkdownString(
      `**${column.name}**\n\n` +
      (column.dataType ? `Type: ${column.dataType}\n\n` : '') +
      (column.description ? column.description : '_No description_')
    );

    this.contextValue = 'column';
  }
}

export class ModelsTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private graph: LineageGraph | null;

  constructor(graph: LineageGraph | null) {
    this.graph = graph;
  }

  refresh(graph: LineageGraph | null) {
    this.graph = graph;
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!this.graph) {
      return [];
    }

    if (!element) {
      // Root level: show models sorted by name
      const models = [...this.graph.models].sort((a, b) => a.name.localeCompare(b.name));

      // Group: sources first, then models
      const sources = models.filter((m) => m.resourceType === 'source');
      const modelNodes = models.filter((m) => m.resourceType === 'model');

      return [...sources, ...modelNodes].map((m) => new ModelTreeItem(m));
    }

    if (element instanceof ModelTreeItem) {
      // Model children: show columns
      return element.model.columns.map(
        (col) => new ColumnTreeItem(col, element.model.id)
      );
    }

    return [];
  }
}
