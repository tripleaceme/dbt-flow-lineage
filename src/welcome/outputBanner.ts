import * as vscode from 'vscode';
import { LineageGraph } from '../lineage/graphTypes';

export class OutputBanner {
  constructor(private outputChannel: vscode.OutputChannel) {}

  show(projectName: string, graph: LineageGraph | null) {
    const ch = this.outputChannel;

    ch.appendLine('');
    ch.appendLine('╔═══════════════════════════════════════════════════════════╗');
    ch.appendLine('║                                                           ║');
    ch.appendLine('║    ███████╗██╗      ██████╗ ██╗    ██╗                    ║');
    ch.appendLine('║    ██╔════╝██║     ██╔═══██╗██║    ██║                    ║');
    ch.appendLine('║    █████╗  ██║     ██║   ██║██║ █╗ ██║                    ║');
    ch.appendLine('║    ██╔══╝  ██║     ██║   ██║██║███╗██║                    ║');
    ch.appendLine('║    ██║     ███████╗╚██████╔╝╚███╔███╔╝                    ║');
    ch.appendLine('║    ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝                    ║');
    ch.appendLine('║                                                           ║');
    ch.appendLine('║          dbt Flow Lineage v0.1.0                          ║');
    ch.appendLine('║    Animated Column-Level Lineage for dbt                  ║');
    ch.appendLine('║                                                           ║');
    ch.appendLine('╠═══════════════════════════════════════════════════════════╣');
    ch.appendLine('║                                                           ║');

    if (graph) {
      const check = '✔';
      ch.appendLine(`║  ${check} dbt project detected: ${this.pad(projectName, 34)}║`);
      ch.appendLine(`║  ${check} Models found: ${this.pad(String(graph.metadata.totalModels), 40)}║`);
      ch.appendLine(`║  ${check} Columns indexed: ${this.pad(String(graph.metadata.totalColumns), 37)}║`);
      ch.appendLine(`║  ${check} Parse success rate: ${this.pad(graph.metadata.parseSuccessRate + '%', 35)}║`);
    } else {
      ch.appendLine('║  ⚠ No manifest.json found.                               ║');
      ch.appendLine('║    Run `dbt compile` or `dbt docs generate` first.       ║');
    }

    ch.appendLine('║                                                           ║');
    ch.appendLine('║  ● Passthrough  ● Transform  ● Aggregate                 ║');
    ch.appendLine('║                                                           ║');
    ch.appendLine('║  Getting started:                                         ║');
    ch.appendLine('║    → Click the Flow icon in the Activity Bar              ║');
    ch.appendLine('║    → Right-click any .sql file → Show Column Lineage      ║');
    ch.appendLine('║    → Look for "View lineage →" above SELECT statements    ║');
    ch.appendLine('║                                                           ║');
    ch.appendLine('╚═══════════════════════════════════════════════════════════╝');
    ch.appendLine('');

    ch.show(true); // show but don't take focus
  }

  private pad(text: string, width: number): string {
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
  }
}
