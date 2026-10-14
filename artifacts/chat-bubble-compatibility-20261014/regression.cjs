const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const sourceDir = path.join(root, 'src/线上聊天气泡_通用版');
const source = fs.readFileSync(path.join(sourceDir, 'index.js'), 'utf8');
let variables = { unrelated: { retained: true } };
global.getVariables = () => structuredClone(variables);
global.updateVariablesWith = updater => { variables = updater(structuredClone(variables)); return variables; };

function compile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}
function load(file) {
  const exports = {};
  new Function('require', 'exports', compile(path.join(sourceDir, file)))(require, exports);
  return exports;
}
const format = load('output-format.ts');
const appearance = load('appearance-config.ts');
const custom = `${format.DEFAULT_OUTPUT_RULES}\n\n只在实际使用手机时出现线上聊天，不要每次回复都插入。`;
format.saveOutputRules('角色书 A', custom);
assert.equal(format.loadOutputRules('角色书 A').rules, custom);
assert.equal(format.loadOutputRules('角色书 B').rules, null);
assert.deepEqual(variables.unrelated, { retained: true });
assert(format.buildOutputFormat(custom).includes(format.FIXED_OUTPUT_STRUCTURE));
assert(format.buildOutputFormat(custom).includes(custom));
assert.equal(format.importOutputRules({ config: { theme: 'dark' } }, custom), custom);
assert.equal(format.importOutputRules({ output_format: { rules: custom } }, ''), custom);
assert.equal(format.importOutputRules({ output_format: { rules: null } }, custom), format.DEFAULT_OUTPUT_RULES);
assert.throws(() => format.importOutputRules({ output_format: { rules: {} } }, custom));
assert.equal(format.normalizeOutputRules(format.DEFAULT_OUTPUT_RULES.replace(/\n/g, '\r\n')), null);
const config = appearance.normalizeAppearanceConfig({ protect_appearance: false, bubble_padding_x: 21, char_avatar: 'avatar.png' });
const text = appearance.serializeAppearanceConfigText(config, 'v15.8');
assert.equal(appearance.parseAppearanceConfigText(text).protect_appearance, false);
assert.equal(appearance.normalizeAppearanceConfig({}).protect_appearance, true);
assert.equal(appearance.parseAppearanceConfigText(text).bubble_padding_x, 21);

function namedFunction(text, name) {
  const file = ts.createSourceFile('runtime.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let found;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(file);
    else ts.forEachChild(node, visit);
  }
  visit(file);
  assert(found, `Missing function ${name}`);
  return found;
}

