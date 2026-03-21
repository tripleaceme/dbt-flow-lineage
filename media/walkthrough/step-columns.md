## Define columns in schema.yml

The extension reads column definitions from your `schema.yml` (or `_schema.yml`, `_models.yml`) files.

### Example

```yaml
models:
  - name: dim_artists
    description: "Artist dimension table"
    columns:
      - name: artist_id
        description: "Primary key"
      - name: artist_name
      - name: genre
      - name: total_streams
        description: "Aggregated stream count"
      - name: unique_listeners
        description: "Distinct listener count"
```

### Rules

- Every column you want to trace **must** be listed
- Columns not in `schema.yml` won't appear in the lineage graph
- Descriptions are optional but will show in tooltips
- Works with `SELECT *`, CTEs, Jinja — no SQL restrictions
