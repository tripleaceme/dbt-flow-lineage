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

  parse(sql: string): SqlParseResult {
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

    // Handle JOINs
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
      const name = col.as || this.inferColumnName(expr);

      if (!name) continue;

      const sourceRefs: Array<{ table: string | null; column: string }> = [];
      this.collectColumnRefs(expr, sourceRefs);

      const transformationType = this.classifyTransformation(expr);

      columns.push({
        name: name.toLowerCase(),
        sourceRefs,
        transformationType,
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

    // Walk sub-expressions
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

    // CASE expression
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

    // Direct column reference = passthrough
    if (expr.type === 'column_ref') {
      return 'passthrough';
    }

    // Check for aggregate functions
    if (this.containsAggregate(expr)) {
      return 'aggregate';
    }

    // CAST of a column ref is still passthrough
    if (expr.type === 'cast' && expr.expr?.type === 'column_ref') {
      return 'passthrough';
    }

    return 'transform';
  }

  private containsAggregate(expr: any): boolean {
    if (!expr) return false;

    if (expr.type === 'aggr_func' || expr.type === 'function') {
      const funcName = (expr.name || expr.name?.name || '').toLowerCase();
      if (AGGREGATE_FUNCTIONS.has(funcName)) {
        return true;
      }
    }

    // Check for aggr_func type directly
    if (expr.type === 'aggr_func') {
      return true;
    }

    // Recurse
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
