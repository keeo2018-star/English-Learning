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

test('AI casing corrections require a common-word classification and a matching lemma', () => {
  const candidate = (expression, lemma, casing, expressionType = 'word') =>
    entry(expression, '中文解释', '', '', { lemma, casing, expressionType });
  const result = parseTranslation({ recommendedCandidateId: 'absent', candidates: [
    candidate('CHRYSANTHEMUM', 'chrysanthemum', 'common'),
    candidate('NASA', 'NASA', 'acronym'),
    candidate('New York', 'New York', 'proper', 'phrase'),
    candidate('iPhone', 'iPhone', 'brand'),
    { expression: 'invalid', meaning: null },
  ] }, input);
  assert.equal(result.recommendedCandidateId, 'chrysanthemum');
  assert.deepEqual(result.candidates.map(item => item.english), ['chrysanthemum', 'NASA', 'New York', 'iPhone']);
  assert.throws(() => parseTranslation({ candidates: [{ expression: 'test', meaning: null }] }, input));
});

test('structured Gemini requests carry only the intended translation input for each scenario', async () => {
  const aiStub = 'data:text/javascript,' + encodeURIComponent("export const configuredAiModel=()=> 'fixture-model';export const aiConfigured=()=>true;");
  const parser = await compile('../../src/lib/translation-candidates.ts', {
    './collections': collections, './highlight': highlight,
  });
  const { generateTranslation } = await import(await compile('../../src/lib/translation-provider.ts', {
    './ai-provider': aiStub, './translation-candidates': parser,
  }));
  const cases = [
    ['打包', 'Ordering takeaway food', 'to go'],
    ['打包', 'Packing luggage', 'pack'],
    ['打包', 'Compressing files', 'archive'],
    ['拍子', 'Playing badminton', 'racket'],
    ['拍子', 'Describing musical rhythm', 'beat'],
  ];
  for (const [query, context, expression] of cases) {
    const inputWithContext = { ...input, query, context, level: 'B1' };
    const entryResult = await generateTranslation(inputWithContext, async (_url, init) => {
      const request = JSON.parse(init.body);
      assert.deepEqual(JSON.parse(request.contents[0].parts[0].text), inputWithContext);
      assert.equal(request.generationConfig.responseSchema.properties.candidates.maxItems, 5);
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        ambiguous: false, candidates: [entry(expression, '中文释义')],
      }) }] } }] });
    });
    assert.equal(entryResult.candidates[0].english, expression);
  }
});
