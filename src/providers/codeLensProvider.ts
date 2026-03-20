import * as vscode from 'vscode';
import { LineageGraph } from '../lineage/graphTypes';

/**
 * Provides CodeLens annotations above SELECT statements in dbt model SQL files.
 * Shows "View column lineage →" that opens the lineage graph centered on that model.
 */
export class LineageCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private graph: LineageGraph | null;

  constructor(graph: LineageGraph | null) {
    this.graph = graph;
  }

  refresh(graph: LineageGraph | null) {
    this.graph = graph;
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.graph) return [];

    // Check if this file corresponds to a model in the graph
    const relativePath = vscode.workspace.asRelativePath(document.uri);
    const model = this.graph.models.find(
      (m) => m.filePath && relativePath.endsWith(m.filePath)
    );

    if (!model) return [];

    const lenses: vscode.CodeLens[] = [];
    const text = document.getText();

    // Find SELECT statements (case-insensitive)
    const selectRegex = /\bselect\b/gi;
    let match: RegExpExecArray | null;

    while ((match = selectRegex.exec(text)) !== null) {
      const pos = document.positionAt(match.index);
      const range = new vscode.Range(pos, pos);

      const colCount = model.columns.length;
      const edgeCount = this.graph.columnEdges.filter(
        (e) => e.sourceModelId === model.id || e.targetModelId === model.id
      ).length;

      lenses.push(
        new vscode.CodeLens(range, {
          title: `$(type-hierarchy) View column lineage → ${colCount} columns, ${edgeCount} edges`,
          command: 'dbtFlowLineage.showLineageForModel',
          tooltip: 'Open animated column lineage graph for this model',
        })
      );

      // Only add one CodeLens per file (first SELECT)
      break;
    }

    return lenses;
  }
}
