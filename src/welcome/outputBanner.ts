import * as vscode from 'vscode';
import { LineageGraph } from '../lineage/graphTypes';

// ANSI color helpers (truecolor: \x1b[38;2;R;G;Bm)
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// Flow colors matching the webview
const BLUE = '\x1b[38;2;59;130;246m';     // passthrough #3b82f6
const GREEN = '\x1b[38;2;16;185;129m';    // rename #10b981
const YELLOW = '\x1b[38;2;245;158;11m';   // transform #f59e0b
const PURPLE = '\x1b[38;2;139;92;246m';   // aggregate #8b5cf6
const CYAN = '\x1b[38;2;56;189;248m';     // accent
const WHITE = '\x1b[38;2;204;204;204m';
const GRAY = '\x1b[38;2;128;128;128m';
const GREEN_CHECK = '\x1b[38;2;74;222;128m'; // success green
const RED_WARN = '\x1b[38;2;239;68;68m';    // warning red

export class OutputBanner {
  constructor(private outputChannel: vscode.OutputChannel) {}

  show(projectName: string, graph: LineageGraph | null) {
    // Write plain text to OutputChannel (always available)
    this.showPlainBanner(projectName, graph);

    // Also create a colored pseudo-terminal for the visual banner
    this.showColoredTerminal(projectName, graph);
  }

  private showColoredTerminal(projectName: string, graph: LineageGraph | null) {
    const writeEmitter = new vscode.EventEmitter<string>();

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      open: () => {
        const lines = this.buildColoredLines(projectName, graph);
        // Small delay so terminal renders first
        setTimeout(() => {
          for (const line of lines) {
            writeEmitter.fire(line + '\r\n');
          }
        }, 200);
      },
      close: () => { writeEmitter.dispose(); },
    };

    const terminal = vscode.window.createTerminal({
      name: 'dbt Flow Lineage',
      pty,
      iconPath: new vscode.ThemeIcon('type-hierarchy'),
    });

    // Don't show() — it appears in the terminal list but doesn't steal focus
    // User can click on it to see the banner
    terminal.show(true); // preserveFocus = true
  }

  private buildColoredLines(projectName: string, graph: LineageGraph | null): string[] {
    const lines: string[] = [];
    const b = (color: string, text: string) => `${color}${BOLD}${text}${RESET}`;
    const d = (text: string) => `${GRAY}${text}${RESET}`;

    lines.push('');
    lines.push(`${CYAN}╔${'═'.repeat(59)}╗${RESET}`);
    lines.push(`${CYAN}║${RESET}                                                           ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${b(BLUE, '███████╗')}${b(BLUE, '██╗')}      ${b(BLUE, '██████╗')} ${b(BLUE, '██╗')}    ${b(BLUE, '██╗')}                    ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${b(BLUE, '██╔════╝')}${b(BLUE, '██║')}     ${b(BLUE, '██╔═══██╗')}${b(BLUE, '██║')}    ${b(BLUE, '██║')}                    ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${b(PURPLE, '█████╗')}  ${b(PURPLE, '██║')}     ${b(PURPLE, '██║   ██║')}${b(PURPLE, '██║ █╗ ██║')}                    ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${b(YELLOW, '██╔══╝')}  ${b(YELLOW, '██║')}     ${b(YELLOW, '██║   ██║')}${b(YELLOW, '██║███╗██║')}                    ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${b(GREEN, '██║')}     ${b(GREEN, '███████╗')}${b(GREEN, '╚██████╔╝')}${b(GREEN, '╚███╔███╔╝')}                    ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${d('╚═╝')}     ${d('╚══════╝')} ${d('╚═════╝')}  ${d('╚══╝╚══╝')}                    ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}                                                           ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}          ${b(WHITE, 'dbt Flow Lineage')} ${d('v0.1.0')}                          ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${d('Animated Column-Level Lineage for dbt')}                  ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}                                                           ${CYAN}║${RESET}`);
    lines.push(`${CYAN}╠${'═'.repeat(59)}╣${RESET}`);
    lines.push(`${CYAN}║${RESET}                                                           ${CYAN}║${RESET}`);

    if (graph) {
      const check = `${GREEN_CHECK}✔${RESET}`;
      lines.push(`${CYAN}║${RESET}  ${check} dbt project detected: ${b(WHITE, this.padR(projectName, 32))}${CYAN}║${RESET}`);
      lines.push(`${CYAN}║${RESET}  ${check} Models found: ${b(WHITE, this.padR(String(graph.metadata.totalModels), 40))}${CYAN}║${RESET}`);
      lines.push(`${CYAN}║${RESET}  ${check} Columns indexed: ${b(WHITE, this.padR(String(graph.metadata.totalColumns), 37))}${CYAN}║${RESET}`);
      lines.push(`${CYAN}║${RESET}  ${check} Column edges: ${b(WHITE, this.padR(String(graph.columnEdges.length), 40))}${CYAN}║${RESET}`);

      const rateColor = graph.metadata.parseSuccessRate >= 80 ? GREEN_CHECK : YELLOW;
      lines.push(`${CYAN}║${RESET}  ${check} Parse success rate: ${rateColor}${BOLD}${this.padR(graph.metadata.parseSuccessRate + '%', 35)}${RESET}${CYAN}║${RESET}`);
    } else {
      lines.push(`${CYAN}║${RESET}  ${RED_WARN}⚠${RESET} ${RED_WARN}No manifest.json found.${RESET}                               ${CYAN}║${RESET}`);
      lines.push(`${CYAN}║${RESET}    Run ${b(WHITE, 'dbt compile')} or ${b(WHITE, 'dbt docs generate')} first.       ${CYAN}║${RESET}`);
    }

    lines.push(`${CYAN}║${RESET}                                                           ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}  ${BLUE}●${RESET} Passthrough  ${GREEN}●${RESET} Rename  ${YELLOW}●${RESET} Transform  ${PURPLE}●${RESET} Aggregate       ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}                                                           ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}  ${d('Getting started:')}                                         ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${CYAN}→${RESET} Click the ${b(WHITE, 'Flow icon')} in the Activity Bar              ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${CYAN}→${RESET} Right-click any ${b(WHITE, '.sql')} file → Show Column Lineage  ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}    ${CYAN}→${RESET} Press ${b(WHITE, '+')} / ${b(WHITE, '-')} to zoom, ${b(WHITE, 'Esc')} to clear selection      ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}                                                           ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}  ${d('Requirement: define columns in schema.yml')}                 ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}  ${d('then run dbt compile to generate manifest.json')}            ${CYAN}║${RESET}`);
    lines.push(`${CYAN}║${RESET}                                                           ${CYAN}║${RESET}`);
    lines.push(`${CYAN}╚${'═'.repeat(59)}╝${RESET}`);
    lines.push('');

    return lines;
  }

  private showPlainBanner(projectName: string, graph: LineageGraph | null) {
    const ch = this.outputChannel;
    ch.appendLine('');
    ch.appendLine(`dbt Flow Lineage v0.1.0 — ${projectName}`);

    if (graph) {
      ch.appendLine(`  Models: ${graph.metadata.totalModels}`);
      ch.appendLine(`  Columns: ${graph.metadata.totalColumns}`);
      ch.appendLine(`  Column edges: ${graph.columnEdges.length}`);
      ch.appendLine(`  Parse rate: ${graph.metadata.parseSuccessRate}%`);
    } else {
      ch.appendLine('  No manifest.json found. Run dbt compile first.');
    }
    ch.appendLine('');
  }

  private padR(text: string, width: number): string {
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
  }
}
