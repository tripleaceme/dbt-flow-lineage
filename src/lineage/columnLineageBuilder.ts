import { ParsedManifest, ManifestNode } from '../artifacts/manifestParser';
import { ParsedCatalog } from '../artifacts/catalogParser';
import {
  LineageGraph,
  ModelNode,
  ColumnNode,
  ColumnEdge,
  ModelEdge,
  TransformationType,
} from './graphTypes';

/**
 * Column lineage builder using manifest-first strategy.
 *
 * How it works:
 * 1. Columns come from manifest YAML (schema.yml) — source of truth
 * 2. Edges: name-matching + SQL regex classification
 * 3. Classification: regex on raw SQL detects aggregate/transform/rename/passthrough
 *
 * What users need: columns defined in schema.yml, then `dbt compile`.
 */
export class ColumnLineageBuilder {
  build(
    manifest: ParsedManifest,
    catalog: ParsedCatalog | null,
    projectName: string
  ): LineageGraph {
    const modelNodes: ModelNode[] = [];
    const columnEdges: ColumnEdge[] = [];
    const modelEdges: ModelEdge[] = [];

    const nodeById = new Map<string, ManifestNode>();
    for (const node of manifest.nodes) {
      nodeById.set(node.uniqueId, node);
    }

    // ── Pass 1: Build all model/source nodes with columns ──
    const modelColumnsMap = new Map<string, ColumnNode[]>();
    // Also build a flat set of ALL upstream column names for quick lookup
    const allColumnNames = new Set<string>();
    let totalModels = 0;
    let totalColumns = 0;

    for (const node of manifest.nodes) {
      const isModel = node.resourceType === 'model';
      const isSource = node.resourceType === 'source';
      if (!isModel && !isSource) continue;
      totalModels++;

      const catalogCols = catalog?.tables[node.uniqueId] || [];
      const catalogMap = new Map(catalogCols.map((c) => [c.name, c.type]));
      const columns: ColumnNode[] = [];

      const manifestCols = Object.values(node.columns);
      if (manifestCols.length > 0) {
        for (const col of manifestCols) {
          const name = col.name.toLowerCase();
          columns.push({
            id: `${node.uniqueId}::${name}`,
            name,
            dataType: catalogMap.get(name) || null,
            description: col.description,
          });
          allColumnNames.add(name);
        }
      } else if (catalogCols.length > 0) {
        for (const col of catalogCols) {
          columns.push({
            id: `${node.uniqueId}::${col.name}`,
            name: col.name,
            dataType: col.type,
            description: '',
          });
          allColumnNames.add(col.name);
        }
      }

      totalColumns += columns.length;
      modelColumnsMap.set(node.uniqueId, columns);
    }

    // ── Pass 2: Build column edges ──
    let modelsWithEdges = 0;

    for (const node of manifest.nodes) {
      if (node.resourceType !== 'model') continue;
      if (!node.dependsOn.length) {
        modelNodes.push(this.makeModelNode(node, modelColumnsMap.get(node.uniqueId) || [], 'fallback'));
        continue;
      }

      for (const dep of node.dependsOn) {
        modelEdges.push({ sourceModelId: dep, targetModelId: node.uniqueId });
      }

      const columns = modelColumnsMap.get(node.uniqueId) || [];
      const rawSql = (node.compiledCode || node.rawCode || '').toLowerCase();

      // Collect ALL upstream column names for this model
      const upstreamColNames = new Set<string>();
      for (const depId of node.dependsOn) {
        for (const uc of modelColumnsMap.get(depId) || []) {
          upstreamColNames.add(uc.name);
        }
      }

      // Classify each output column
      const sqlClassification = this.classifyColumnsFromSql(rawSql, columns, upstreamColNames);

      const edgeSet = new Set<string>();
      let hasEdges = false;

      for (const col of columns) {
        const cls = sqlClassification.get(col.name);
        let edgeCreated = false;

        // Strategy 1: Name-match against upstream
        for (const depId of node.dependsOn) {
          const upstreamCols = modelColumnsMap.get(depId) || [];
          const match = upstreamCols.find((uc) => uc.name === col.name);

          if (match) {
            const edgeId = `${match.id}->${col.id}`;
            if (edgeSet.has(edgeId)) continue;
            edgeSet.add(edgeId);

            let edgeType: TransformationType = 'passthrough';
            if (cls && cls.type !== 'passthrough') {
              edgeType = cls.type;
            }

            columnEdges.push({
              id: edgeId,
              sourceModelId: depId,
              sourceColumnId: match.id,
              targetModelId: node.uniqueId,
              targetColumnId: col.id,
              transformationType: edgeType,
            });
            edgeCreated = true;
            hasEdges = true;
          }
        }

        // Strategy 2: Computed column — use source columns from SQL
        if (!edgeCreated && cls && cls.sourceColumns.length > 0) {
          for (const srcCol of cls.sourceColumns) {
            for (const depId of node.dependsOn) {
              const upstreamCols = modelColumnsMap.get(depId) || [];
              const match = upstreamCols.find((uc) => uc.name === srcCol);

              if (match) {
                const edgeId = `${match.id}->${col.id}`;
                if (edgeSet.has(edgeId)) continue;
                edgeSet.add(edgeId);

                columnEdges.push({
                  id: edgeId,
                  sourceModelId: depId,
                  sourceColumnId: match.id,
                  targetModelId: node.uniqueId,
                  targetColumnId: col.id,
                  transformationType: cls.type,
                });
                edgeCreated = true;
                hasEdges = true;
              }
            }
          }
        }

        // Strategy 3: Rename — look for renamedFrom column upstream
        if (!edgeCreated && cls && cls.renamedFrom) {
          for (const depId of node.dependsOn) {
            const upstreamCols = modelColumnsMap.get(depId) || [];
            const match = upstreamCols.find((uc) => uc.name === cls!.renamedFrom);

            if (match) {
              const edgeId = `${match.id}->${col.id}`;
              if (edgeSet.has(edgeId)) continue;
              edgeSet.add(edgeId);

              columnEdges.push({
                id: edgeId,
                sourceModelId: depId,
                sourceColumnId: match.id,
                targetModelId: node.uniqueId,
                targetColumnId: col.id,
                transformationType: 'rename',
              });
              edgeCreated = true;
              hasEdges = true;
            }
          }
        }
      }

      if (hasEdges) modelsWithEdges++;

      modelNodes.push(this.makeModelNode(
        node,
        columns,
        hasEdges ? 'parsed' : 'fallback'
      ));
    }

    // Add source nodes
    for (const node of manifest.nodes) {
      if (node.resourceType !== 'source') continue;
      modelNodes.push(this.makeModelNode(
        node,
        modelColumnsMap.get(node.uniqueId) || [],
        'fallback'
      ));
    }

    const modelsWithDeps = manifest.nodes.filter(
      (n) => n.resourceType === 'model' && n.dependsOn.length > 0
    ).length;
    const denominator = modelsWithDeps > 0 ? modelsWithDeps : 1;
    const parseSuccessRate = Math.round((modelsWithEdges / denominator) * 100);

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

  // ─────────────────────────────────────────────────────
  // SQL Classification
  // ─────────────────────────────────────────────────────

  private classifyColumnsFromSql(
    rawSql: string,
    columns: ColumnNode[],
    upstreamColNames: Set<string>
  ): Map<string, { type: TransformationType; sourceColumns: string[]; renamedFrom?: string }> {
    const result = new Map<string, { type: TransformationType; sourceColumns: string[]; renamedFrom?: string }>();

    if (!rawSql.trim()) return result;

    for (const col of columns) {
      const colName = col.name;
      const exprInfo = this.findColumnExpression(rawSql, colName);

      if (!exprInfo) {
        result.set(colName, { type: 'passthrough', sourceColumns: [] });
        continue;
      }

      const expr = exprInfo.expression;

      // Check for aggregates
      if (/\b(count|sum|avg|min|max|array_agg|string_agg|listagg|group_concat|percentile_cont|percentile_disc|stddev|variance|median)\s*\(/i.test(expr)) {
        const sourceCols = this.extractColumnRefsFromExpr(expr, upstreamColNames);
        result.set(colName, { type: 'aggregate', sourceColumns: sourceCols });
        continue;
      }

      // Check for transforms
      if (/\b(case|coalesce|nullif|cast|concat|trim|lower|upper|replace|substring|round|date_trunc|extract|dateadd|datediff|initcap|lag|lead|row_number|rank|dense_rank)\s*[\(\b]/i.test(expr) || /[+\-*\/]/.test(expr)) {
        const sourceCols = this.extractColumnRefsFromExpr(expr, upstreamColNames);
        result.set(colName, { type: 'transform', sourceColumns: sourceCols });
        continue;
      }

      // Check for rename
      if (exprInfo.isAlias && exprInfo.sourceColumn && exprInfo.sourceColumn !== colName) {
        result.set(colName, {
          type: 'rename',
          sourceColumns: [exprInfo.sourceColumn],
          renamedFrom: exprInfo.sourceColumn,
        });
        continue;
      }

      result.set(colName, { type: 'passthrough', sourceColumns: [] });
    }

    return result;
  }

  /**
   * Find the SQL expression that produces a given output column.
   * Handles commas inside parentheses correctly.
   */
  private findColumnExpression(
    sql: string,
    colName: string
  ): { expression: string; isAlias: boolean; sourceColumn?: string } | null {
    // Pattern 1: "expression AS col_name" — use paren-aware search
    const asTarget = ` as ${colName}`;
    const asIdx = sql.indexOf(asTarget);
    if (asIdx > 0) {
      // Walk backwards from asIdx to find the start of this expression
      const expr = this.extractExprBeforeAs(sql, asIdx);
      if (expr) {
        // Check if it's a simple column ref: "table.other_col" or "other_col"
        const simpleRef = expr.match(/^(?:(\w+)\.)?(\w+)$/);
        if (simpleRef) {
          return {
            expression: expr,
            isAlias: true,
            sourceColumn: simpleRef[2],
          };
        }
        return { expression: expr, isAlias: true };
      }
    }

    // Pattern 2: "alias.col_name" without AS
    const directPattern = new RegExp(`\\b(\\w+)\\.${this.escapeRegex(colName)}\\b`, 'i');
    const directMatch = sql.match(directPattern);
    if (directMatch) {
      return {
        expression: `${directMatch[1]}.${colName}`,
        isAlias: false,
        sourceColumn: colName,
      };
    }

    return null;
  }

  /**
   * Walk backwards from the AS keyword to find the full expression,
   * respecting parenthesis nesting (so commas inside round(), coalesce() etc
   * don't break the expression boundary).
   */
  private extractExprBeforeAs(sql: string, asIdx: number): string | null {
    let depth = 0;
    let start = asIdx - 1;

    // Skip whitespace before AS
    while (start >= 0 && /\s/.test(sql[start])) start--;

    const end = start + 1;

    // Walk backwards, tracking parens
    while (start >= 0) {
      const ch = sql[start];

      if (ch === ')') {
        depth++;
      } else if (ch === '(') {
        if (depth === 0) break; // Unmatched open paren — we've gone too far
        depth--;
      } else if (depth === 0) {
        // At top level: stop at comma, newline preceded by comma-context, or SELECT/FROM keywords
        if (ch === ',') {
          start++; // Don't include the comma
          break;
        }
        // Check for keyword boundaries
        if (ch === '\n' || ch === '\r') {
          // Check if the text before is a keyword
          const before = sql.substring(Math.max(0, start - 10), start).trim().toLowerCase();
          if (before.endsWith('select') || before.endsWith('from') || before.endsWith('where')) {
            start++;
            break;
          }
        }
      }
      start--;
    }

    if (start < 0) start = 0;

    const expr = sql.substring(start, end).trim();
    return expr.length > 0 ? expr : null;
  }

  /**
   * Extract column references from a SQL expression.
   * Finds both "table.column" and bare "column" patterns.
   * Uses upstreamColNames to distinguish real columns from SQL functions/keywords.
   */
  private extractColumnRefsFromExpr(expr: string, upstreamColNames: Set<string>): string[] {
    const refs: string[] = [];
    const seen = new Set<string>();

    // Match table.column patterns
    const tableColPattern = /\b(\w+)\.(\w+)\b/g;
    let match;
    while ((match = tableColPattern.exec(expr)) !== null) {
      const col = match[2].toLowerCase();
      if (!this.isSqlKeyword(col) && !seen.has(col)) {
        seen.add(col);
        refs.push(col);
      }
    }

    // Match bare column names — only include if they exist in upstream models
    // This catches "count(distinct user_id)" where user_id has no table prefix
    const bareWordPattern = /\b(\w+)\b/g;
    while ((match = bareWordPattern.exec(expr)) !== null) {
      const word = match[1].toLowerCase();
      if (!seen.has(word) && !this.isSqlKeyword(word) && upstreamColNames.has(word)) {
        seen.add(word);
        refs.push(word);
      }
    }

    return refs;
  }

  private isSqlKeyword(word: string): boolean {
    const keywords = new Set([
      'select', 'from', 'where', 'join', 'on', 'and', 'or', 'not', 'as',
      'case', 'when', 'then', 'else', 'end', 'in', 'is', 'null', 'true',
      'false', 'between', 'like', 'group', 'order', 'by', 'having', 'limit',
      'union', 'all', 'distinct', 'left', 'right', 'inner', 'outer', 'cross',
      'full', 'exists', 'asc', 'desc', 'with', 'recursive', 'insert', 'update',
      'delete', 'set', 'into', 'values', 'create', 'table', 'view', 'index',
      'over', 'partition', 'row', 'rows', 'range', 'unbounded', 'preceding',
      'following', 'current', 'first', 'last', 'nulls', 'filter',
      // Common SQL functions that aren't column names
      'count', 'sum', 'avg', 'min', 'max', 'round', 'coalesce', 'cast',
      'extract', 'date_trunc', 'lag', 'lead', 'row_number', 'rank', 'dense_rank',
      'concat', 'trim', 'lower', 'upper', 'replace', 'substring', 'length',
      'abs', 'ceil', 'floor', 'power', 'sqrt', 'mod', 'sign',
      'date', 'timestamp', 'interval', 'hour', 'minute', 'second', 'day',
      'month', 'year', 'week', 'quarter', 'datediff', 'dateadd',
      'integer', 'varchar', 'text', 'boolean', 'numeric', 'float', 'double',
      'bigint', 'smallint', 'decimal', 'real', 'serial',
    ]);
    return keywords.has(word.toLowerCase());
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private makeModelNode(
    node: ManifestNode,
    columns: ColumnNode[],
    parseStatus: 'parsed' | 'fallback' | 'failed'
  ): ModelNode {
    return {
      id: node.uniqueId,
      name: node.name,
      resourceType: node.resourceType === 'source' ? 'source' : 'model',
      database: node.database,
      schema: node.schema,
      filePath: node.originalFilePath,
      materialization: node.materialization,
      columns,
      description: node.description,
      parseStatus,
    };
  }
}
