/** Transformation type classification for column edges */
export type TransformationType = 'passthrough' | 'transform' | 'aggregate';

/** Column within a model or source */
export interface ColumnNode {
  /** Unique ID: "model.proj.orders::order_id" */
  id: string;
  /** Column name */
  name: string;
  /** Data type from catalog (e.g., "INTEGER", "TEXT") */
  dataType: string | null;
  /** Description from manifest or YAML */
  description: string;
}

/** Model or source node in the lineage graph */
export interface ModelNode {
  /** Manifest unique_id: "model.proj.orders" */
  id: string;
  /** Model name */
  name: string;
  /** Resource type */
  resourceType: 'model' | 'source';
  /** Database name */
  database: string;
  /** Schema name */
  schema: string;
  /** Path to the .sql file (for navigation) */
  filePath: string | null;
  /** Materialization strategy */
  materialization: string;
  /** Columns in this model */
  columns: ColumnNode[];
  /** Model description */
  description: string;
  /** Whether SQL parsing succeeded */
  parseStatus: 'parsed' | 'fallback' | 'failed';
}

/** Edge connecting two columns across models */
export interface ColumnEdge {
  /** Deterministic ID: "${sourceColId}->${targetColId}" */
  id: string;
  sourceModelId: string;
  sourceColumnId: string;
  targetModelId: string;
  targetColumnId: string;
  transformationType: TransformationType;
}

/** Model-level edge (fallback when column parsing fails) */
export interface ModelEdge {
  sourceModelId: string;
  targetModelId: string;
}

/** Complete lineage graph sent to the webview */
export interface LineageGraph {
  models: ModelNode[];
  columnEdges: ColumnEdge[];
  modelEdges: ModelEdge[];
  metadata: {
    generatedAt: string;
    dbtProjectName: string;
    totalModels: number;
    totalColumns: number;
    parseSuccessRate: number;
  };
}

/** Messages from extension host to webview */
export type ExtensionToWebviewMessage =
  | { type: 'setGraphData'; payload: LineageGraph }
  | { type: 'highlightModel'; payload: { modelId: string } }
  | { type: 'updateTheme'; payload: Record<string, string> };

/** Messages from webview to extension host */
export type WebviewToExtensionMessage =
  | { type: 'requestRefresh' }
  | { type: 'openFile'; payload: { filePath: string } }
  | { type: 'ready' };
