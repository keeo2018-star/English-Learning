import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, imports = {}) {
  const file = await readFile(new URL(path, import.meta.url), 'utf8');
  let output = ts.transpileModule(file, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [name, href] of Object.entries(imports)) {
    output = output.replaceAll("'" + name + "'", JSON.stringify(href));
  }
  return 'data:text/javascript;base64,' + Buffer.from(output).toString('base64');
}

const highlight = await compile('../../src/lib/highlight.ts');
const collections = await compile('../../src/lib/collections.ts');
const contract = await compile('../../src/lib/bilingual-contract.ts');
const { memoryVariants } = await import(contract);
const { parseTranslation } = await import(await compile('../../src/lib/translation-candidates.ts', {
  './collections': collections, './highlight': highlight,
}));
const { highlightParts } = await import(highlight);
const input = { query: '荷花', source: 'zh-CN', target: 'en', explanation: 'zh-CN', context: '', level: 'A1' };
const entry = (expression, meaning, example = '', highlight = '', extra = {}) => ({
  expression, meaning, example, highlight, ...extra,
});

test('ranked candidates retain linguistic casing and validated inflections', () => {
  const result = parseTranslation({ ambiguous: false, candidates: [
    entry('lotus', '荷花', 'Pink lotuses bloom every summer.', 'lotuses', { exampleTranslation: '粉色荷花每年夏天盛开。' }),
    entry('lotus flower', '莲花'),
    entry('lotus', '重复'),
    entry('sacred lotus', '莲', 'A pond, a bridge, rural scenery.', 'lotus'),
  ] }, input);
  assert.deepEqual(result.candidates.map(({ id, english }) => [id, english]), [
    ['lotus', 'lotus'], ['lotus%20flower', 'lotus flower'], ['sacred%20lotus', 'sacred lotus'],
  ]);
  assert.equal(result.candidates[0].highlight, 'lotuses');
  assert.equal(result.candidates[2].example, '');
  assert.equal(parseTranslation(result, input).candidates[0].english, 'lotus');
  assert.equal(highlightParts('flotus lotus Lotuses', 'lotus', { exact: true }).filter(x => x.highlighted).length, 1);
});

test('context can resolve an ambiguous sense and input forms or proper names survive', () => {
  const cases = [
    ['拍子', ['racket', 'beat', 'paddle']],
    ['打包', ['to go']],
    ['纽约', ['New York']],
    ['我不知道', ['I don’t know']],
    ['to take care of', ['to take care of']],
    ['iPhone', ['iPhone']],
  ];
  for (const [query, expressions] of cases) {
    const result = parseTranslation({ ambiguous: query === '拍子',
      candidates: expressions.map(expression => entry(expression, '中文释义')) },
    { ...input, query, context: query === '打包' ? 'Ordering food in a restaurant' : '' });
    assert.deepEqual(result.candidates.map(x => x.english), expressions);
    assert.equal(result.ambiguous, query === '拍子');
  }
  const result = parseTranslation({ candidates: [entry('run', '跑', '', '', { lemma: 'run' })] },
    { ...input, query: 'running', source: 'en' });
  assert.equal(result.candidates[0].english, 'running');
  assert.equal(result.candidates[0].lemma, 'run');
});

test('only matching translation-memory evidence changes the fallback spelling', () => {
  assert.deepEqual(memoryVariants('荷花', 'Lotus Flower', [
    { segment: '荷花', match: 1, translation: 'lotus flower' },
    { segment: '莲', match: 0.9, translation: 'sacred lotus' },
  ]), ['lotus flower']);
  assert.deepEqual(memoryVariants('荷花', 'Lotus Flower', [
    { segment: '荷花', match: 0.99, translation: 'Lotus Flower' },
    { segment: '荷花', match: 1, translation: 'lotus' },
    { segment: '荷花', match: 0.99, translation: 'Nelumbo nucifera' },
  ]), ['lotus', 'Nelumbo nucifera']);
  assert.deepEqual(memoryVariants('纽约', 'New York', []), ['New York']);
  assert.deepEqual(memoryVariants('手机', 'iPhone', []), ['iPhone']);
});
