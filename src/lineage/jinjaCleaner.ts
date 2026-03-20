/**
 * Pre-processes dbt SQL to strip Jinja syntax, producing valid SQL
 * that node-sql-parser can handle.
 *
 * Strategy:
 * - {{ ref('model') }} → __ref__model (valid SQL identifier)
 * - {{ source('src', 'table') }} → __source__src__table
 * - {{ config(...) }} → removed entirely
 * - {% ... %} block tags → removed (conditionals, loops, etc.)
 * - {{ var(...) }} → '__jinja_var__' (string literal placeholder)
 * - Remaining {{ ... }} → __jinja_expr
 */

export interface RefMapping {
  placeholder: string;
  originalRef: string;
}

export interface JinjaCleanResult {
  cleanedSql: string;
  refMappings: RefMapping[];
}

export function cleanJinja(rawSql: string): JinjaCleanResult {
  let sql = rawSql;
  const refMappings: RefMapping[] = [];

  // 1. Remove {# ... #} comments
  sql = sql.replace(/\{#[\s\S]*?#\}/g, '');

  // 2. Replace {{ config(...) }} with nothing
  sql = sql.replace(/\{\{\s*config\s*\([\s\S]*?\)\s*\}\}/g, '');

  // 3. Replace {{ ref('model_name') }} with __ref__model_name
  sql = sql.replace(
    /\{\{\s*ref\s*\(\s*['"](\w+)['"]\s*\)\s*\}\}/g,
    (_match, modelName: string) => {
      const placeholder = `__ref__${modelName}`;
      refMappings.push({ placeholder, originalRef: modelName });
      return placeholder;
    }
  );

  // 4. Replace {{ ref('package', 'model_name') }} with __ref__package__model_name
  sql = sql.replace(
    /\{\{\s*ref\s*\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*\)\s*\}\}/g,
    (_match, pkg: string, modelName: string) => {
      const placeholder = `__ref__${pkg}__${modelName}`;
      refMappings.push({ placeholder, originalRef: modelName });
      return placeholder;
    }
  );

  // 5. Replace {{ source('source_name', 'table_name') }} with __source__src__table
  sql = sql.replace(
    /\{\{\s*source\s*\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*\)\s*\}\}/g,
    (_match, srcName: string, tableName: string) => {
      const placeholder = `__source__${srcName}__${tableName}`;
      refMappings.push({ placeholder, originalRef: `${srcName}.${tableName}` });
      return placeholder;
    }
  );

  // 6. Replace {{ var('name') }} with a string literal
  sql = sql.replace(
    /\{\{\s*var\s*\(\s*['"][\w.]+['"]\s*(?:,\s*[\s\S]*?)?\)\s*\}\}/g,
    "'__jinja_var__'"
  );

  // 7. Remove {% ... %} block tags (if/endif, for/endfor, macro, set, etc.)
  sql = sql.replace(/\{%[-+]?[\s\S]*?[-+]?%\}/g, '');

  // 8. Replace any remaining {{ ... }} with a placeholder identifier
  sql = sql.replace(/\{\{[\s\S]*?\}\}/g, '__jinja_expr');

  // 9. Clean up resulting empty lines and excessive whitespace
  sql = sql.replace(/^\s*\n/gm, '\n');
  sql = sql.replace(/\n{3,}/g, '\n\n');
  sql = sql.trim();

  return { cleanedSql: sql, refMappings };
}
