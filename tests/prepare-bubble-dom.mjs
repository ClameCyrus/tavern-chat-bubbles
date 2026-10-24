/* eslint-disable import-x/no-nodejs-modules -- 离线测试准备器，不会打包到酒馆。 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import * as ts from 'typescript';
import { format } from 'prettier';

const root = path.resolve(import.meta.dirname, '..');
const names = [
  'sanitizeForParse',
  'cleanSiblings',
  'isThreadNode',
  'isThMsg',
  'isEmptyJunkEl',
  'isSkippable',
  'peopleOf',
  'threadTitle',
  'refreshThreadCard',
  'bindThreadHead',
  'wrapThread',
  'groupThreads',
  'transformElement',
  'bindDelegation',
];

function extract(text, name, variable = false) {
  const file = ts.createSourceFile('runtime.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let result;
  function visit(node) {
    if (!variable && ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(file);
    if (variable && ts.isVariableDeclaration(node) && node.name.getText(file) === name) {
      result = `const ${name} = ${node.initializer.getText(file)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!result) throw new Error(`Missing ${name}`);
  return result;
}

function runtime(text) {
  return [
    extract(text, 'ENTRY_RE', true),
    extract(text, 'SHORT_TYPING_RE', true),
    ...names.map(n => extract(text, n)),
  ].join('\n');
}

const fixture = {
  variants: ['线上聊天气泡_通用版', '线上聊天气泡_芙林专属版'].map(name => {
    const file = `src/${name}/index.js`;
    const current = fs.readFileSync(path.join(root, file), 'utf8');
    const baseline = execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' });
    const inlineDom = name === '线上聊天气泡_芙林专属版' ? `${extract(current, 'createBubbleDomUpdate')}\n` : '';
    return { name, current: inlineDom + runtime(current), baseline: runtime(baseline) };
  }),
  standalone: fs.readFileSync(path.join(root, 'src/线上聊天气泡_芙林专属版/index.js'), 'utf8'),
};
new vm.Script(fixture.standalone, { filename: '芙林专属版-直接粘贴.js' });
if (fixture.standalone.includes('protect_appearance')) throw new Error('专属版仍包含外观配置中的主题保护开关');
const compile = file =>
  ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
const helper = compile('util/bubble-dom.ts');
const style = compile('src/线上聊天气泡_通用版/style-protection.ts');
const normalize = source => format(source, { parser: 'babel', singleQuote: true, printWidth: 120 });
for (const [name, canonical, variable] of [
  ['createBubbleDomUpdate', helper, false],
  ['protectBubbleStyles', style, false],
  ['splitCss', style, false],
  ['scopeSelector', style, false],
  ['INLINE_OR_ANIMATED', style, true],
]) {
  if (
    (await normalize(extract(fixture.standalone, name, variable))) !==
    (await normalize(extract(canonical, name, variable)))
  ) {
    throw new Error(`专属版内置实现与共享源文件不同步: ${name}`);
  }
}
const tests = compile('tests/bubble-dom.browser.ts');
const output = path.join(root, 'artifacts/chat-bubble-bbi-compatibility-20261024');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(
  path.join(output, 'browser-regression.js'),
  `async () => {
  const fixture = ${JSON.stringify(fixture)};
  const helper = {};
  new Function('exports', ${JSON.stringify(helper)})(helper);
  ${tests}
  return await runBubbleDomRegression(fixture, helper.createBubbleDomUpdate);
}`,
);
console.log(path.join(output, 'browser-regression.js'));
