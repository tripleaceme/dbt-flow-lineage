import * as fs from 'fs/promises';

/** Raw manifest node as read from manifest.json */
export interface ManifestNode {
  uniqueId: string;
  name: string;
  resourceType: 'model' | 'source' | 'test' | 'seed' | 'snapshot';
  database: string;
  schema: string;
  alias: string;
  description: string;
  rawCode: string | null;
  compiledCode: string | null;
  originalFilePath: string | null;
  columns: Record<string, { name: string; description: string }>;
  dependsOn: string[];
  materialization: string;
  sourceName?: string;
}

/** Parsed manifest output */
export interface ParsedManifest {
  nodes: ManifestNode[];
  parentMap: Record<string, string[]>;
  childMap: Record<string, string[]>;
}

export class ManifestParser {
  async parse(manifestPath: string): Promise<ParsedManifest | null> {
    try {
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      return this.extract(manifest);
    } catch {
      return null;
    }
  }

  private extract(manifest: any): ParsedManifest {
    const nodes: ManifestNode[] = [];
    const parentMap: Record<string, string[]> = manifest.parent_map || {};
    const childMap: Record<string, string[]> = manifest.child_map || {};

    // Parse model/seed/snapshot nodes
    const rawNodes = manifest.nodes || {};
    for (const [uniqueId, node] of Object.entries<any>(rawNodes)) {
      const resourceType = node.resource_type;
      if (!['model', 'seed', 'snapshot'].includes(resourceType)) {
        continue;
      }

      nodes.push({
        uniqueId,
        name: node.name || '',
        resourceType: resourceType === 'model' ? 'model' : 'model',
        database: node.database || '',
        schema: node.schema || '',
        alias: node.alias || node.name || '',
        description: node.description || '',
        rawCode: node.raw_code || node.raw_sql || null,
        compiledCode: node.compiled_code || node.compiled_sql || null,
        originalFilePath: node.original_file_path || node.path || null,
        columns: this.parseColumns(node.columns),
        dependsOn: node.depends_on?.nodes || [],
        materialization: node.config?.materialized || 'view',
      });
    }

    // Parse sources
    const sources = manifest.sources || {};
    for (const [uniqueId, source] of Object.entries<any>(sources)) {
      nodes.push({
        uniqueId,
        name: source.name || '',
        resourceType: 'source',
        database: source.database || '',
        schema: source.schema || '',
        alias: source.identifier || source.name || '',
        description: source.description || '',
        rawCode: null,
        compiledCode: null,
        originalFilePath: null,
        columns: this.parseColumns(source.columns),
        dependsOn: [],
        materialization: 'source',
        sourceName: source.source_name || '',
      });
    }

    return { nodes, parentMap, childMap };
  }

  private parseColumns(
    columns: Record<string, any> | undefined
  ): Record<string, { name: string; description: string }> {
    if (!columns) {
      return {};
    }

    const result: Record<string, { name: string; description: string }> = {};
    for (const [key, col] of Object.entries<any>(columns)) {
      result[key.toLowerCase()] = {
        name: col.name || key,
        description: col.description || '',
      };
    }
    return result;
  }
}
