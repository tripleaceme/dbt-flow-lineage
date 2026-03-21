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
    img-src data:;
    font-src ${webview.cspSource};">
  <title>dbt Flow Lineage</title>
  <style>
    /* ── Theme-aware variables ── */
    :root {
      --bg-primary: var(--vscode-editor-background, #1e1e1e);
      --bg-secondary: var(--vscode-sideBar-background, #252526);
      --text-primary: var(--vscode-editor-foreground, #cccccc);
      --text-secondary: var(--vscode-descriptionForeground, #8b8b8b);
      --border-color: var(--vscode-panel-border, #404040);
      --accent: var(--vscode-focusBorder, #007fd4);
      --input-bg: var(--vscode-input-background, #3c3c3c);
      --input-border: var(--vscode-input-border, #555);
      --badge-bg: var(--vscode-badge-background, #007fd4);
      --badge-fg: var(--vscode-badge-foreground, #fff);
      --passthrough-color: #3b82f6;
      --rename-color: #10b981;
      --transform-color: #f59e0b;
      --aggregate-color: #8b5cf6;
      /* Model node colors — adapt to theme */
      --node-bg: var(--vscode-editorWidget-background, #2d2d2d);
      --node-border: var(--vscode-editorWidget-border, #404040);
      --node-header: var(--vscode-titleBar-activeBackground, #333333);
      --source-bg: color-mix(in srgb, var(--accent) 15%, var(--node-bg));
      --source-header: color-mix(in srgb, var(--accent) 25%, var(--node-header));
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

    #app { width: 100%; height: 100%; display: flex; flex-direction: column; }

    /* ── Toolbar ── */
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
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      color: var(--text-primary);
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      width: 240px;
      outline: none;
    }
    #toolbar .search-box:focus { border-color: var(--accent); }

    #toolbar .legend { display: flex; gap: 16px; margin-left: auto; font-size: 11px; color: var(--text-secondary); }
    #toolbar .legend-item { display: flex; align-items: center; gap: 4px; }
    #toolbar .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
    #toolbar .stats { font-size: 11px; color: var(--text-secondary); }

    .direction-filter { display: flex; gap: 2px; background: var(--input-bg); border-radius: 4px; padding: 2px; }
    .dir-btn { background: transparent; border: none; color: var(--text-secondary); font-size: 11px; padding: 3px 8px; border-radius: 3px; cursor: pointer; transition: all 0.15s; }
    .dir-btn:hover { color: var(--text-primary); }
    .dir-btn.active { background: var(--accent); color: var(--badge-fg); }

    #toolbar .focus-badge { background: var(--badge-bg); color: var(--badge-fg); padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }

    .toolbar-btn {
      background: var(--input-bg); border: 1px solid var(--input-border); color: var(--text-primary);
      padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: background 0.15s;
    }
    .toolbar-btn:hover { background: var(--border-color); }

    /* ── Graph container ── */
    #graph-container { flex: 1; position: relative; overflow: hidden; }
    #graph-container svg { width: 100%; height: 100%; }

    /* ── Model node styles (theme-aware) ── */
    .node-bg, .model-bg { fill: var(--node-bg); stroke: var(--node-border); stroke-width: 1; rx: 6; ry: 6; }
    .source-bg { fill: var(--source-bg); stroke: var(--node-border); stroke-width: 1; rx: 6; ry: 6; }
    .node-header, .model-header { fill: var(--node-header); rx: 6; ry: 6; }
    .source-header { fill: var(--source-header); rx: 6; ry: 6; }

    .model-node.focused-model .node-bg { stroke: var(--accent) !important; stroke-width: 2; }

    .model-node .header { fill: var(--text-primary); font-weight: 600; font-size: 12px; cursor: grab; }
    .model-node .header:active { cursor: grabbing; }
    .model-node .badge { fill: var(--text-secondary); font-size: 9px; }
    .model-node .col-type { fill: var(--text-secondary); font-size: 9px; }

    .model-node .column-row { fill: var(--text-primary); font-size: 11px; cursor: pointer; }
    .model-node .column-row:hover { fill: var(--accent); }

    .model-node .column-dot { fill: var(--node-border); cursor: pointer; transition: r 0.15s ease; }
    .model-node .column-dot:hover { r: 6; }

    /* ── Edge styles ── */
    .edge-path { fill: none; stroke-width: 1.5; opacity: 0.6; }
    .edge-path.passthrough { stroke: var(--passthrough-color); }
    .edge-path.rename { stroke: var(--rename-color); }
    .edge-path.transform { stroke: var(--transform-color); }
    .edge-path.aggregate { stroke: var(--aggregate-color); }

    .edge-hitarea { fill: none; stroke: transparent; stroke-width: 12; cursor: pointer; }

    /* ── Particle ── */
    .particle { pointer-events: none; }
    .particle.passthrough { fill: var(--passthrough-color); }
    .particle.rename { fill: var(--rename-color); }
    .particle.transform { fill: var(--transform-color); }
    .particle.aggregate { fill: var(--aggregate-color); }

    /* ── Selection states ── */
    .dimmed { opacity: 0.1 !important; }
    .highlighted .edge-path { opacity: 1; stroke-width: 2.5; }
    .column-dimmed { opacity: 0.15 !important; }

    /* ── Search highlighting ── */
    .search-dimmed { opacity: 0.2 !important; }
    .search-match .node-bg { stroke: var(--accent) !important; stroke-width: 2; }
    .search-col-match { fill: var(--accent) !important; font-weight: 700; }

    /* ── Tooltip ── */
    #tooltip {
      position: absolute; display: none;
      background: var(--bg-secondary); border: 1px solid var(--border-color);
      border-radius: 6px; padding: 8px 12px; font-size: 12px;
      pointer-events: none; max-width: 350px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 100;
    }
    #tooltip .tip-title { font-weight: 600; margin-bottom: 4px; }
    #tooltip .tip-type { color: var(--text-secondary); font-size: 11px; }
    #tooltip .tip-desc { margin-top: 4px; color: var(--text-secondary); }
    #tooltip .tip-edge-label {
      display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-right: 4px;
    }
    #tooltip .tip-edge-label.passthrough { background: #3b82f620; color: #3b82f6; }
    #tooltip .tip-edge-label.rename { background: #10b98120; color: #10b981; }
    #tooltip .tip-edge-label.transform { background: #f59e0b20; color: #f59e0b; }
    #tooltip .tip-edge-label.aggregate { background: #8b5cf620; color: #8b5cf6; }

    /* ── Loading ── */
    #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 12px; color: var(--text-secondary); }
    .spinner { width: 32px; height: 32px; border: 3px solid var(--border-color); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Zoom controls ── */
    .zoom-controls { position: absolute; bottom: 16px; right: 16px; display: flex; flex-direction: column; gap: 4px; z-index: 50; }
    .zoom-btn {
      width: 32px; height: 32px; border: 1px solid var(--border-color);
      background: var(--bg-secondary); color: var(--text-primary);
      font-size: 16px; font-weight: 700; border-radius: 6px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; transition: background 0.15s; line-height: 1;
    }
    .zoom-btn:hover { background: var(--border-color); }
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
      <button class="toolbar-btn" id="export-btn" title="Export graph as PNG">Export PNG</button>
      <span class="stats" id="stats"></span>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background: var(--passthrough-color)"></div>Passthrough</div>
        <div class="legend-item"><div class="legend-dot" style="background: var(--rename-color)"></div>Rename</div>
        <div class="legend-item"><div class="legend-dot" style="background: var(--transform-color)"></div>Transform</div>
        <div class="legend-item"><div class="legend-dot" style="background: var(--aggregate-color)"></div>Aggregate</div>
      </div>
    </div>
    <div id="graph-container">
      <div id="loading"><div class="spinner"></div><span>Loading lineage graph...</span></div>
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
