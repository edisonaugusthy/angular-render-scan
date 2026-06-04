/**
 * angular-render-scan CLI
 *
 * Usage: npx angular-render-scan-cli init
 *        npx angular-render-scan-cli init --force
 *
 * Automatically detects your Angular project structure and inserts
 * provideAngularRenderScan() into your bootstrap providers, or adds
 * the script tag to index.html for non-provider mode.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// ─── ANSI colour helpers (no deps) ───────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function log(msg: string) { process.stdout.write(msg + '\n'); }
function ok(msg: string) { log(`${c.green}✔${c.reset} ${msg}`); }
function warn(msg: string) { log(`${c.yellow}⚠${c.reset}  ${msg}`); }
function err(msg: string) { log(`${c.red}✖${c.reset} ${msg}`); }
function info(msg: string) { log(`${c.cyan}ℹ${c.reset}  ${msg}`); }
function step(n: number, total: number, msg: string) {
  log(`${c.gray}[${n}/${total}]${c.reset} ${msg}`);
}

// ─── File discovery helpers ───────────────────────────────────────────────────

function findUp(filename: string, startDir = process.cwd()): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function writeFile(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content, 'utf-8');
}

function findWorkspaceConfig(): string | null {
  return findUp('angular.json') ?? findUp('workspace.json') ?? findUp('nx.json') ?? findUp('project.json');
}

/**
 * Find the Angular app entry file. Priority:
 * 1. build target main/browser from angular.json, workspace.json, or Nx project.json
 * 2. src/main.ts relative to workspace/project root
 * 3. apps/[name]/src/main.ts (Nx monorepo)
 * 3. Any main.ts near the angular.json
 */
function findMainTs(workspaceConfigPath: string): string | null {
  const root = path.dirname(workspaceConfigPath);
  const configName = path.basename(workspaceConfigPath);

  // Try to parse Angular/Nx workspace files for the configured app entrypoint.
  try {
    const config = JSON.parse(readFile(workspaceConfigPath));
    const directProject = configName === 'project.json'
      ? entrypointFromProjectConfig(config, root, root)
      : null;
    if (directProject) return directProject;

    for (const project of projectConfigsFromWorkspace(config, root)) {
      const mainFile = entrypointFromProjectConfig(project.config, root, project.projectRoot);
      if (mainFile) return mainFile;
    }
  } catch {
    // Ignore parse errors
  }

  // Fallback: common locations
  const candidates = [
    path.join(root, 'src', 'main.ts'),
    path.join(root, 'src', 'main.server.ts'),
    ...glob(path.join(root, 'apps'), 'main.ts', 4),
    ...glob(path.join(root, 'packages'), 'main.ts', 4)
  ];

  return candidates.find(f => fs.existsSync(f)) ?? null;
}

type ProjectConfigRef = {
  config: any;
  projectRoot: string;
};

function projectConfigsFromWorkspace(workspaceConfig: any, workspaceRoot: string): ProjectConfigRef[] {
  const refs: ProjectConfigRef[] = [];
  const projects = workspaceConfig.projects ?? {};

  for (const [name, value] of Object.entries(projects)) {
    if (typeof value === 'string') {
      const projectRoot = path.resolve(workspaceRoot, value);
      const projectJsonPath = path.join(projectRoot, 'project.json');
      if (fs.existsSync(projectJsonPath)) {
        refs.push({ config: JSON.parse(readFile(projectJsonPath)), projectRoot });
      }
      continue;
    }

    if (value && typeof value === 'object') {
      const projectRoot = path.resolve(workspaceRoot, String((value as any).root ?? ''));
      refs.push({ config: value, projectRoot });
    } else {
      const projectRoot = path.resolve(workspaceRoot, 'apps', name);
      const projectJsonPath = path.join(projectRoot, 'project.json');
      if (fs.existsSync(projectJsonPath)) {
        refs.push({ config: JSON.parse(readFile(projectJsonPath)), projectRoot });
      }
    }
  }

  for (const projectJsonPath of glob(workspaceRoot, 'project.json', 5)) {
    const projectRoot = path.dirname(projectJsonPath);
    if (!refs.some(ref => ref.projectRoot === projectRoot)) {
      refs.push({ config: JSON.parse(readFile(projectJsonPath)), projectRoot });
    }
  }

  return refs;
}

