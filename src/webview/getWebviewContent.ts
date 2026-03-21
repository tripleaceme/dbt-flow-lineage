import * as vscode from 'vscode';

export function getWebviewContent(webview: vscode.Webview, scriptUri: vscode.Uri): string {
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
    script-src 'nonce-${nonce}';
    style-src 'unsafe-inline';
    font-src ${webview.cspSource};">
  <title>dbt Flow Lineage</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background, #1e1e1e);
      --bg-secondary: var(--vscode-sideBar-background, #252526);
      --text-primary: var(--vscode-editor-foreground, #cccccc);
      --text-secondary: var(--vscode-descriptionForeground, #8b8b8b);
      --border-color: var(--vscode-panel-border, #404040);
      --accent: var(--vscode-focusBorder, #007fd4);
      --passthrough-color: #3b82f6;
      --rename-color: #10b981;
      --transform-color: #f59e0b;
      --aggregate-color: #8b5cf6;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }

    #app {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    #toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    #toolbar .search-box {
      background: var(--vscode-input-background, #3c3c3c);
      border: 1px solid var(--vscode-input-border, #555);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      width: 240px;
      outline: none;
    }

    #toolbar .search-box:focus {
      border-color: var(--accent);
    }

    #toolbar .legend {
      display: flex;
      gap: 16px;
      margin-left: auto;
      font-size: 11px;
      color: var(--text-secondary);
    }

    #toolbar .legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    #toolbar .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    #toolbar .stats {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .direction-filter {
      display: flex;
      gap: 2px;
      background: var(--vscode-input-background, #3c3c3c);
      border-radius: 4px;
      padding: 2px;
    }

    .dir-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .dir-btn:hover {
      color: var(--text-primary);
    }

    .dir-btn.active {
      background: var(--accent);
      color: white;
    }

    #toolbar .focus-badge {
      background: var(--accent);
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    #graph-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    #graph-container svg {
      width: 100%;
      height: 100%;
    }

    /* Model node styles */
    .model-node rect {
      rx: 6;
      ry: 6;
      stroke-width: 1;
    }

    .model-node.focused-model rect:first-child {
      stroke: var(--accent) !important;
      stroke-width: 2;
    }

    .model-node .header {
      font-weight: 600;
      font-size: 12px;
    }

    .model-node .column-row {
      font-size: 11px;
      cursor: pointer;
    }

    .model-node .column-row:hover {
      fill: var(--accent);
    }

    .model-node .column-dot {
      r: 4;
      cursor: pointer;
      transition: r 0.15s ease;
    }

    .model-node .column-dot:hover {
      r: 6;
    }

    /* Edge styles */
    .edge-path {
      fill: none;
      stroke-width: 1.5;
      opacity: 0.6;
    }

    .edge-path.passthrough { stroke: var(--passthrough-color); }
    .edge-path.rename { stroke: var(--rename-color); }
    .edge-path.transform { stroke: var(--transform-color); }
    .edge-path.aggregate { stroke: var(--aggregate-color); }

    /* Particle (animated dot flowing along edge) */
    .particle {
      pointer-events: none;
    }

    .particle.passthrough { fill: var(--passthrough-color); }
    .particle.rename { fill: var(--rename-color); }
    .particle.transform { fill: var(--transform-color); }
    .particle.aggregate { fill: var(--aggregate-color); }

    /* Dimmed state when a column is selected */
    .dimmed { opacity: 0.1 !important; }
    .highlighted .edge-path { opacity: 1; stroke-width: 2.5; }
    .highlighted .particle { r: 4; }

    /* Column-level dimming: individual unlinked columns go grey */
    .column-dimmed {
      opacity: 0.15 !important;
    }

    /* Draggable cursor on model headers */
    .model-node .header {
      cursor: grab;
    }

    .model-node .header:active {
      cursor: grabbing;
    }

    /* Tooltip */
    #tooltip {
      position: absolute;
      display: none;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 12px;
      pointer-events: none;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 100;
    }

    #tooltip .tip-title { font-weight: 600; margin-bottom: 4px; }
    #tooltip .tip-type { color: var(--text-secondary); font-size: 11px; }
    #tooltip .tip-desc { margin-top: 4px; color: var(--text-secondary); }

    /* Loading state */
    #loading {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 12px;
      color: var(--text-secondary);
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border-color);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* Zoom controls */
    .zoom-controls {
      position: absolute;
      bottom: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 50;
    }

    .zoom-btn {
      width: 32px;
      height: 32px;
      border: 1px solid var(--border-color);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 16px;
      font-weight: 700;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
      line-height: 1;
    }

    .zoom-btn:hover {
      background: var(--border-color);
    }

    .zoom-btn .kbd-hint {
      display: none;
    }

    .zoom-btn:hover .kbd-hint {
      display: inline;
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="toolbar">
      <input class="search-box" type="text" placeholder="Search models or columns..." id="search-input">
      <span id="focus-badge" class="focus-badge" style="display:none"></span>
      <div class="direction-filter" id="direction-filter" style="display:none">
        <button class="dir-btn active" data-dir="both" title="Show upstream + downstream">Both</button>
        <button class="dir-btn" data-dir="upstream" title="Show upstream only">Upstream</button>
        <button class="dir-btn" data-dir="downstream" title="Show downstream only">Downstream</button>
      </div>
      <span class="stats" id="stats"></span>
      <div class="legend">
        <div class="legend-item">
          <div class="legend-dot" style="background: var(--passthrough-color)"></div>
          Passthrough
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="background: var(--rename-color)"></div>
          Rename
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="background: var(--transform-color)"></div>
          Transform
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="background: var(--aggregate-color)"></div>
          Aggregate
        </div>
      </div>
    </div>
    <div id="graph-container">
      <div id="loading">
        <div class="spinner"></div>
        <span>Loading lineage graph...</span>
      </div>
      <div class="zoom-controls">
        <button class="zoom-btn" id="zoom-in-btn" title="Zoom in (+)">+</button>
        <button class="zoom-btn" id="zoom-out-btn" title="Zoom out (-)">-</button>
        <button class="zoom-btn" id="zoom-reset-btn" title="Reset zoom (0)" style="font-size:12px">Fit</button>
      </div>
    </div>
    <div id="tooltip"></div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
