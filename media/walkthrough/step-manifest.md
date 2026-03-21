## Generate manifest.json

The extension reads `target/manifest.json` — a file dbt generates automatically.

### Run one of these commands

```bash
# Option 1: Compile only (fastest)
dbt compile

# Option 2: Generate docs (includes catalog.json for column types)
dbt docs generate
```

### What happens

1. dbt reads your `schema.yml` files
2. Writes column definitions + model dependencies to `manifest.json`
3. The extension detects the file and builds the lineage graph
4. Auto-refreshes when manifest changes

### Tip

After adding new columns to `schema.yml`, run `dbt compile` again to update the manifest.