function entrypointFromProjectConfig(project: any, workspaceRoot: string, projectRoot: string): string | null {
  const targets = project.targets ?? project.architect ?? {};
  const buildTarget = targets.build ?? targets['build-browser'] ?? targets.application ?? null;
  const options = buildTarget?.options ?? {};
  const candidates = [
    options.main,
    options.browser,
    options.server
  ].filter((candidate): candidate is string => typeof candidate === 'string');

  for (const candidate of candidates) {
    const resolved = resolveProjectFile(workspaceRoot, projectRoot, candidate);
    if (fs.existsSync(resolved)) return resolved;
  }

  return null;
}

function resolveProjectFile(workspaceRoot: string, projectRoot: string, filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;

  const workspaceRelative = path.resolve(workspaceRoot, filePath);
  if (fs.existsSync(workspaceRelative)) return workspaceRelative;

  return path.resolve(projectRoot, filePath);
}

function glob(dir: string, filename: string, maxDepth: number): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir) || maxDepth <= 0) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...glob(full, filename, maxDepth - 1));
    } else if (entry.name === filename) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Find app.config.ts — preferred over main.ts for standalone Angular apps.
 */
function findAppConfig(mainTsPath: string): string | null {
  const dir = path.dirname(mainTsPath);
  const appDir = path.join(dir, 'app');

  const candidates = [
    path.join(dir, 'app.config.ts'),
    path.join(appDir, 'app.config.ts'),
  ];

  // Also try to read the import from main.ts
  try {
    const mainContent = readFile(mainTsPath);
    const match = mainContent.match(/from\s+['"]([^'"]*app\.config[^'"]*)['"]/);
    if (match) {
      const relative = match[1];
      const resolved = path.resolve(dir, relative + '.ts').replace(/\.ts\.ts$/, '.ts');
      if (fs.existsSync(resolved)) return resolved;
    }
  } catch {
    // Ignore
  }

  return candidates.find(f => fs.existsSync(f)) ?? null;
}

/**
 * Find index.html for script-tag fallback.
 */
function findIndexHtml(workspaceConfigPath: string): string | null {
  const root = path.dirname(workspaceConfigPath);
  const candidates = [
    path.join(root, 'src', 'index.html'),
    path.join(root, 'index.html'),
    ...glob(path.join(root, 'apps'), 'index.html', 4),
    ...glob(path.join(root, 'packages'), 'index.html', 4)
  ];
  return candidates.find(f => fs.existsSync(f)) ?? null;
}

// ─── Patch logic ─────────────────────────────────────────────────────────────

const IMPORT_STATEMENT = `import { provideAngularRenderScan } from 'angular-render-scan';`;
const PROVIDER_CALL = `provideAngularRenderScan()`;

/** Check if the file already has the provider set up */
function alreadyPatched(content: string): boolean {
  return content.includes('angular-render-scan') || content.includes('provideAngularRenderScan');
}

function findMatchingSquareBracket(content: string, openingBracketIndex: number): number {
  let depth = 0;

  for (let i = openingBracketIndex; i < content.length; i++) {
    const char = content[i];
    if (char === '[') depth++;
    if (char === ']') depth--;
    if (depth === 0) return i;
  }

  return -1;
}

function insertProviderIntoProvidersArray(content: string, providersMatch: RegExpMatchArray): string | null {
  if (providersMatch.index === undefined) return null;

  const openingBracketIndex = providersMatch.index + providersMatch[0].lastIndexOf('[');
  const closingBracketIndex = findMatchingSquareBracket(content, openingBracketIndex);
  if (closingBracketIndex === -1) return null;

  const currentLineStart = content.lastIndexOf('\n', providersMatch.index) + 1;
  const baseIndent = content.slice(currentLineStart, providersMatch.index).match(/^\s*/)?.[0] ?? '';
  const providerIndent = `${baseIndent}  `;
  const inside = content.slice(openingBracketIndex + 1, closingBracketIndex).trim();

  if (!inside) {
    return content.slice(0, openingBracketIndex + 1) + PROVIDER_CALL + content.slice(closingBracketIndex);
  }

  return (
    content.slice(0, openingBracketIndex + 1) +
    `\n${providerIndent}${PROVIDER_CALL},\n${providerIndent}${inside}\n${baseIndent}` +
    content.slice(closingBracketIndex)
  );
}

/**
 * Insert provideAngularRenderScan() into an app.config.ts that uses
 * provideRouter / other Angular providers.
 *
 * Handles patterns like:
 *   providers: [provideRouter(routes), provideHttpClient()]
 *   providers: [
 *     provideRouter(routes),
 *   ]
 */
function patchAppConfig(content: string): string | null {
  // Add import after the last existing import
  let patched = content;

  if (!patched.includes(IMPORT_STATEMENT)) {
    // Find a good insertion point: after the last import line
    const lastImportIdx = patched.lastIndexOf('\nimport ');
    if (lastImportIdx === -1) return null;
    const endOfLastImport = patched.indexOf('\n', lastImportIdx + 1);
    patched =
      patched.slice(0, endOfLastImport + 1) +
      IMPORT_STATEMENT + '\n' +
      patched.slice(endOfLastImport + 1);
  }

  // Insert into providers array
  // Handles both single-line and multi-line providers arrays
  const providersMatch = patched.match(/providers:\s*\[/);
  if (!providersMatch) return null;

  return insertProviderIntoProvidersArray(patched, providersMatch);
}

/**
 * Patch bootstrapApplication() call in main.ts by injecting the provider.
 */
function patchMainTs(content: string): string | null {
  let patched = content;

  if (!patched.includes(IMPORT_STATEMENT)) {
    const lastImportIdx = patched.lastIndexOf('\nimport ');
    if (lastImportIdx === -1) return null;
    const endOfLastImport = patched.indexOf('\n', lastImportIdx + 1);
    patched =
      patched.slice(0, endOfLastImport + 1) +
      IMPORT_STATEMENT + '\n' +
      patched.slice(endOfLastImport + 1);
  }

  // Find the providers: [...] inside bootstrapApplication
  const bootstrapMatch = patched.match(/bootstrapApplication\s*\(/);
  if (!bootstrapMatch || bootstrapMatch.index === undefined) return null;

  const providersMatch = patched.match(/providers:\s*\[/);
  if (providersMatch && providersMatch.index !== undefined) {
    return insertProviderIntoProvidersArray(patched, providersMatch);
  }

  // No providers array yet — add one in the config object
  // Pattern: bootstrapApplication(AppComponent, {  OR  bootstrapApplication(AppComponent)
  const configObjMatch = patched.match(/bootstrapApplication\s*\(\s*\w+\s*,\s*\{/);
  if (configObjMatch && configObjMatch.index !== undefined) {
    const insertIdx = configObjMatch.index + configObjMatch[0].length;
    patched =
      patched.slice(0, insertIdx) +
      `\n  providers: [\n    ${PROVIDER_CALL}\n  ],` +
      patched.slice(insertIdx);
    return patched;
  }

  // bootstrapApplication(AppComponent) with no config object
  const simpleBootstrap = patched.match(/bootstrapApplication\s*\(\s*(\w+)\s*\)/);
  if (simpleBootstrap && simpleBootstrap.index !== undefined) {
    const end = simpleBootstrap.index + simpleBootstrap[0].length - 1; // before closing )
    patched =
      patched.slice(0, end) +
      `, {\n  providers: [\n    ${PROVIDER_CALL}\n  ]\n}` +
      patched.slice(end);
    return patched;
  }

  return null;
}

/**
 * Add the CDN script tag to index.html as a fallback.
 */
function patchIndexHtml(content: string): string | null {
  if (content.includes('angular-render-scan')) return null;

  const scriptTag = `  <!-- angular-render-scan: remove this script before production builds -->\n  <script src="https://unpkg.com/angular-render-scan/dist/auto.global.js"></script>`;

  // Insert before </body>
  const bodyClose = content.lastIndexOf('</body>');
  if (bodyClose === -1) return null;

  return content.slice(0, bodyClose) + scriptTag + '\n' + content.slice(bodyClose);
}

// ─── Package installation check ───────────────────────────────────────────────

function isPackageInstalled(cwd: string): boolean {
  const pkgPath = path.join(cwd, 'node_modules', 'angular-render-scan');
  return fs.existsSync(pkgPath);
}

function getPackageManager(cwd: string): 'npm' | 'yarn' | 'pnpm' | 'bun' {
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function installCommand(pm: ReturnType<typeof getPackageManager>): string {
  switch (pm) {
    case 'bun': return 'bun add -D angular-render-scan';
    case 'pnpm': return 'pnpm add -D angular-render-scan';
    case 'yarn': return 'yarn add -D angular-render-scan';
    default: return 'npm install -D angular-render-scan';
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function runInit(args: string[]): Promise<void> {
  const force = args.includes('--force') || args.includes('-f');
  const dryRun = args.includes('--dry-run');
  const scriptTagOnly = args.includes('--script-tag');

  log('');
  log(`${c.bold}${c.blue}  angular-render-scan${c.reset}${c.bold} init${c.reset}`);
  log(`${c.gray}  Zero-friction Angular performance profiler setup${c.reset}`);
  log('');

  const TOTAL = 4;

  // ── Step 1: Find Angular/Nx workspace config ───────────────────────────────
  step(1, TOTAL, 'Locating Angular workspace…');
  const workspaceConfigPath = findWorkspaceConfig();
  if (!workspaceConfigPath) {
    err('Could not find angular.json, workspace.json, nx.json, or project.json. Are you inside an Angular project?');
    process.exit(1);
  }
  ok(`Found ${path.basename(workspaceConfigPath)} at ${c.gray}${path.relative(process.cwd(), workspaceConfigPath)}${c.reset}`);
  const projectRoot = path.dirname(workspaceConfigPath);

  // ── Step 2: Check/install package ─────────────────────────────────────────
  step(2, TOTAL, 'Checking package installation…');
  if (isPackageInstalled(projectRoot)) {
    ok('angular-render-scan is already installed');
  } else {
    const pm = getPackageManager(projectRoot);
    const cmd = installCommand(pm);
    warn(`angular-render-scan is not installed. Run:\n\n    ${c.cyan}${cmd}${c.reset}\n`);
    info('After installing, run this command again to complete setup.');
    process.exit(0);
  }

  // ── Step 3: Locate source files ────────────────────────────────────────────
  step(3, TOTAL, 'Locating Angular entry files…');
  const mainTsPath = findMainTs(workspaceConfigPath);
  if (!mainTsPath) {
    err('Could not locate main.ts. Please patch manually (see docs).');
    process.exit(1);
  }
  ok(`Found main.ts at ${c.gray}${path.relative(projectRoot, mainTsPath)}${c.reset}`);

  const appConfigPath = findAppConfig(mainTsPath);
  if (appConfigPath) {
    ok(`Found app.config.ts at ${c.gray}${path.relative(projectRoot, appConfigPath)}${c.reset}`);
  } else {
    info('app.config.ts not found — will patch main.ts directly');
  }

  // ── Step 4: Patch files ────────────────────────────────────────────────────
  step(4, TOTAL, 'Patching bootstrap configuration…');

  if (scriptTagOnly) {
    // Script-tag mode: patch index.html
    const indexHtmlPath = findIndexHtml(workspaceConfigPath);
    if (!indexHtmlPath) {
      err('Could not locate index.html. Please add the script tag manually.');
      process.exit(1);
    }
    const indexContent = readFile(indexHtmlPath);
    if (alreadyPatched(indexContent)) {
      ok(`${c.gray}${path.relative(projectRoot, indexHtmlPath)}${c.reset} already contains angular-render-scan`);
    } else {
      const patched = patchIndexHtml(indexContent);
      if (!patched) {
        err('Could not patch index.html. Please add the script tag manually.');
        process.exit(1);
      }
      if (!dryRun) writeFile(indexHtmlPath, patched);
      ok(`Patched ${c.gray}${path.relative(projectRoot, indexHtmlPath)}${c.reset} with CDN script tag`);
    }
  } else {
    // Provider mode: patch app.config.ts or main.ts
    const targetPath = appConfigPath ?? mainTsPath;
    const targetContent = readFile(targetPath);
    const targetRelative = path.relative(projectRoot, targetPath);

    if (!force && alreadyPatched(targetContent)) {
      ok(`${c.gray}${targetRelative}${c.reset} already contains angular-render-scan — skipping (use --force to re-patch)`);
    } else {
      const patcher = appConfigPath ? patchAppConfig : patchMainTs;
      const patched = patcher(targetContent);

      if (!patched) {
        warn(`Could not auto-patch ${c.gray}${targetRelative}${c.reset}. Please add manually:`);
        log('');
        log(`  ${c.cyan}${IMPORT_STATEMENT}${c.reset}`);
        log('');
        log(`  // Add to providers array in bootstrapApplication() or ApplicationConfig:`);
        log(`  ${c.cyan}${PROVIDER_CALL}${c.reset}`);
        log('');
      } else {
        if (!dryRun) writeFile(targetPath, patched);
        ok(`Patched ${c.gray}${targetRelative}${c.reset}`);
        if (dryRun) {
          log('');
          log(`${c.gray}--- dry run output ---${c.reset}`);
          log(patched);
          log(`${c.gray}--- end dry run ---${c.reset}`);
        }
      }
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  log('');
  log(`${c.bold}${c.green}  Setup complete!${c.reset}`);
  log('');
  log(`  Start your app in development mode and interact with the UI:`);
  log(`  ${c.gray}ng serve${c.reset}`);
  log('');
  log(`  You should see component render outlines on screen.`);
  log(`  The toolbar appears in the bottom-right corner.`);
  log('');
  log(`  ${c.dim}Docs: https://github.com/edisonaugusthy/angular-render-scan${c.reset}`);
  log('');
}

export async function run(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (!command || command === 'init') {
    await runInit(rest);
    return;
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    log('');
    log(`${c.bold}Usage:${c.reset} npx angular-render-scan-cli [command] [options]`);
    log('');
    log(`${c.bold}Commands:${c.reset}`);
    log('  init              Auto-patch your Angular project (default)');
    log('');
    log(`${c.bold}Options for init:${c.reset}`);
    log('  --force           Patch even if angular-render-scan is already present');
    log('  --dry-run         Show what would be patched without writing files');
    log('  --script-tag      Use CDN script tag in index.html instead of provider');
    log('');
    log(`${c.bold}Examples:${c.reset}`);
    log('  npx angular-render-scan-cli init');
    log('  npx angular-render-scan-cli init --dry-run');
    log('  npx angular-render-scan-cli init --script-tag');
    log('');
    return;
  }

  if (command === '--version' || command === '-v') {
    const pkgPath = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    log(pkg.version);
    return;
  }

  err(`Unknown command: ${command}. Run with --help for usage.`);
  process.exit(1);
}
