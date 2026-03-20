import * as fs from 'fs/promises';

/** Column info from catalog.json */
export interface CatalogColumn {
  name: string;
  type: string;
  index: number;
}

/** Parsed catalog: maps "database.schema.table" → columns */
export interface ParsedCatalog {
  tables: Record<string, CatalogColumn[]>;
}

export class CatalogParser {
  async parse(catalogPath: string): Promise<ParsedCatalog | null> {
    try {
      const raw = await fs.readFile(catalogPath, 'utf-8');
      const catalog = JSON.parse(raw);
      return this.extract(catalog);
    } catch {
      return null;
    }
  }

  private extract(catalog: any): ParsedCatalog {
    const tables: Record<string, CatalogColumn[]> = {};

    const nodes = { ...(catalog.nodes || {}), ...(catalog.sources || {}) };

    for (const [uniqueId, node] of Object.entries<any>(nodes)) {
      const columns: CatalogColumn[] = [];
      const rawColumns = node.columns || {};

      for (const [, col] of Object.entries<any>(rawColumns)) {
        columns.push({
          name: (col.name || '').toLowerCase(),
          type: col.type || 'unknown',
          index: col.index || 0,
        });
      }

      columns.sort((a, b) => a.index - b.index);
      tables[uniqueId] = columns;
    }

    return { tables };
  }
}
