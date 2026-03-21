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

  // Locate dbt project (uses saved selection or shows picker)
  const locator = new ArtifactLocator();
  const projectInfo = await locator.findProject(context);

  if (!projectInfo) {
    outputChannel.appendLine('No dbt project found in workspace.');
    return;
  }

  outputChannel.appendLine(`Project: ${projectInfo.projectName} (${projectInfo.projectRoot})`);

  const manifestParser = new ManifestParser();
  const catalogParser = new CatalogParser();
  const lineageBuilder = new ColumnLineageBuilder();

  let lineageGraph: LineageGraph | null = null;
  let lastParseError = false;

  async function buildLineage(): Promise<LineageGraph | null> {
    if (!projectInfo!.hasManifest) {
      if (!lastParseError) {
        outputChannel.appendLine(
          'No manifest.json found. Run `dbt compile` or `dbt docs generate` first.'
        );
        lastParseError = true;
      }
      return null;
    }

    try {
      const manifest = await manifestParser.parse(projectInfo!.manifestPath);
      if (!manifest) {
        if (!lastParseError) {
          outputChannel.appendLine('Could not parse manifest.json — file may be corrupted.');
          lastParseError = true;
        }
        return null;
      }

      const catalog = projectInfo!.catalogPath
        ? await catalogParser.parse(projectInfo!.catalogPath)
        : null;

      const graph = lineageBuilder.build(manifest, catalog, projectInfo!.projectName);

      lastParseError = false;
      outputChannel.appendLine(
        `Lineage built: ${graph.metadata.totalModels} models, ` +
        `${graph.metadata.totalColumns} columns, ` +
        `${graph.metadata.parseSuccessRate}% parse rate`
      );

      return graph;
    } catch (err) {
      if (!lastParseError) {
        outputChannel.appendLine(`Error building lineage: ${err}`);
        lastParseError = true;
      }
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

  // Resolve model ID from a file URI
  function resolveModelId(uri: vscode.Uri): string | null {
    if (!lineageGraph) return null;
    const filePath = vscode.workspace.asRelativePath(uri);
    const model = lineageGraph.models.find(
      (m) => m.filePath && filePath.endsWith(m.filePath)
    );
    return model?.id || null;
  }

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
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'jinja-sql', scheme: 'file' },
      codeLensProvider
    )
  );

  // Webview provider
  const webviewProvider = new LineageWebviewProvider(context.extensionUri, lineageGraph);

  // Show full lineage graph
  context.subscriptions.push(
    vscode.commands.registerCommand('dbtFlowLineage.showLineage', () => {
      webviewProvider.show(context);
    })
  );

  // Show lineage focused on a specific model (from right-click or CodeLens)
  context.subscriptions.push(
    vscode.commands.registerCommand('dbtFlowLineage.showLineageForModel', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Open a dbt model .sql file first.');
        return;
      }
      const modelId = resolveModelId(editor.document.uri);
      if (modelId) {
        webviewProvider.show(context, modelId);
      } else {
        vscode.window.showInformationMessage(
          'This file is not a known dbt model. Try running `dbt compile` and refreshing.'
        );
      }
    })
  );

  // Show lineage for a model from the sidebar tree
  context.subscriptions.push(
    vscode.commands.registerCommand('dbtFlowLineage.showLineageForModelId', (modelId: string) => {
      webviewProvider.show(context, modelId);
    })
  );

  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand('dbtFlowLineage.refresh', async () => {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(projectInfo!.manifestPath));
        projectInfo!.hasManifest = true;
      } catch {
        projectInfo!.hasManifest = false;
      }

      lineageGraph = await buildLineage();
      treeProvider.refresh(lineageGraph);
      codeLensProvider.refresh(lineageGraph);
      webviewProvider.updateGraph(lineageGraph);

      if (lineageGraph) {
        vscode.window.showInformationMessage(
          `dbt Flow: Lineage refreshed — ${lineageGraph.metadata.totalModels} models loaded.`
        );
      } else {
        vscode.window.showWarningMessage(
          'dbt Flow: No manifest.json found. Run `dbt compile` first.'
        );
      }
    })
  );

  // Switch project command
  context.subscriptions.push(
    vscode.commands.registerCommand('dbtFlowLineage.switchProject', async () => {
      await ArtifactLocator.clearSavedProject(context);
      vscode.window.showInformationMessage(
        'dbt Flow: Project selection cleared. Reload window to pick a new project.'
      );
    })
  );

  // File watcher
  if (projectInfo.hasManifest) {
    const watcher = new ArtifactWatcher(projectInfo.targetDir);
    context.subscriptions.push(
      watcher.onDidChange(async () => {
        outputChannel.appendLine('Manifest changed — rebuilding lineage...');
        lineageGraph = await buildLineage();
        treeProvider.refresh(lineageGraph);
        codeLensProvider.refresh(lineageGraph);
        webviewProvider.updateGraph(lineageGraph);
      })
    );
    context.subscriptions.push(watcher);
  }

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
