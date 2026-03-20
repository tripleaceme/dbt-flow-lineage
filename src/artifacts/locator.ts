import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface ProjectInfo {
  projectRoot: string;
  projectName: string;
  targetDir: string;
  manifestPath: string;
  catalogPath: string | null;
}

export class ArtifactLocator {
  /**
   * Finds the dbt project in the current workspace and locates artifacts.
   * Looks for dbt_project.yml, then resolves the target directory.
   */
  async findProject(): Promise<ProjectInfo | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return null;
    }

    for (const folder of workspaceFolders) {
      const result = await this.searchForProject(folder.uri.fsPath);
      if (result) {
        return result;
      }
    }

    return null;
  }

  private async searchForProject(rootDir: string): Promise<ProjectInfo | null> {
    const projectYmlPath = path.join(rootDir, 'dbt_project.yml');

    try {
      await fs.access(projectYmlPath);
    } catch {
      // dbt_project.yml not found at workspace root — try one level deep
      return this.searchSubdirectories(rootDir);
    }

    return this.resolveArtifacts(rootDir, projectYmlPath);
  }

  private async searchSubdirectories(rootDir: string): Promise<ProjectInfo | null> {
    try {
      const entries = await fs.readdir(rootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }
        const subPath = path.join(rootDir, entry.name, 'dbt_project.yml');
        try {
          await fs.access(subPath);
          return this.resolveArtifacts(path.join(rootDir, entry.name), subPath);
        } catch {
          continue;
        }
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async resolveArtifacts(
    projectRoot: string,
    projectYmlPath: string
  ): Promise<ProjectInfo | null> {
    // Read project name from dbt_project.yml
    const content = await fs.readFile(projectYmlPath, 'utf-8');
    const nameMatch = content.match(/^name:\s*['"]?(\w+)['"]?/m);
    const projectName = nameMatch ? nameMatch[1] : path.basename(projectRoot);

    // Resolve target path from config or dbt_project.yml
    const config = vscode.workspace.getConfiguration('dbtFlowLineage');
    let targetRelPath = config.get<string>('targetPath', 'target');

    const targetPathMatch = content.match(/^target-path:\s*['"]?([^\s'"]+)['"]?/m);
    if (targetPathMatch) {
      targetRelPath = targetPathMatch[1];
    }

    const targetDir = path.join(projectRoot, targetRelPath);
    const manifestPath = path.join(targetDir, 'manifest.json');

    try {
      await fs.access(manifestPath);
    } catch {
      // manifest.json doesn't exist yet — user needs to run dbt compile/docs generate
      return {
        projectRoot,
        projectName,
        targetDir,
        manifestPath,
        catalogPath: null,
      };
    }

    // Check for catalog.json (optional)
    const catalogPath = path.join(targetDir, 'catalog.json');
    let catalogExists = false;
    try {
      await fs.access(catalogPath);
      catalogExists = true;
    } catch {
      // catalog not generated yet
    }

    return {
      projectRoot,
      projectName,
      targetDir,
      manifestPath,
      catalogPath: catalogExists ? catalogPath : null,
    };
  }
}