async function checkResetIsolation() {
  const book = '角色书 A';
  const entries = new Map([
    ['外观', text], ['格式', format.buildOutputFormat(custom)],
  ]);
  const writes = [];
  const context = {
    console, Date, Error, Set,
    STK: { busy: false, sources: {} },
    SPEC: { conf: { title: '外观' }, format: { title: '格式' } },
    CONF_VERSION: 'v15.8', CONFIG_LIB_DEFAULT: '默认外观', DEFAULT_OUTPUT_RULES: format.DEFAULT_OUTPUT_RULES,
    hasActiveChat: () => true, resolveBookName: async () => book, worldbookExists: async () => true,
    findEntry: async (name, title) => entries.has(title) ? { uid: 1, entry: { content: entries.get(title) } } : null,
    scanInjectionGuardEntries: async () => ({ hits: {}, unreadableBooks: [] }),
    resolveInjectionHomeBook: async () => book,
    locateAppearanceConfig: async () => ({ primaryBook: book, book, content: entries.get('外观') }),
    upsertEntry: async (name, spec, content) => { writes.push(spec.title); entries.set(spec.title, content); return 'updated'; },
    buildOutputFormat: format.buildOutputFormat, loadOutputRules: format.loadOutputRules, saveOutputRules: format.saveOutputRules,
    serializeAppearanceConfigText: appearance.serializeAppearanceConfigText,
    parseAppearanceConfigText: appearance.parseAppearanceConfigText,
    resetConfigurables: () => {}, applyConfigKV: () => {}, parseKV: () => [],
    refreshVisuals: () => {}, processAll: () => {}, toastMsg: () => {},
  };
  vm.createContext(context);
  for (const name of ['locateOutputFormatBook', 'writeOutputFormat', 'resetOutputFormat', 'saveAppearancePanelConfig', 'loadAppearancePanelConfig']) {
    vm.runInContext(namedFunction(source, name), context);
  }
  await context.resetOutputFormat();
  assert.deepEqual(writes, ['格式']);
  assert.equal(entries.get('外观'), text);
  assert.equal(entries.get('格式'), format.buildOutputFormat());
  assert.equal(format.loadOutputRules(book).rules, null);
  await context.saveAppearancePanelConfig(config, custom);
  assert.equal(entries.get('格式'), format.buildOutputFormat(custom));
  assert.equal((await context.loadAppearancePanelConfig()).outputRules, custom);
  Object.assign(context, {
    CONFIG: { AUTO_INJECT_WI: true, INJECT_CONFIG_WI: true, INJECT_STICKER_WI: false, STICKER_SYNC_NAMES: false, WI_FORCE_UPDATE: true, STICKER_MAP: {} },
    bookState: async () => 'yes', readEntryContent: async (name, title) => entries.get(title),
    verifyEntryToggles: async () => {}, resolveChatBookManual: async () => book,
    wipeRuntimeConfig: () => {}, parseStickerLib: () => ({}), stickerListText: () => '',
    resetArmedAt: 0,
  });
  vm.runInContext(namedFunction(source, 'upsertRoutedEntry'), context);
  vm.runInContext(namedFunction(source, 'bootstrapWorldInfo'), context);
  await context.bootstrapWorldInfo(true);
  assert.equal(context.STK.loaded, true);
  assert.equal(entries.get('格式'), format.buildOutputFormat(custom));
  // 执行真实按钮回调，覆盖其最终调用的 bootstrapWorldInfo(true)。
  const file = ts.createSourceFile('runtime.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let resetHandler;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'eventOn' && node.arguments[0]?.getText(file) === "getButtonEvent('重置外观配置')") resetHandler = node.arguments[1].getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert(resetHandler);
  const callback = vm.runInContext(`(${resetHandler})`, context);
  await callback();
  await callback();
  assert.equal(entries.get('外观'), '默认外观');
  assert.equal(entries.get('格式'), format.buildOutputFormat(custom));
  assert.equal(format.loadOutputRules(book).rules, custom);
}

function makeCss(text) {
  const tokens = '--fhb-ink:#eee;--fhb-bo-bg:#222;--fhb-bo-tx:#eee;--fhb-bo-br:#777;--fhb-accent:#389;--fhb-accent2:#b85;--fhb-gold:#b85;--fhb-red:#911;--fhb-hairline:#777;--fhb-shadow:0 8px 22px #000;--fhb-card-bg:#222;--fhb-card-head:#333;--fhb-card-shadow:0 14px 34px #000;--fhb-sans:Arial;--fhb-serif:Georgia;--fhb-meta:#aaa;--fhb-accent-soft:#345;';
  return new Function('tokenCSS', `${namedFunction(text, 'buildCSS')}\nreturn buildCSS({});`)(() => tokens);
}

async function main() {
  await checkResetIsolation();
  const typedFiles = ['output-format.ts', 'style-protection.ts', 'appearance-config.ts'].map(file => path.join(sourceDir, file));
  const program = ts.createProgram(typedFiles.concat(path.join(root, '@types/function/variables.d.ts')), {
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true, noEmit: true, skipLibCheck: true, noUnusedLocals: true, noUnusedParameters: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  const sfc = require(require.resolve('@vue/compiler-sfc', { paths: [require.resolve('vue')] }));
  const panelSource = fs.readFileSync(path.join(sourceDir, 'AppearancePanel.vue'), 'utf8');
  const parsed = sfc.parse(panelSource, { filename: 'AppearancePanel.vue' });
  assert.deepEqual(parsed.errors, []);
  const panel = sfc.compileScript(parsed.descriptor, { id: 'fhbc-check', inlineTemplate: true });
  const panelJs = ts.transpileModule(panel.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const style = sfc.compileStyle({ source: parsed.descriptor.styles[0].content, id: 'fhbc-check' });
  assert.deepEqual(style.errors, []);
  const payload = {
    css: { generic: makeCss(source), flynn: makeCss(fs.readFileSync(path.join(root, 'src/线上聊天气泡_芙林专属版/index.js'), 'utf8')) },
    protectionJs: compile(path.join(sourceDir, 'style-protection.ts')),
    panelJs, panelCss: style.code,
    appearanceJs: compile(path.join(sourceDir, 'appearance-config.ts')),
    defaults: format.DEFAULT_OUTPUT_RULES, fixed: format.FIXED_OUTPUT_STRUCTURE,
  };
  fs.writeFileSync(path.join(__dirname, 'browser-fixture.json'), JSON.stringify(payload));
  console.log('PASS: independent rules storage, fixed structure, format-only reset, appearance reset isolation, imports, protection setting roundtrip, TypeScript and Vue compilation.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
