import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightParts } from '../../src/lib/highlight.ts';
const marked = (text, word) => highlightParts(text, word).filter(part => part.highlighted).map(part => part.text);
test('exact, case insensitive whole words only', () => {
  assert.deepEqual(marked('Satiate, satiate! Insatiate satiated xsatiate satiate2 satiate_name.', 'satiate'), ['Satiate', 'satiate']);
});
test('phrases are highlighted completely while preserving original whitespace', () => {
  const text = 'I was CAUGHT  off guard; caught off guards is different.';
  const parts = highlightParts(text, 'caught off guard');
  assert.deepEqual(parts.filter(part => part.highlighted).map(part => part.text), ['CAUGHT  off guard']);
  assert.equal(parts.map(part => part.text).join(''), text);
});
test('punctuation is escaped and Unicode boundaries do not match unrelated text', () => {
  assert.deepEqual(marked('C++ works. XC++ does not.', 'C++'), ['C++']);
  assert.deepEqual(marked('café décafé caféine café', 'café'), ['café', 'café']);
  assert.deepEqual(marked('<script>satiate</script>', 'satiate'), ['satiate']);
  assert.deepEqual(marked('Anything', ''), []);
});
