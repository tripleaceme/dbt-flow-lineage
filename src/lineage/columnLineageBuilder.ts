import { ParsedManifest, ManifestNode } from '../artifacts/manifestParser';
import { ParsedCatalog } from '../artifacts/catalogParser';
import { cleanJinja } from './jinjaCleaner';
import { SqlColumnParser } from './sqlParser';
import {
  LineageGraph,
  ModelNode,
  ColumnNode,
  ColumnEdge,
  ModelEdge,
  TransformationType,
} from './graphTypes';

export class ColumnLineageBuilder {
  private sqlParser = new SqlColumnParser();

  build(
    manifest: ParsedManifest,
    catalog: ParsedCatalog | null,
    projectName: string
  ): LineageGraph {
    const modelNodes: ModelNode[] = [];
    const columnEdges: ColumnEdge[] = [];
    const modelEdges: ModelEdge[] = [];

    // Index manifest nodes by uniqueId and name for quick lookup
    const nodeById = new Map<string, ManifestNode>();
    const nodeByName = new Map<string, ManifestNode>();
    for (const node of manifest.nodes) {
      nodeById.set(node.uniqueId, node);
      nodeByName.set(node.name.toLowerCase(), node);
    }

    let parsedCount = 0;
    let totalModels = 0;
    let totalColumns = 0;

    for (const node of manifest.nodes) {
      const isModel = node.resourceType === 'model';
      const isSource = node.resourceType === 'source';
      if (!isModel && !isSource) continue;

      totalModels++;

      // Get catalog columns for type info
      const catalogCols = catalog?.tables[node.uniqueId] || [];
      const catalogMap = new Map(catalogCols.map((c) => [c.name, c.type]));

      // Build columns from manifest + catalog
      const columns: ColumnNode[] = [];
      const manifestCols = Object.values(node.columns);

      if (manifestCols.length > 0) {
        for (const col of manifestCols) {
          const colId = `${node.uniqueId}::${col.name.toLowerCase()}`;
          columns.push({
            id: colId,
            name: col.name.toLowerCase(),
            dataType: catalogMap.get(col.name.toLowerCase()) || null,
            description: col.description,
          });
        }
      } else if (catalogCols.length > 0) {
        // Fallback: use catalog columns if manifest has none
        for (const col of catalogCols) {
          const colId = `${node.uniqueId}::${col.name}`;
          columns.push({
            id: colId,
            name: col.name,
            dataType: col.type,
            description: '',
          });
        }
      }

      totalColumns += columns.length;

      // Parse SQL for column lineage (models only, sources have no SQL)
      let parseStatus: 'parsed' | 'fallback' | 'failed' = 'fallback';

      if (isModel && (node.compiledCode || node.rawCode)) {
        const sql = node.compiledCode || node.rawCode!;
        const { cleanedSql, refMappings } = cleanJinja(sql);

        const parseResult = this.sqlParser.parse(cleanedSql);

        if (parseResult.success && parseResult.columns.length > 0) {
          parseStatus = 'parsed';
          parsedCount++;

          // Build ref placeholder → uniqueId mapping
          const placeholderToId = this.buildPlaceholderMap(
            refMappings,
            parseResult.tableRefs,
            node.dependsOn,
            nodeById,
            nodeByName
          );

          // Create column edges
          for (const parsedCol of parseResult.columns) {
            const targetColId = `${node.uniqueId}::${parsedCol.name}`;

            // Ensure target column exists in our model
            if (!columns.find((c) => c.id === targetColId)) {
              columns.push({
                id: targetColId,
                name: parsedCol.name,
                dataType: catalogMap.get(parsedCol.name) || null,
                description: '',
              });
              totalColumns++;
            }

            for (const ref of parsedCol.sourceRefs) {
              const sourceModelId = ref.table
                ? this.resolveTableToModel(ref.table, placeholderToId, node.dependsOn)
                : this.guessSourceModel(ref.column, node.dependsOn, nodeById);

              if (!sourceModelId) continue;

              const sourceColId = `${sourceModelId}::${ref.column}`;

              columnEdges.push({
                id: `${sourceColId}->${targetColId}`,
                sourceModelId,
                sourceColumnId: sourceColId,
                targetModelId: node.uniqueId,
                targetColumnId: targetColId,
                transformationType: parsedCol.transformationType,
              });
            }
          }
        } else {
          parseStatus = 'failed';
        }
      }

      // Always add model-level edges from depends_on
      for (const dep of node.dependsOn) {
        modelEdges.push({
          sourceModelId: dep,
          targetModelId: node.uniqueId,
        });
      }

      modelNodes.push({
        id: node.uniqueId,
        name: node.name,
        resourceType: isSource ? 'source' : 'model',
        database: node.database,
        schema: node.schema,
        filePath: node.originalFilePath,
        materialization: node.materialization,
        columns,
        description: node.description,
        parseStatus,
      });
    }

    const modelCount = totalModels > 0 ? totalModels : 1;
    const parseSuccessRate = Math.round((parsedCount / modelCount) * 100);

    return {
      models: modelNodes,
      columnEdges,
      modelEdges,
      metadata: {
        generatedAt: new Date().toISOString(),
        dbtProjectName: projectName,
        totalModels,
        totalColumns,
        parseSuccessRate,
      },
    };
  }

  private buildPlaceholderMap(
    refMappings: Array<{ placeholder: string; originalRef: string }>,
    tableRefs: string[],
    dependsOn: string[],
    nodeById: Map<string, ManifestNode>,
    nodeByName: Map<string, ManifestNode>
  ): Map<string, string> {
    const map = new Map<string, string>();

    for (const ref of refMappings) {
      // Try to match placeholder to a dependsOn entry
      const refName = ref.originalRef.includes('.')
        ? ref.originalRef.split('.').pop()!
        : ref.originalRef;

      for (const depId of dependsOn) {
        const depNode = nodeById.get(depId);
        if (depNode && depNode.name.toLowerCase() === refName.toLowerCase()) {
          map.set(ref.placeholder.toLowerCase(), depId);
          break;
        }
      }
    }

    return map;
  }

  private resolveTableToModel(
    tableRef: string,
    placeholderToId: Map<string, string>,
    dependsOn: string[]
  ): string | null {
    // Check placeholder mapping
    const fromPlaceholder = placeholderToId.get(tableRef.toLowerCase());
    if (fromPlaceholder) return fromPlaceholder;

    // Check if table ref matches a depends_on node name
    for (const depId of dependsOn) {
      const parts = depId.split('.');
      const depName = parts[parts.length - 1];
      if (depName.toLowerCase() === tableRef.toLowerCase()) {
        return depId;
      }
    }

    return null;
  }

  private guessSourceModel(
    columnName: string,
    dependsOn: string[],
    nodeById: Map<string, ManifestNode>
  ): string | null {
    // If there's only one dependency, it must be that
    if (dependsOn.length === 1) {
      return dependsOn[0];
    }

    // Try to find which upstream model has this column
    for (const depId of dependsOn) {
      const depNode = nodeById.get(depId);
      if (depNode && depNode.columns[columnName.toLowerCase()]) {
        return depId;
      }
    }

    return dependsOn[0] || null;
  }
}
