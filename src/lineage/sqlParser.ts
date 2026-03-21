import { Parser } from 'node-sql-parser';
import { TransformationType } from './graphTypes';

/** A single output column extracted from a SELECT statement */
export interface ParsedColumn {
  /** Output column name (alias or inferred) */
  name: string;
  /** Source column references: [{table, column}] */
  sourceRefs: Array<{ table: string | null; column: string }>;
  /** How this column is derived */
  transformationType: TransformationType;
  /** Whether the column was renamed via alias (sourceCol AS newName) */
  isRenamed: boolean;
}

/** Result of parsing a model's SQL */
export interface SqlParseResult {
  columns: ParsedColumn[];
  tableRefs: string[];
  success: boolean;
  error?: string;
}

const AGGREGATE_FUNCTIONS = new Set([
  'count', 'sum', 'avg', 'min', 'max', 'array_agg', 'string_agg',
  'group_concat', 'listagg', 'median', 'percentile_cont',
  'percentile_disc', 'stddev', 'variance', 'var_pop', 'var_samp',
  'covar_pop', 'covar_samp', 'corr', 'any_value', 'approx_count_distinct',
  'hll_count', 'count_if', 'sum_if',
]);

export class SqlColumnParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * Try AST parsing first, fall back to regex extraction.
   */
  parse(sql: string): SqlParseResult {
    // Try AST parse
    const astResult = this.parseWithAst(sql);
    if (astResult.success && astResult.columns.length > 0) {
      return astResult;
    }

    // Fallback: regex-based extraction
    return this.parseWithRegex(sql);
  }

  private parseWithAst(sql: string): SqlParseResult {
    try {
      const ast = this.parser.astify(sql, { database: 'postgresql' });
      const stmt = Array.isArray(ast) ? ast[0] : ast;

      if (!stmt || stmt.type !== 'select') {
        return { columns: [], tableRefs: [], success: false, error: 'Not a SELECT statement' };
      }

      const tableRefs = this.extractTableRefs(stmt);
      const columns = this.extractColumns(stmt);

      return { columns, tableRefs, success: true };
    } catch (err: any) {
      return {
        columns: [],
        tableRefs: [],
        success: false,
        error: err.message || 'SQL parse error',
      };
    }
  }

  /**
   * Regex fallback: extracts column names and table refs from SQL text.
   * Handles most common dbt SQL patterns even when the AST parser fails.
   */
  private parseWithRegex(sql: string): SqlParseResult {
    const columns: ParsedColumn[] = [];
    const tableRefs: string[] = [];

    // Extract table refs from FROM/JOIN clauses
    const tableRegex = /\b(?:from|join)\s+(\w+)(?:\s+(?:as\s+)?(\w+))?/gi;
    let tableMatch;
    while ((tableMatch = tableRegex.exec(sql)) !== null) {
      tableRefs.push(tableMatch[1]);
    }

    // Find the main SELECT...FROM block
    const selectMatch = sql.match(/\bselect\b\s+([\s\S]*?)\bfrom\b/i);
    if (!selectMatch) {
      return { columns, tableRefs, success: false, error: 'No SELECT...FROM found' };
    }

    const selectBody = selectMatch[1];

    // Split by top-level commas (ignore commas inside parentheses)
    const columnExprs = this.splitSelectColumns(selectBody);

    for (const expr of columnExprs) {
      const trimmed = expr.trim();
      if (!trimmed || trimmed === '*') continue;

      // Check for alias: "expr AS alias" or "expr alias"
      const aliasMatch = trimmed.match(/\bas\s+(\w+)\s*$/i)
        || trimmed.match(/\)\s+(\w+)\s*$/)
        || trimmed.match(/\s+(\w+)\s*$/);

      // Check for simple column ref: "table.column" or "column"
      const simpleColMatch = trimmed.match(/^(\w+)\.(\w+)$/);
      const bareColMatch = trimmed.match(/^(\w+)$/);

      let name: string | null = null;
      let sourceCol: string | null = null;
      let sourceTable: string | null = null;
      let transformationType: TransformationType = 'transform';
      let isRenamed = false;

      if (simpleColMatch && !aliasMatch) {
        // table.column (no alias) — passthrough
        sourceTable = simpleColMatch[1];
        sourceCol = simpleColMatch[2].toLowerCase();
        name = sourceCol;
        transformationType = 'passthrough';
      } else if (bareColMatch && !aliasMatch) {
        // bare column — passthrough
        sourceCol = bareColMatch[1].toLowerCase();
        name = sourceCol;
        transformationType = 'passthrough';
      } else if (aliasMatch) {
        name = aliasMatch[1].toLowerCase();

        // Check if it's a simple rename: "source_col AS new_name"
        const beforeAlias = trimmed.substring(0, trimmed.length - aliasMatch[0].length).trim();
        const renameMatch = beforeAlias.match(/^(\w+)\.(\w+)$/) || beforeAlias.match(/^(\w+)$/);

        if (renameMatch) {
          if (renameMatch[2]) {
            sourceTable = renameMatch[1];
            sourceCol = renameMatch[2].toLowerCase();
          } else {
            sourceCol = renameMatch[1].toLowerCase();
          }

          if (sourceCol !== name) {
            transformationType = 'rename';
            isRenamed = true;
          } else {
            transformationType = 'passthrough';
          }
        } else {
          // Complex expression with alias — check for aggregates
          const hasAgg = /\b(count|sum|avg|min|max|array_agg|string_agg)\s*\(/i.test(beforeAlias);
          transformationType = hasAgg ? 'aggregate' : 'transform';

          // Try to extract column refs from the expression
          const colRefs = this.extractColumnRefsFromText(beforeAlias);
          if (colRefs.length > 0) {
            for (const ref of colRefs) {
              columns.push({
                name,
                sourceRefs: [ref],
                transformationType,
                isRenamed: false,
              });
            }
            continue;
          }
        }
      }

      if (name) {
        const sourceRefs: Array<{ table: string | null; column: string }> = [];
        if (sourceCol) {
          sourceRefs.push({ table: sourceTable, column: sourceCol });
        }
        columns.push({ name, sourceRefs, transformationType, isRenamed });
      }
    }

    return { columns, tableRefs, success: columns.length > 0 };
  }

  /**
   * Split SELECT column expressions by top-level commas,
   * respecting parentheses depth.
   */
  private splitSelectColumns(selectBody: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;

    for (const char of selectBody) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  /**
   * Extract table.column references from a SQL expression text.
   */
  private extractColumnRefsFromText(text: string): Array<{ table: string | null; column: string }> {
    const refs: Array<{ table: string | null; column: string }> = [];
    const colRefRegex = /\b(\w+)\.(\w+)\b/g;
    let match;
    while ((match = colRefRegex.exec(text)) !== null) {
      // Skip SQL keywords and function names
      const possibleTable = match[1].toLowerCase();
      if (['as', 'and', 'or', 'not', 'case', 'when', 'then', 'else', 'end', 'is', 'in', 'null'].includes(possibleTable)) {
        continue;
      }
      refs.push({ table: match[1], column: match[2].toLowerCase() });
    }
    return refs;
  }

  private extractTableRefs(stmt: any): string[] {
    const refs: string[] = [];
    this.walkFrom(stmt.from, refs);
    return refs;
  }

  private walkFrom(from: any, refs: string[]): void {
    if (!from) return;

    if (Array.isArray(from)) {
      for (const item of from) {
        this.walkFrom(item, refs);
      }
      return;
    }

    if (from.table) {
      refs.push(from.table);
    }

    if (from.join) {
      this.walkFrom(from.join, refs);
    }
  }

  private extractColumns(stmt: any): ParsedColumn[] {
    const columns: ParsedColumn[] = [];

    if (!stmt.columns || stmt.columns === '*') {
      return columns;
    }

    for (const col of stmt.columns) {
      const expr = col.expr;
      const alias = col.as;
      const inferredName = this.inferColumnName(expr);
      const name = alias || inferredName;

      if (!name) continue;

      const sourceRefs: Array<{ table: string | null; column: string }> = [];
      this.collectColumnRefs(expr, sourceRefs);

      let transformationType = this.classifyTransformation(expr);

      // Detect rename: has alias AND is a direct column ref AND alias != source name
      let isRenamed = false;
      if (alias && expr?.type === 'column_ref' && inferredName) {
        if (alias.toLowerCase() !== inferredName.toLowerCase()) {
          transformationType = 'rename';
          isRenamed = true;
        }
      }

      columns.push({
        name: name.toLowerCase(),
        sourceRefs,
        transformationType,
        isRenamed,
      });
    }

    return columns;
  }

  private inferColumnName(expr: any): string | null {
    if (!expr) return null;

    if (expr.type === 'column_ref') {
      return expr.column?.expr?.value || expr.column || null;
    }

    return null;
  }

  private collectColumnRefs(
    expr: any,
    refs: Array<{ table: string | null; column: string }>
  ): void {
    if (!expr) return;

    if (expr.type === 'column_ref') {
      const column = expr.column?.expr?.value || expr.column;
      const table = expr.table?.expr?.value || expr.table || null;
      if (column && typeof column === 'string') {
        refs.push({ table, column: column.toLowerCase() });
      }
      return;
    }

    if (expr.args) {
      const args = Array.isArray(expr.args) ? expr.args : [expr.args];
      for (const arg of args) {
        if (arg?.expr) {
          this.collectColumnRefs(arg.expr, refs);
        } else {
          this.collectColumnRefs(arg, refs);
        }
      }
    }

    if (expr.left) this.collectColumnRefs(expr.left, refs);
    if (expr.right) this.collectColumnRefs(expr.right, refs);
    if (expr.expr) this.collectColumnRefs(expr.expr, refs);

    if (expr.args?.case) {
      for (const caseItem of expr.args.case) {
        this.collectColumnRefs(caseItem.cond, refs);
        this.collectColumnRefs(caseItem.result, refs);
      }
    }
    if (expr.args?.else) {
      this.collectColumnRefs(expr.args.else, refs);
    }
  }

  private classifyTransformation(expr: any): TransformationType {
    if (!expr) return 'passthrough';

    if (expr.type === 'column_ref') {
      return 'passthrough';
    }

    if (this.containsAggregate(expr)) {
      return 'aggregate';
    }

    if (expr.type === 'cast' && expr.expr?.type === 'column_ref') {
      return 'passthrough';
    }

    return 'transform';
  }

  private containsAggregate(expr: any): boolean {
    if (!expr) return false;

    if (expr.type === 'aggr_func') {
      return true;
    }

    if (expr.type === 'function') {
      const funcName = (expr.name || expr.name?.name || '').toLowerCase();
      if (AGGREGATE_FUNCTIONS.has(funcName)) {
        return true;
      }
    }

    if (expr.args) {
      const args = Array.isArray(expr.args) ? expr.args : [expr.args];
      for (const arg of args) {
        if (this.containsAggregate(arg?.expr || arg)) return true;
      }
    }
    if (this.containsAggregate(expr.left)) return true;
    if (this.containsAggregate(expr.right)) return true;
    if (this.containsAggregate(expr.expr)) return true;

    return false;
  }
}
