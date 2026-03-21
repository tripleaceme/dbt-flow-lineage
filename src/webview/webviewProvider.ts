import * as vscode from 'vscode';
import { LineageGraph, LineageDirection, WebviewToExtensionMessage } from '../lineage/graphTypes';
import { getWebviewContent } from './getWebviewContent';

export class LineageWebviewProvider {
  private panel: vscode.WebviewPanel | null = null;
  private lineageGraph: LineageGraph | null;
  private extensionUri: vscode.Uri;
  private pendingFocusModelId: string | undefined;
  private currentDirection: LineageDirection = 'both';

  constructor(extensionUri: vscode.Uri, lineageGraph: LineageGraph | null) {
    this.extensionUri = extensionUri;
    this.lineageGraph = lineageGraph;
  }

  show(context: vscode.ExtensionContext, focusModelId?: string) {
    this.pendingFocusModelId = focusModelId;
    this.currentDirection = 'both';

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.sendGraphData(focusModelId);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'dbtFlowLineage',
      focusModelId ? 'dbt Flow: Model Lineage' : 'dbt Flow Lineage',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
        ],
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'sidebar-icon.svg');

    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'webview.js')
    );

    this.panel.webview.html = getWebviewContent(this.panel.webview, webviewUri);

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        switch (message.type) {
          case 'ready':
            this.sendGraphData(this.pendingFocusModelId);
            break;
          case 'requestRefresh':
            vscode.commands.executeCommand('dbtFlowLineage.refresh');
            break;
          case 'openFile':
            this.openModelFile(message.payload.filePath);
            break;
          case 'filterDirection':
            this.currentDirection = message.payload.direction;
            this.sendGraphData(this.pendingFocusModelId);
            break;
          case 'exportPNG':
            this.savePNG(message.payload.dataUrl);
            break;
        }
      },
      undefined,
      []
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  updateGraph(graph: LineageGraph | null) {
    this.lineageGraph = graph;
    this.sendGraphData(this.pendingFocusModelId);
  }

  private sendGraphData(focusModelId?: string) {
    if (!this.panel || !this.lineageGraph) return;

    let graphToSend: LineageGraph;

    if (focusModelId) {
      graphToSend = this.extractSubgraph(this.lineageGraph, focusModelId, this.currentDirection);
    } else {
      graphToSend = this.lineageGraph;
    }

    this.panel.webview.postMessage({
      type: 'setGraphData',
      payload: graphToSend,
    });
  }

  private extractSubgraph(
    fullGraph: LineageGraph,
    focusModelId: string,
    direction: LineageDirection
  ): LineageGraph {
    const connectedModelIds = new Set<string>();
    connectedModelIds.add(focusModelId);

    // BFS upstream (only if direction is 'both' or 'upstream')
    if (direction === 'both' || direction === 'upstream') {
      const upQueue = [focusModelId];
      const visitedUp = new Set<string>();
      while (upQueue.length > 0) {
        const current = upQueue.shift()!;
        if (visitedUp.has(current)) continue;
        visitedUp.add(current);
        connectedModelIds.add(current);

        for (const edge of fullGraph.modelEdges) {
          if (edge.targetModelId === current && !visitedUp.has(edge.sourceModelId)) {
            upQueue.push(edge.sourceModelId);
          }
        }
        for (const edge of fullGraph.columnEdges) {
          if (edge.targetModelId === current && !visitedUp.has(edge.sourceModelId)) {
            upQueue.push(edge.sourceModelId);
          }
        }
      }
    }

    // BFS downstream (only if direction is 'both' or 'downstream')
    if (direction === 'both' || direction === 'downstream') {
      const downQueue = [focusModelId];
      const visitedDown = new Set<string>();
      while (downQueue.length > 0) {
        const current = downQueue.shift()!;
        if (visitedDown.has(current)) continue;
        visitedDown.add(current);
        connectedModelIds.add(current);

        for (const edge of fullGraph.modelEdges) {
          if (edge.sourceModelId === current && !visitedDown.has(edge.targetModelId)) {
            downQueue.push(edge.targetModelId);
          }
        }
        for (const edge of fullGraph.columnEdges) {
          if (edge.sourceModelId === current && !visitedDown.has(edge.targetModelId)) {
            downQueue.push(edge.targetModelId);
          }
        }
      }
    }

    const models = fullGraph.models.filter((m) => connectedModelIds.has(m.id));
    const columnEdges = fullGraph.columnEdges.filter(
      (e) => connectedModelIds.has(e.sourceModelId) && connectedModelIds.has(e.targetModelId)
    );
    const modelEdges = fullGraph.modelEdges.filter(
      (e) => connectedModelIds.has(e.sourceModelId) && connectedModelIds.has(e.targetModelId)
    );

    return {
      models,
      columnEdges,
      modelEdges,
      focusModelId,
      metadata: {
        ...fullGraph.metadata,
        totalModels: models.length,
        totalColumns: models.reduce((sum, m) => sum + m.columns.length, 0),
      },
    };
  }

  private async savePNG(dataUrl: string) {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('lineage-graph.png'),
      filters: { 'PNG Image': ['png'] },
    });
    if (!uri) return;

    // Convert data URL to buffer
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    await vscode.workspace.fs.writeFile(uri, buffer);
    vscode.window.showInformationMessage(`Lineage graph exported to ${uri.fsPath}`);
  }

  private async openModelFile(filePath: string) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;

    for (const folder of workspaceFolders) {
      const fullUri = vscode.Uri.joinPath(folder.uri, filePath);
      try {
        await vscode.workspace.fs.stat(fullUri);
        const doc = await vscode.workspace.openTextDocument(fullUri);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        return;
      } catch {
        continue;
      }
    }
  }
}
