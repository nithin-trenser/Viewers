const pluginConfig = require('../pluginConfig.json');
const fs = require('fs');
const os = require('os');

const autogenerationDisclaimer = `
// THIS FILE IS AUTOGENERATED AS PART OF THE EXTENSION AND MODE PLUGIN PROCESS.
// IT SHOULD NOT BE MODIFIED MANUALLY \n`;

const extractName = val => (typeof val === 'string' ? val : val.packageName);

const publicURL = process.env.PUBLIC_URL || '/';

function isAbsolutePath(path) {
  return path.startsWith('http') || path.startsWith('/');
}

function constructLines(input, categoryName) {
  let pluginCount = 0;

  const lines = {
    importLines: [],
    addToWindowLines: [],
  };

  if (!input) return lines;

  input.forEach(entry => {
    if (entry.default === false) return;

    const packageName = extractName(entry);

    lines.addToWindowLines.push(`${categoryName}.push("${packageName}");\n`);

    pluginCount++;
  });

  return lines;
}

function getFormattedImportBlock(importLines) {
  let content = '';
  // Imports
  importLines.forEach(importLine => {
    content += importLine;
  });

  return content;
}

function getFormattedWindowBlock(addToWindowLines) {
  let content =
    'const extensions = [];\n' +
    'const modes = [];\n' +
    '\n// Not required any longer\n' +
    'window.extensions = extensions;\n' +
    'window.modes = modes;\n\n';

  addToWindowLines.forEach(addToWindowLine => {
    content += addToWindowLine;
  });

  return content;
}

function getRuntimeLoadModesExtensions(modules) {
  const dynamicLoad = [];
  dynamicLoad.push(
    '\n\n// Add a dynamic runtime loader',
    'async function loadModule(module) {',
    "  if (typeof module !== 'string') return module;"
  );
  modules.forEach(module => {
    const packageName = extractName(module);
    if (!packageName) {
      return;
    }
    if (module.importPath) {
      dynamicLoad.push(
        `  if( module==="${packageName}") {`,
        `    const imported = await window.browserImportFunction('${isAbsolutePath(module.importPath) ? '' : publicURL}${module.importPath}');`,
        '    return ' +
          (module.globalName
            ? `window["${module.globalName}"];`
            : `imported["${module.importName || 'default'}"];`),
        '  }'
      );
      return;
    }
    dynamicLoad.push(
      `  if( module==="${packageName}") {`,
      `    const imported = await import("${packageName}");`,
      '    return imported.default;',
      '  }'
    );
  });
  // TODO - handle more cases for import than just default
  dynamicLoad.push(
    '  return (await window.browserImportFunction(module)).default;',
    '}\n',
    '// Import a list of items (modules or string names)',
    '// @return a Promise evaluating to a list of modules',
    'export default function importItems(modules) {',
    '  return Promise.all(modules.map(loadModule));',
    '}\n',
    'export { loadModule, modes, extensions, importItems };\n\n'
  );
  return dynamicLoad.join('\n');
}

const fromDirectory = (srcDir, path) => {
  if (!path) return;
  if (path[0] === '.') return srcDir + '/../../..' + path.substring(1);
  if (path[0] === '~') return os.homedir() + path.substring(1);
  return path;
};

const createCopyPluginToDistForLink = (srcDir, distDir, plugins, folderName) => {
  return plugins
    .map(plugin => {
      const fromDir = fromDirectory(srcDir, plugin.directory);
      const from = fromDir || `${srcDir}/../node_modules/${plugin.packageName}/${folderName}/`;
      const exists = fs.existsSync(from);
      return exists
        ? {
            from,
            to: distDir,
            toType: 'dir',
          }
        : undefined;
    })
    .filter(x => !!x);
};

const createCopyPluginToDistForBuild = (SRC_DIR, DIST_DIR, plugins, folderName) => {
  return plugins
    .map(plugin => {
      const from = `${SRC_DIR}/../../../node_modules/${plugin.packageName}/${folderName}/`;
      const exists = fs.existsSync(from);
      return exists
        ? {
            from,
            to: DIST_DIR,
            toType: 'dir',
          }
        : undefined;
    })
    .filter(x => !!x);
};

function writePluginImportsFile(SRC_DIR, DIST_DIR) {
  let pluginImportsJsContent = autogenerationDisclaimer;

  const extensionLines = constructLines(pluginConfig.extensions, 'extensions');
  const modeLines = constructLines(pluginConfig.modes, 'modes');

  pluginImportsJsContent += getFormattedImportBlock([
    ...extensionLines.importLines,
    ...modeLines.importLines,
  ]);
  pluginImportsJsContent += getFormattedWindowBlock([
    ...extensionLines.addToWindowLines,
    ...modeLines.addToWindowLines,
  ]);

  pluginImportsJsContent += getRuntimeLoadModesExtensions([
    ...pluginConfig.extensions,
    ...pluginConfig.modes,
    ...pluginConfig.public,
  ]);

  fs.writeFileSync(`${SRC_DIR}/pluginImports.js`, pluginImportsJsContent, { flag: 'w+' }, err => {
    if (err) {
      console.error(err);
      return;
    }
  });

  // Build packages using cli add-mode and add-extension
  // will get added to the root node_modules, but the linked packages
  // will be hosted at the viewer node_modules.

  const copyPluginPublicToDistBuild = createCopyPluginToDistForBuild(
    SRC_DIR,
    DIST_DIR,
    [...pluginConfig.modes, ...pluginConfig.extensions],
    'public'
  );

  const copyPluginPublicToDistLink = createCopyPluginToDistForLink(
    SRC_DIR,
    DIST_DIR,
    [...pluginConfig.modes, ...pluginConfig.extensions, ...pluginConfig.public],
    'public'
  );

  // Temporary way to copy chunks from the dist folder so that the become
  // available
  const copyPluginDistToDistBuild = createCopyPluginToDistForBuild(
    SRC_DIR,
    DIST_DIR,
    [...pluginConfig.modes, ...pluginConfig.extensions],
    'dist'
  );

  const copyPluginDistToDistLink = createCopyPluginToDistForLink(
    SRC_DIR,
    DIST_DIR,
    [...pluginConfig.modes, ...pluginConfig.extensions],
    'dist'
  );

  return [
    ...copyPluginPublicToDistBuild,
    ...copyPluginPublicToDistLink,
    ...copyPluginDistToDistBuild,
    ...copyPluginDistToDistLink,
  ];
}

module.exports = writePluginImportsFile;
