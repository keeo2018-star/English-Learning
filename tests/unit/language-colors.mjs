import assert from 'node:assert/strict';
import test from 'node:test';
import { languageIdentity } from '../../src/lib/language-colors.ts';

test('language palette uses stable canonical codes and a neutral fallback', () => {
  for (const [input, canonical, color] of [
    ['English', 'en', '#C6B4F7'], ['FR-fr', 'fr', '#B5D4F4'], ['es_MX', 'es', '#F6C2A5'],
    ['Simplified Chinese', 'zh-CN', '#F0DF9D'], ['zh-Hans', 'zh-CN', '#F0DF9D'],
  ]) {
    assert.equal(languageIdentity(input).color, color);
    assert.deepEqual(languageIdentity(input), languageIdentity(canonical));
  }
  assert.deepEqual(languageIdentity('other'), { color: '#E9E9E4', code: '—' });
});
