import * as vscode from 'vscode';
import { LineageGraph, WebviewToExtensionMessage } from '../lineage/graphTypes';
import { getWebviewContent } from './getWebviewContent';

export class LineageWebviewProvider {
  private panel: vscode.WebviewPanel | null = null;
  private lineageGraph: LineageGraph | null;
  private extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri, lineageGraph: LineageGraph | null) {
    this.extensionUri = extensionUri;
    this.lineageGraph = lineageGraph;
  }

  show(context: vscode.ExtensionContext, focusModelUri?: vscode.Uri) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      if (focusModelUri) {
        this.focusOnModel(focusModelUri);
      }
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'dbtFlowLineage',
      'dbt Flow Lineage',
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

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        switch (message.type) {
          case 'ready':
            this.sendGraphData();
            if (focusModelUri) {
              this.focusOnModel(focusModelUri);
            }
            break;
          case 'requestRefresh':
            vscode.commands.executeCommand('dbtFlowLineage.refresh');
            break;
          case 'openFile':
            this.openModelFile(message.payload.filePath);
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
    this.sendGraphData();
  }

  private sendGraphData() {
    if (this.panel && this.lineageGraph) {
      this.panel.webview.postMessage({
        type: 'setGraphData',
        payload: this.lineageGraph,
      });
    }
  }

  private focusOnModel(uri: vscode.Uri) {
    if (!this.panel || !this.lineageGraph) return;

    const filePath = vscode.workspace.asRelativePath(uri);
    const model = this.lineageGraph.models.find(
      (m) => m.filePath && filePath.endsWith(m.filePath)
    );

    if (model) {
      this.panel.webview.postMessage({
        type: 'highlightModel',
        payload: { modelId: model.id },
      });
    }
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
