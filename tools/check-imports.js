import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceRoot = path.join(root, 'apps', 'resident-pwa', 'src');
const residentRoot = path.join(root, 'apps', 'resident-pwa');
const indexHtml = fs.readFileSync(path.join(residentRoot, 'index.html'), 'utf8');
const importMapMatch = indexHtml.match(/<script type="importmap" id="cn-importmap">([\s\S]*?)<\/script>/);
const runtimeImportMap = importMapMatch ? JSON.parse(importMapMatch[1]).imports || {} : {};
const fileInfo = new Map();
const errors = [];
const visited = new Set();

function relativePath(filePath) {
  return path.relative(root, filePath);
}

function addError(filePath, line, message) {
  errors.push(`${relativePath(filePath)}:${line}: ${message}`);
}

function lineAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

function listJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listJavaScriptFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

function resolveImport(importer, specifier) {
  if (specifier.startsWith('@civicneuro/')) {
    const packageName = specifier.slice('@civicneuro/'.length);
    if (!packageName || packageName.includes('/')) return null;
    const entry = path.join(root, 'packages', packageName, 'src', 'index.js');
    return fs.existsSync(entry) ? entry : null;
  }

  if (specifier.startsWith('.')) {
    const target = path.resolve(path.dirname(importer), specifier);
    return fs.existsSync(target) && fs.statSync(target).isFile() ? target : null;
  }

  return null;
}

function parseBindings(statement) {
  const names = [];
  const named = statement.match(/\{([^}]+)\}/);
  if (named) {
    for (const binding of named[1].split(',')) {
      const localName = binding.trim().split(/\s+as\s+/)[0];
      if (localName) names.push(localName);
    }
  }

  const defaultPart = statement.split('{')[0].trim();
  const defaultBinding = defaultPart.split(',')[0].trim();
  if (defaultBinding && !defaultBinding.startsWith('*') && defaultBinding !== 'type') {
    names.push('default');
  }
  return [...new Set(names)];
}

