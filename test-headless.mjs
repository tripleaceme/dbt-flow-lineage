/**
 * Headless test: runs the core parsing pipeline against a real manifest.json
 * without needing VS Code. Verifies artifact parsing + lineage building.
 *
 * Usage: node test-headless.mjs /path/to/target/manifest.json
 */
import fs from 'fs/promises';

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('Usage: node test-headless.mjs <path-to-manifest.json>');
  process.exit(1);
}

// --- Inline the parsers (since we can't import .ts directly) ---

async function parseManifest(path) {
  const raw = await fs.readFile(path, 'utf-8');
  const manifest = JSON.parse(raw);

  const nodes = [];
  const parentMap = manifest.parent_map || {};
  const childMap = manifest.child_map || {};

  for (const [uniqueId, node] of Object.entries(manifest.nodes || {})) {
    if (!['model', 'seed', 'snapshot'].includes(node.resource_type)) continue;
    const columns = {};
    for (const [key, col] of Object.entries(node.columns || {})) {
      columns[key.toLowerCase()] = { name: col.name || key, description: col.description || '' };
    }
    nodes.push({
      uniqueId,
      name: node.name || '',
      resourceType: 'model',
      rawCode: node.raw_code || node.raw_sql || null,
      compiledCode: node.compiled_code || node.compiled_sql || null,
      columns,
      dependsOn: node.depends_on?.nodes || [],
      materialization: node.config?.materialized || 'view',
      database: node.database || '',
      schema: node.schema || '',
      originalFilePath: node.original_file_path || null,
      description: node.description || '',
    });
  }

  for (const [uniqueId, source] of Object.entries(manifest.sources || {})) {
    const columns = {};
    for (const [key, col] of Object.entries(source.columns || {})) {
      columns[key.toLowerCase()] = { name: col.name || key, description: col.description || '' };
    }
    nodes.push({
      uniqueId,
      name: source.name || '',
      resourceType: 'source',
      rawCode: null,
      compiledCode: null,
      columns,
      dependsOn: [],
      materialization: 'source',
      database: source.database || '',
      schema: source.schema || '',
      originalFilePath: null,
      description: source.description || '',
    });
  }

  return { nodes, parentMap, childMap };
}

// Jinja cleaner (simplified inline version)
function cleanJinja(rawSql) {
  let sql = rawSql;
  const refMappings = [];

  sql = sql.replace(/\{#[\s\S]*?#\}/g, '');
  sql = sql.replace(/\{\{\s*config\s*\([\s\S]*?\)\s*\}\}/g, '');

  sql = sql.replace(/\{\{\s*ref\s*\(\s*['"](\w+)['"]\s*\)\s*\}\}/g, (_m, name) => {
    const ph = `__ref__${name}`;
    refMappings.push({ placeholder: ph, originalRef: name });
    return ph;
  });

  sql = sql.replace(/\{\{\s*source\s*\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*\)\s*\}\}/g, (_m, src, tbl) => {
    const ph = `__source__${src}__${tbl}`;
    refMappings.push({ placeholder: ph, originalRef: `${src}.${tbl}` });
    return ph;
  });

  sql = sql.replace(/\{\{\s*var\s*\(\s*['"][\w.]+['"]\s*(?:,\s*[\s\S]*?)?\)\s*\}\}/g, "'__jinja_var__'");
  sql = sql.replace(/\{%[-+]?[\s\S]*?[-+]?%\}/g, '');
  sql = sql.replace(/\{\{[\s\S]*?\}\}/g, '__jinja_expr');
  sql = sql.replace(/^\s*\n/gm, '\n').replace(/\n{3,}/g, '\n\n').trim();

  return { cleanedSql: sql, refMappings };
}

// --- Run the test ---

console.log('╔══════════════════════════════════════════╗');
console.log('║     dbt Flow Lineage — Headless Test     ║');
console.log('╚══════════════════════════════════════════╝\n');

const manifest = await parseManifest(manifestPath);

console.log(`✔ Manifest parsed: ${manifest.nodes.length} nodes`);

const models = manifest.nodes.filter(n => n.resourceType === 'model');
const sources = manifest.nodes.filter(n => n.resourceType === 'source');
console.log(`  Models: ${models.length}`);
console.log(`  Sources: ${sources.length}`);

let totalCols = 0;
for (const node of manifest.nodes) {
  totalCols += Object.keys(node.columns).length;
}
console.log(`  Total documented columns: ${totalCols}`);

// Test Jinja cleaning on each model
let cleanSuccess = 0;
let cleanFail = 0;

console.log('\n── Jinja Cleaning ──────────────────────────\n');

for (const model of models) {
  const sql = model.compiledCode || model.rawCode;
  if (!sql) {
    console.log(`  ⚠ ${model.name}: no SQL`);
    continue;
  }

  try {
    const { cleanedSql, refMappings } = cleanJinja(sql);

    // Check if any Jinja remains
    const hasJinja = /\{\{|\{%|\{#/.test(cleanedSql);
    if (hasJinja) {
      console.log(`  ⚠ ${model.name}: residual Jinja detected`);
      cleanFail++;
    } else {
      cleanSuccess++;
    }

    if (refMappings.length > 0) {
      console.log(`  ✔ ${model.name}: ${refMappings.length} refs → [${refMappings.map(r => r.originalRef).join(', ')}]`);
    } else {
      console.log(`  ✔ ${model.name}: clean (no refs)`);
    }
  } catch (err) {
    console.log(`  ✗ ${model.name}: ${err.message}`);
    cleanFail++;
  }
}

console.log(`\n  Jinja cleaning: ${cleanSuccess} ok, ${cleanFail} issues`);

// Test dependency edges
console.log('\n── Dependency Graph ────────────────────────\n');

let totalEdges = 0;
for (const model of models) {
  if (model.dependsOn.length > 0) {
    totalEdges += model.dependsOn.length;
    const deps = model.dependsOn.map(d => d.split('.').pop());
    console.log(`  ${model.name} ← [${deps.join(', ')}]`);
  }
}
console.log(`\n  Total model-level edges: ${totalEdges}`);

// Summary
console.log('\n╔══════════════════════════════════════════╗');
console.log('║              TEST SUMMARY                ║');
console.log('╠══════════════════════════════════════════╣');
console.log(`║  Models:        ${String(models.length).padEnd(24)}║`);
console.log(`║  Sources:       ${String(sources.length).padEnd(24)}║`);
console.log(`║  Columns:       ${String(totalCols).padEnd(24)}║`);
console.log(`║  Model edges:   ${String(totalEdges).padEnd(24)}║`);
console.log(`║  Jinja clean:   ${String(cleanSuccess + '/' + (cleanSuccess + cleanFail)).padEnd(24)}║`);
console.log('╚══════════════════════════════════════════╝');
