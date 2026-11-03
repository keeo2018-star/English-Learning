import test from 'node:test';
import assert from 'node:assert/strict';
import { audioSource } from '../../src/lib/audio-source.ts';
test('accepts only the existing dictionary recording endpoint and bounded English queries', () => {
  const source = 'https://uapis.cn/api/v1/dictionary/audio?accent=uk&word=caught+off+guard';
  assert.equal(audioSource(source), source);
  for (const value of [undefined, '', 'https://example.com/audio', 'http://uapis.cn/api/v1/dictionary/audio?word=hello&accent=uk',
    'https://uapis.cn:444/api/v1/dictionary/audio?word=hello&accent=uk', 'https://user:pass@uapis.cn/api/v1/dictionary/audio?word=hello&accent=uk',
    'https://uapis.cn/api/v1/dictionary/lookup?word=hello&accent=uk', 'https://uapis.cn/api/v1/dictionary/audio?word=hello&accent=uk&url=https://example.com',
    'https://uapis.cn/api/v1/dictionary/audio?word=hello&word=world&accent=uk', 'https://uapis.cn/api/v1/dictionary/audio?word=hello&accent=unknown',
    'https://uapis.cn/api/v1/dictionary/audio?word=../secret&accent=uk', 'https://uapis.cn/api/v1/dictionary/audio?word=hello&accent=uk#fragment',
    'https://uapis.cn/api/v1/dictionary/audio?word=' + 'a'.repeat(121) + '&accent=uk']) assert.equal(audioSource(value), undefined);
});
