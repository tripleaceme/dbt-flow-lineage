import * as vscode from 'vscode';
import { ArtifactLocator } from './artifacts/locator';
import { ManifestParser } from './artifacts/manifestParser';
import { CatalogParser } from './artifacts/catalogParser';
import { ArtifactWatcher } from './artifacts/watcher';
import { ColumnLineageBuilder } from './lineage/columnLineageBuilder';
import { LineageWebviewProvider } from './webview/webviewProvider';
import { ModelsTreeProvider } from './providers/modelsTreeProvider';
import { LineageCodeLensProvider } from './providers/codeLensProvider';
import { OutputBanner } from './welcome/outputBanner';
import { WelcomeProvider } from './welcome/welcomeProvider';
import { LineageGraph } from './lineage/graphTypes';

let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('dbt Flow Lineage');

  // Locate dbt artifacts
  const locator = new ArtifactLocator();
  const projectInfo = await locator.findProject();

  if (!projectInfo) {
    outputChannel.appendLine('No dbt project found in workspace.');
    return;
  }

  // Parse artifacts and build lineage
  const manifestParser = new ManifestParser();
  const catalogParser = new CatalogParser();
  const lineageBuilder = new ColumnLineageBuilder();

  let lineageGraph: LineageGraph | null = null;

  async function buildLineage(): Promise<LineageGraph | null> {
    try {
      const manifest = await manifestParser.parse(projectInfo!.manifestPath);
      if (!manifest) {
        outputChannel.appendLine('Could not parse manifest.json');
        return null;
      }

      const catalog = projectInfo!.catalogPath
        ? await catalogParser.parse(projectInfo!.catalogPath)
        : null;

      const graph = lineageBuilder.build(manifest, catalog, projectInfo!.projectName);

      outputChannel.appendLine(
        `Lineage built: ${graph.metadata.totalModels} models, ` +
        `${graph.metadata.totalColumns} columns, ` +
        `${graph.metadata.parseSuccessRate}% parse rate`
      );

      return graph;
    } catch (err) {
      outputChannel.appendLine(`Error building lineage: ${err}`);
      return null;
    }
  }

  lineageGraph = await buildLineage();

  // Show startup banner
  const banner = new OutputBanner(outputChannel);
  banner.show(projectInfo.projectName, lineageGraph);

  // Show welcome page on first install
  const welcome = new WelcomeProvider(context);
  welcome.showIfFirstTime();

  // Tree view provider (sidebar)
  const treeProvider = new ModelsTreeProvider(lineageGraph);
  vscode.window.registerTreeDataProvider('dbtFlowLineage.modelsTree', treeProvider);

  // CodeLens provider
  const codeLensProvider = new LineageCodeLensProvider(lineageGraph);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'sql', scheme: 'file' },
      codeLensProvider
    )
  );

  // Webview provider
  const webviewProvider = new LineageWebviewProvider(context.extensionUri, lineageGraph);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('dbtFlowLineage.showLineage', () => {
      webviewProvider.show(context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dbtFlowLineage.showLineageForModel', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Open a dbt model .sql file first.');
        return;
      }
      webviewProvider.show(context, editor.document.uri);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dbtFlowLineage.refresh', async () => {
      lineageGraph = await buildLineage();
      treeProvider.refresh(lineageGraph);
      codeLensProvider.refresh(lineageGraph);
      webviewProvider.updateGraph(lineageGraph);
      vscode.window.showInformationMessage('dbt Flow: Lineage refreshed.');
    })
  );

  // File watcher for auto-refresh
  const watcher = new ArtifactWatcher(projectInfo.targetDir);
  context.subscriptions.push(
    watcher.onDidChange(async () => {
      lineageGraph = await buildLineage();
      treeProvider.refresh(lineageGraph);
      codeLensProvider.refresh(lineageGraph);
      webviewProvider.updateGraph(lineageGraph);
    })
  );
  context.subscriptions.push(watcher);

  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBar.text = lineageGraph
    ? `$(type-hierarchy) dbt Flow: ${lineageGraph.metadata.totalModels} models`
    : '$(type-hierarchy) dbt Flow: No data';
  statusBar.command = 'dbtFlowLineage.showLineage';
  statusBar.tooltip = 'Click to open column lineage graph';
  statusBar.show();
  context.subscriptions.push(statusBar);
}

export function deactivate() {}
