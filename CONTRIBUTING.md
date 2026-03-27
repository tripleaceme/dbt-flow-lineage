# Contributing to dbt Flow Lineage

Thanks for your interest in contributing! This guide will help you get started.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [VS Code](https://code.visualstudio.com/) >= 1.85.0
- A dbt project with a compiled `manifest.json` (run `dbt compile`)

## Setup

```bash
git clone https://github.com/tripleaceme/dbt-flow-lineage.git
cd dbt-flow-lineage
npm install
```

## Development Workflow

### Build

```bash
npm run build       # one-time build
npm run watch       # rebuild on file changes
```

This produces two bundles via esbuild:
- `dist/extension.js` — Node.js extension host
- `dist/webview/webview.js` — browser webview (D3 + dagre)

### Run & Debug

1. Open the project in VS Code
2. Press **F5** to launch the Extension Development Host
3. Open a dbt project in the new window — the extension activates on `dbt_project.yml`

### Lint

```bash
npm run lint
```

### Test

```bash
npm run test
```

### Package

```bash
npm run package     # creates dbt-flow-lineage-x.x.x.vsix
```

## Project Structure

```
src/
  extension.ts              # Entry point, command registration
  artifacts/
    locator.ts              # Finds dbt projects + manifest.json
  lineage/
    columnLineageBuilder.ts # Builds column-level edges from manifest
    graphTypes.ts           # TypeScript types for the lineage graph
  providers/
    codeLensProvider.ts     # CodeLens above SELECT statements
  webview/
    webviewProvider.ts      # Creates webview panel, sends graph data
    getWebviewContent.ts    # HTML/CSS for the webview
  welcome/
    outputBanner.ts         # ANSI startup banner
  commands/                 # Command handlers

webview-ui/
  src/
    index.ts                # Webview entry point, wires UI events
    graph/
      renderer.ts           # D3/dagre SVG rendering, particles, drag
    styles/                 # CSS (theme-aware via VS Code CSS vars)
```

## How It Works

1. **Manifest parsing** — reads `target/manifest.json` for models, columns, and dependencies
2. **Edge building** — matches columns by name across models, classifies transformations (passthrough/rename/transform/aggregate) using SQL regex
3. **Graph rendering** — dagre computes the DAG layout, D3 renders SVG nodes and edges, `requestAnimationFrame` drives particle animation along paths

## Making Changes

### Adding a new transformation type

1. Add the type to `TransformationType` in [graphTypes.ts](src/lineage/graphTypes.ts)
2. Add detection logic in [columnLineageBuilder.ts](src/lineage/columnLineageBuilder.ts)
3. Add the color in the webview CSS in [getWebviewContent.ts](src/webview/getWebviewContent.ts)
4. Update the legend in the toolbar HTML

### Adding a new command

1. Register the command in `contributes.commands` in [package.json](package.json)
2. Add the handler in [extension.ts](src/extension.ts) under `context.subscriptions`

### Modifying the webview UI

- HTML structure and CSS live in [getWebviewContent.ts](src/webview/getWebviewContent.ts)
- Event wiring and interactivity live in [webview-ui/src/index.ts](webview-ui/src/index.ts)
- Graph rendering (nodes, edges, particles) lives in [webview-ui/src/graph/renderer.ts](webview-ui/src/graph/renderer.ts)

## Pull Request Guidelines

1. **Fork** the repo and create a feature branch from `master`
2. Keep PRs focused — one feature or fix per PR
3. Make sure `npm run build` succeeds with no errors
4. Add a clear title and description of what changed and why
5. Include screenshots or GIFs for any visual changes

## Reporting Issues

Open an issue at [github.com/tripleaceme/dbt-flow-lineage/issues](https://github.com/tripleaceme/dbt-flow-lineage/issues) with:
- VS Code version
- Extension version
- Steps to reproduce
- Expected vs actual behavior

## Code Style

- TypeScript strict mode is enabled
- Use `const` over `let` where possible
- No hardcoded colors in SVG — use CSS class names that reference VS Code theme variables
- Keep the webview bundle small — avoid heavy dependencies

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE.txt).
