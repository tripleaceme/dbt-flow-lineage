# dbt Flow Lineage

**Animated column-level lineage visualization for dbt projects.**

See exactly how each column flows through your dbt models — from source to final table — with color-coded animated paths that show passthrough, renames, transforms, and aggregations.

![dbt Flow Lineage](https://raw.githubusercontent.com/tripleaceme/dbt-flow-lineage/main/media/demo.png)

## Features

### Column-Level Lineage
Every column gets its own traced path showing where it comes from and where it goes. Click any column to highlight its full upstream and downstream journey.

### Animated Data Flow
Glowing particles flow along column edges, visualizing data propagation through your models in real time.

### Transformation Classification
Each column edge is color-coded by how the data changes:

| Color | Type | Meaning |
|-------|------|---------|
| Blue | **Passthrough** | Column unchanged from source |
| Green | **Rename** | Same data, different name (`old_col AS new_col`) |
| Yellow | **Transform** | Computed via CASE, COALESCE, functions |
| Purple | **Aggregate** | Computed via COUNT, SUM, AVG, etc. |

### Model-Focused View
Right-click any `.sql` file or click a model in the sidebar to see only that model's lineage. Filter by **Upstream**, **Downstream**, or **Both**.

### Draggable Nodes
Drag model boxes to rearrange the graph layout. Edges and animations follow automatically.

### Native IDE Integration
- **Activity Bar** icon with model/column tree sidebar
- **CodeLens** annotations above SELECT statements
- **Right-click** context menu on `.sql` files
- **Status bar** showing model count
- **Keyboard shortcuts**: `+`/`-` zoom, `Esc` clear, `0` fit-to-view
- Colored startup banner in the Terminal panel

## Installation

### From GitHub (recommended for now)

1. Go to the [Releases page](https://github.com/tripleaceme/dbt-flow-lineage/releases)
2. Download the latest `.vsix` file
3. In VS Code / Cursor / Windsurf, open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
4. Run **"Extensions: Install from VSIX..."**
5. Select the downloaded `.vsix` file
6. Reload the window when prompted

**Or install from the terminal:**

```bash
# Download the latest release
curl -L -o dbt-flow-lineage.vsix https://github.com/tripleaceme/dbt-flow-lineage/releases/latest/download/dbt-flow-lineage-0.1.0.vsix

# Install in VS Code
code --install-extension dbt-flow-lineage.vsix

# Install in Cursor
cursor --install-extension dbt-flow-lineage.vsix
```

**Or build from source:**

```bash
git clone https://github.com/tripleaceme/dbt-flow-lineage.git
cd dbt-flow-lineage
npm install
npm run build
npx vsce package
code --install-extension dbt-flow-lineage-0.1.0.vsix
```

### From VS Code Marketplace (coming soon)

Search for **"dbt Flow Lineage"** in the Extensions tab.

## Requirements

### What you need

1. **A dbt project** with models
2. **Columns defined in `schema.yml`** — this is the only requirement. Every column you want to track must be listed:

```yaml
models:
  - name: dim_artists
    columns:
      - name: artist_id
      - name: artist_name
      - name: total_streams
      # ... all columns you want to trace
```

3. **Run `dbt compile`** (or `dbt docs generate`) to create `manifest.json`

### What works automatically

- `SELECT *` in CTEs and final selects
- Complex CTEs with multiple joins
- Jinja templates (`{{ ref() }}`, `{{ source() }}`)
- Nested functions like `round(sum(x) / 3600.0, 2)`
- Any SQL dialect supported by dbt

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `dbtFlowLineage.targetPath` | `target` | Relative path to dbt target directory |
| `dbtFlowLineage.animationSpeed` | `2` | Particle animation speed (1-5) |
| `dbtFlowLineage.maxDepth` | `10` | Maximum lineage depth to render |
| `dbtFlowLineage.showWelcomeOnStartup` | `true` | Show welcome page on first activation |

## Commands

| Command | Description |
|---------|-------------|
| `dbt Flow: Show Column Lineage` | Open full project lineage graph |
| `dbt Flow: Show Lineage for Current Model` | Open lineage focused on active `.sql` file |
| `dbt Flow: Refresh Lineage Data` | Re-read manifest and rebuild lineage |
| `dbt Flow: Switch dbt Project` | Clear saved project selection |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `+` or `=` | Zoom in |
| `-` | Zoom out |
| `0` | Fit to viewport |
| `Esc` | Clear column selection |

## Compatibility

Works on:
- **VS Code** 1.85+
- **Cursor**
- **Windsurf**
- **VSCodium**
- Any VS Code fork

## License

MIT