function parseExportList(source) {
  const lists = [];
  const pattern = /\bexport\s*\{([^}]+)\}(?:\s*from\s*(['"])([^'"]+)\2)?\s*;?/g;
  for (const match of source.matchAll(pattern)) {
    const bindings = match[1].split(',').map((binding) => {
      const [local, exported] = binding.trim().split(/\s+as\s+/);
      return { local, exported: exported || local };
    }).filter((binding) => binding.local);
    lists.push({
      bindings,
      specifier: match[3] || null,
      line: lineAt(source, match.index)
    });
  }
  return lists;
}

function parseFile(filePath) {
  if (fileInfo.has(filePath)) return fileInfo.get(filePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const imports = [];
  const staticPattern = /(?:^|\n)\s*(import|export)\s+([\w$*{},\s]+?)\s+from\s*(['"])([^'"]+)\3\s*;?/g;

  for (const match of source.matchAll(staticPattern)) {
    const kind = match[1];
    const statement = match[2].trim();
    const specifier = match[4];
    const reExport = kind === 'export';
    const isStarExport = reExport && /^\*\s+from\b/.test(statement);
    imports.push({
      specifier,
      names: reExport
        ? (isStarExport ? [] : parseBindings(statement.replace(/^export\s*/, '')))
        : parseBindings(statement),
      reExport,
      line: lineAt(source, match.index)
    });
  }

  const sideEffectPattern = /(?:^|\n)\s*import\s*(['"])([^'"]+)\1\s*;?/g;
  for (const match of source.matchAll(sideEffectPattern)) {
    imports.push({
      specifier: match[2],
      names: [],
      reExport: false,
      line: lineAt(source, match.index)
    });
  }

  const dynamicPattern = /\bimport\s*\(([^)]*)\)/g;
  for (const match of source.matchAll(dynamicPattern)) {
    const argument = match[1].trim();
    const literal = argument.match(/^(['"])([^'"]+)\1$/);
    if (literal) {
      const destructured = source.slice(Math.max(0, match.index - 120), match.index)
        .match(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*$/);
      imports.push({
        specifier: literal[2],
        names: destructured ? parseBindings(`{${destructured[1]}}`) : [],
        reExport: false,
        line: lineAt(source, match.index)
      });
    } else if (/^`[^`]*\$\{/.test(argument) && filePath === path.join(
      root, 'apps', 'resident-pwa', 'src', 'components', 'app-shell', 'app-shell.js'
    )) {
      imports.push({
        specifier: '__resident_route_pages__',
        names: [],
        reExport: false,
        line: lineAt(source, match.index)
      });
    } else {
      addError(filePath, lineAt(source, match.index), `unsupported non-literal dynamic import: ${argument}`);
    }
  }

  const declarations = new Set();
  for (const match of source.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([\w$]+)/g)) {
    declarations.add(match[1]);
  }
  if (/\bexport\s+default\b/.test(source)) declarations.add('default');

  const stars = [...source.matchAll(/\bexport\s+\*\s+from\s*(['"])([^'"]+)\1/g)]
    .map((match) => ({ specifier: match[2], line: lineAt(source, match.index) }));

  const result = { imports, declarations, exportLists: parseExportList(source), stars };
  fileInfo.set(filePath, result);
  return result;
}

function hasExport(filePath, name, seen = new Set()) {
  const key = `${filePath}#${name}`;
  if (seen.has(key)) return false;
  seen.add(key);

  const info = parseFile(filePath);
  if (info.declarations.has(name)) return true;

  for (const list of info.exportLists) {
    const binding = list.bindings.find((candidate) => candidate.exported === name);
    if (!binding) continue;
    if (!list.specifier) return true;
    const target = resolveImport(filePath, list.specifier);
    if (target && hasExport(target, binding.local, seen)) return true;
  }

  for (const star of info.stars) {
    const target = resolveImport(filePath, star.specifier);
    if (target && hasExport(target, name, seen)) return true;
  }
  return false;
}

function routePageFiles() {
  const routerPath = path.join(sourceRoot, 'router.js');
  const source = fs.readFileSync(routerPath, 'utf8');
  const routesBlock = source.match(/const\s+routes\s*=\s*\{([\s\S]*?)\n\};/);
  if (!routesBlock) {
    addError(routerPath, 1, 'could not read the route table used for dynamic page imports');
    return [];
  }

  const routes = [...routesBlock[1].matchAll(/^\s*['"]([^'"]+)['"]\s*:/gm)]
    .map((match) => match[1]);
  return routes.map((route) => ({
    path: path.join(sourceRoot, 'pages', route, `${route}.js`),
    route
  }));
}

function visit(filePath) {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  for (const entry of parseFile(filePath).imports) {
    if (entry.specifier === '__resident_route_pages__') {
      for (const page of routePageFiles()) {
        if (!fs.existsSync(page.path)) {
          addError(filePath, entry.line, `route "${page.route}" has no page module at ${relativePath(page.path)}`);
        } else {
          visit(page.path);
        }
      }
      continue;
    }

    const target = resolveImport(filePath, entry.specifier);
    if (!target) {
      const runtimeTarget = runtimeImportMap[entry.specifier];
      if (typeof runtimeTarget === 'string'
          && fs.existsSync(path.resolve(residentRoot, runtimeTarget))
          && fs.statSync(path.resolve(residentRoot, runtimeTarget)).isFile()) {
        continue;
      }
      addError(filePath, entry.line, `cannot resolve "${entry.specifier}" to a real file`);
      continue;
    }

    for (const name of entry.names) {
      if (!hasExport(target, name)) {
        addError(filePath, entry.line, `"${entry.specifier}" does not export "${name}"`);
      }
    }
    visit(target);
  }
}

if (!fs.existsSync(sourceRoot)) {
  console.error(`❌ Resident source directory not found: ${relativePath(sourceRoot)}`);
  process.exit(1);
}

for (const filePath of listJavaScriptFiles(sourceRoot)) visit(filePath);

if (errors.length) {
  console.error('❌ Import graph check failed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`✅ PASS: ${visited.size} JavaScript modules and their imports resolve with valid named exports.`);
