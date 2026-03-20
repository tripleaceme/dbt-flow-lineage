import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Watches the dbt target directory for changes to manifest.json.
 * Fires an event when artifacts are regenerated.
 */
export class ArtifactWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher;
  private _onDidChange = new vscode.EventEmitter<void>();
  private debounceTimer: NodeJS.Timeout | null = null;

  /** Fires when manifest.json changes (debounced) */
  readonly onDidChange = this._onDidChange.event;

  constructor(targetDir: string) {
    const pattern = new vscode.RelativePattern(targetDir, 'manifest.json');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const handler = () => this.debouncedFire();
    this.watcher.onDidChange(handler);
    this.watcher.onDidCreate(handler);
  }

  private debouncedFire() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this._onDidChange.fire();
    }, 1000);
  }

  dispose() {
    this.watcher.dispose();
    this._onDidChange.dispose();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
