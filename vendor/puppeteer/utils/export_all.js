const {readdirSync, writeFileSync} = require('fs');
const {join, basename} = require('path');

const EXCLUDE_FILES = ['puppeteer-core.ts'];

let typesTs = '// AUTOGENERATED - Use `utils/export_all.js` to regenerate.\n';

typesTs += `\n`;
for (const file of readdirSync(join(__dirname, `../src`)).filter(filename => {
  return (
    filename.endsWith('ts') &&
    !filename.startsWith('types') &&
    !EXCLUDE_FILES.includes(filename)
  );
})) {
  typesTs += `export * from './${basename(file, '.ts')}.js';\n`;
}

for (const folder of ['common', 'node', 'generated']) {
  typesTs += `\n// Exports from \`${folder}\`\n`;
  for (const file of readdirSync(join(__dirname, `../src/${folder}`)).filter(
    filename => {
      return filename.endsWith('ts') && !EXCLUDE_FILES.includes(filename);
    }
  )) {
    typesTs += `export * from './${folder}/${basename(file, '.ts')}.js';\n`;
  }
}

writeFileSync(join(__dirname, '../src/types.ts'), typesTs);
