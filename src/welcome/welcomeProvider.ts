import * as vscode from 'vscode';

const WELCOME_STATE_KEY = 'dbtFlowLineage.hasSeenWelcome';
const WELCOME_VERSION_KEY = 'dbtFlowLineage.lastSeenVersion';
const CURRENT_VERSION = '0.1.0';

export class WelcomeProvider {
  constructor(private context: vscode.ExtensionContext) {}

  showIfFirstTime() {
    const config = vscode.workspace.getConfiguration('dbtFlowLineage');
    if (!config.get<boolean>('showWelcomeOnStartup', true)) {
      return;
    }

    const lastVersion = this.context.globalState.get<string>(WELCOME_VERSION_KEY);
    if (lastVersion === CURRENT_VERSION) {
      return; // Already seen for this version
    }

    this.context.globalState.update(WELCOME_VERSION_KEY, CURRENT_VERSION);
    this.showWelcomePage();
  }

  private showWelcomePage() {
    const panel = vscode.window.createWebviewPanel(
      'dbtFlowLineageWelcome',
      'Welcome to dbt Flow Lineage',
      vscode.ViewColumn.One,
      { enableScripts: false }
    );

    panel.webview.html = this.getWelcomeHtml();
  }

  private getWelcomeHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to dbt Flow Lineage</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background, #1e1e1e);
      --text: var(--vscode-editor-foreground, #cccccc);
      --text-dim: var(--vscode-descriptionForeground, #8b8b8b);
      --accent: var(--vscode-textLink-foreground, #3b82f6);
      --border: var(--vscode-panel-border, #404040);
      --card-bg: var(--vscode-sideBar-background, #252526);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: 14px;
      line-height: 1.6;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }

    .hero {
      text-align: center;
      margin-bottom: 48px;
      padding: 40px 0;
    }

    .hero h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .hero .version {
      color: var(--text-dim);
      font-size: 14px;
      margin-bottom: 16px;
    }

    .hero .tagline {
      font-size: 18px;
      color: var(--text-dim);
    }

    .logo {
      font-size: 48px;
      margin-bottom: 16px;
      display: block;
    }

    .features {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 48px;
    }

    .feature-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 24px;
    }

    .feature-card .icon {
      font-size: 24px;
      margin-bottom: 12px;
      display: block;
    }

    .feature-card h3 {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .feature-card p {
      color: var(--text-dim);
      font-size: 13px;
    }

    .getting-started {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 32px;
      margin-bottom: 32px;
    }

    .getting-started h2 {
      font-size: 20px;
      margin-bottom: 20px;
    }

    .step {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
    }

    .step-number {
      background: var(--accent);
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }

    .step-content h4 {
      font-size: 14px;
      margin-bottom: 4px;
    }

    .step-content p {
      color: var(--text-dim);
      font-size: 13px;
    }

    .colors {
      display: flex;
      gap: 24px;
      justify-content: center;
      margin: 32px 0;
    }

    .color-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .color-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .footer {
      text-align: center;
      color: var(--text-dim);
      font-size: 12px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }

    .footer a {
      color: var(--accent);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="hero">
    <span class="logo">⟡</span>
    <h1>dbt Flow Lineage</h1>
    <div class="version">v0.1.0</div>
    <div class="tagline">Animated column-level lineage visualization for dbt</div>
  </div>

  <div class="features">
    <div class="feature-card">
      <span class="icon">⟡</span>
      <h3>Animated Data Flow</h3>
      <p>Watch data propagate through your models with flowing particle animations along column edges.</p>
    </div>
    <div class="feature-card">
      <span class="icon">⊞</span>
      <h3>Column-Level Lineage</h3>
      <p>See exactly which upstream columns feed into each downstream column, with transformation type classification.</p>
    </div>
    <div class="feature-card">
      <span class="icon">◎</span>
      <h3>Interactive Tracing</h3>
      <p>Click any column to highlight its full upstream and downstream path. Everything else fades away.</p>
    </div>
    <div class="feature-card">
      <span class="icon">⧉</span>
      <h3>Native IDE Integration</h3>
      <p>Activity Bar sidebar, CodeLens annotations, right-click menus, and status bar — all built in.</p>
    </div>
  </div>

  <div class="colors">
    <div class="color-item">
      <div class="color-dot" style="background: #3b82f6"></div>
      Passthrough
    </div>
    <div class="color-item">
      <div class="color-dot" style="background: #f59e0b"></div>
      Transform
    </div>
    <div class="color-item">
      <div class="color-dot" style="background: #8b5cf6"></div>
      Aggregate
    </div>
  </div>

  <div class="getting-started">
    <h2>Getting Started</h2>

    <div class="step">
      <div class="step-number">1</div>
      <div class="step-content">
        <h4>Generate dbt artifacts</h4>
        <p>Run <code>dbt compile</code> or <code>dbt docs generate</code> in your project to create manifest.json.</p>
      </div>
    </div>

    <div class="step">
      <div class="step-number">2</div>
      <div class="step-content">
        <h4>Open the lineage graph</h4>
        <p>Click the Flow icon in the Activity Bar (left sidebar), or right-click any .sql file and select "Show Column Lineage".</p>
      </div>
    </div>

    <div class="step">
      <div class="step-number">3</div>
      <div class="step-content">
        <h4>Explore your data flow</h4>
        <p>Click any column to trace its full lineage path. Double-click a model header to jump to the SQL file. Use the search bar to find specific models or columns.</p>
      </div>
    </div>
  </div>

  <div class="footer">
    dbt Flow Lineage is open source. Report issues and contribute on GitHub.
  </div>
</body>
</html>`;
  }
}
