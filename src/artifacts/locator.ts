import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface ProjectInfo {
  projectRoot: string;
  projectName: string;
  targetDir: string;
  manifestPath: string;
  catalogPath: string | null;
  hasManifest: boolean;
}

const SAVED_PROJECT_KEY = 'dbtFlowLineage.savedProjectRoot';

export class ArtifactLocator {
  /**
   * Finds the dbt project to use. Checks saved selection first,
   * falls back to scanning + picker if needed.
   */
  async findProject(context: vscode.ExtensionContext): Promise<ProjectInfo | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    // Collect all dbt projects
    const allProjects: ProjectInfo[] = [];
    for (const folder of workspaceFolders) {
      const projects = await this.findAllProjects(folder.uri.fsPath, 3);
      allProjects.push(...projects);
    }

    if (allProjects.length === 0) {
      return null;
    }

    // Check saved selection
    const savedRoot = context.globalState.get<string>(SAVED_PROJECT_KEY);
    if (savedRoot) {
      const savedProject = allProjects.find((p) => p.projectRoot === savedRoot);
      if (savedProject) {
        return savedProject;
      }
      // Saved project no longer exists — clear it
      await context.globalState.update(SAVED_PROJECT_KEY, undefined);
    }

    // Auto-select if only one project (with or without manifest)
    const withManifest = allProjects.filter((p) => p.hasManifest);

    if (withManifest.length === 1) {
      await context.globalState.update(SAVED_PROJECT_KEY, withManifest[0].projectRoot);
      return withManifest[0];
    }

    if (allProjects.length === 1) {
      await context.globalState.update(SAVED_PROJECT_KEY, allProjects[0].projectRoot);
      return allProjects[0];
    }

    // Multiple projects — let user pick
    const candidates = withManifest.length > 0 ? withManifest : allProjects;
    const picked = await this.showProjectPicker(candidates);

    if (picked) {
      await context.globalState.update(SAVED_PROJECT_KEY, picked.projectRoot);
    }

    return picked;
  }

  /**
   * Clears the saved project selection so the picker shows again.
   */
  static async clearSavedProject(context: vscode.ExtensionContext) {
    await context.globalState.update(SAVED_PROJECT_KEY, undefined);
  }

  private async findAllProjects(
    dir: string,
    maxDepth: number,
    currentDepth: number = 0
  ): Promise<ProjectInfo[]> {
    if (currentDepth > maxDepth) return [];

    const results: ProjectInfo[] = [];
    const projectYmlPath = path.join(dir, 'dbt_project.yml');

    try {
      await fs.access(projectYmlPath);
      const info = await this.resolveArtifacts(dir, projectYmlPath);
      if (info) {
        results.push(info);
      }
      return results;
    } catch {
      // No dbt_project.yml here
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (this.shouldSkipDir(entry.name)) continue;

        const subResults = await this.findAllProjects(
          path.join(dir, entry.name),
          maxDepth,
          currentDepth + 1
        );
        results.push(...subResults);
      }
    } catch {
      // Permission denied or read error
    }

    return results;
  }

  private shouldSkipDir(name: string): boolean {
    const skipList = new Set([
      'node_modules', 'dbt_packages', '.git', '.venv', 'venv',
      '__pycache__', 'dist', 'build', 'lib', 'include', 'bin',
      'share', 'etc', 'site-packages',
    ]);
    return name.startsWith('.') || skipList.has(name);
  }

  private async showProjectPicker(projects: ProjectInfo[]): Promise<ProjectInfo | null> {
    const items = projects.map((p) => ({
      label: p.projectName,
      description: p.hasManifest ? 'manifest.json found' : 'no manifest — run dbt compile',
      detail: p.projectRoot,
      project: p,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Multiple dbt projects found — select one',
      title: 'dbt Flow Lineage: Choose Project',
    });

    return picked?.project || null;
  }

  private async resolveArtifacts(
    projectRoot: string,
    projectYmlPath: string
  ): Promise<ProjectInfo | null> {
    const content = await fs.readFile(projectYmlPath, 'utf-8');
    const nameMatch = content.match(/^name:\s*['"]?(\w+)['"]?/m);
    const projectName = nameMatch ? nameMatch[1] : path.basename(projectRoot);

    const config = vscode.workspace.getConfiguration('dbtFlowLineage');
    let targetRelPath = config.get<string>('targetPath', 'target');

    const targetPathMatch = content.match(/^target-path:\s*['"]?([^\s'"]+)['"]?/m);
    if (targetPathMatch) {
      targetRelPath = targetPathMatch[1];
    }

    const targetDir = path.join(projectRoot, targetRelPath);
    const manifestPath = path.join(targetDir, 'manifest.json');

    let hasManifest = false;
    try {
      await fs.access(manifestPath);
      hasManifest = true;
    } catch {
      // manifest doesn't exist yet
    }

    let catalogPath: string | null = null;
    if (hasManifest) {
      const catPath = path.join(targetDir, 'catalog.json');
      try {
        await fs.access(catPath);
        catalogPath = catPath;
      } catch {
        // catalog not generated
      }
    }

    return {
      projectRoot,
      projectName,
      targetDir,
      manifestPath,
      catalogPath,
      hasManifest,
    };
  }
}
