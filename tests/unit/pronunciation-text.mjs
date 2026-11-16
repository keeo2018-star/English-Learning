import test from 'node:test';import assert from 'node:assert/strict';
import {spokenEnglish,lookupText,pronunciationKey} from '../../src/lib/dictionary.ts';
import {validateDictionaryWord} from '../../src/lib/dictionary.ts';
test('lexical apostrophes and complete expressions survive normalization and query encoding',()=>{
 for(const text of ['hors d’oeuvre',"hors d'oeuvre",'hors d’œuvre']){assert.equal(pronunciationKey(text),"hors d'oeuvre");assert.equal(validateDictionaryWord(text),"hors d'oeuvre");const params=new URLSearchParams({word:pronunciationKey(text)});assert.equal(params.get('word'),"hors d'oeuvre");assert.ok(!params.toString().includes('d+oeuvre'));}
 assert.equal(spokenEnglish('I wouldn’t put it that way.'),"I wouldn't put it that way.");assert.equal(pronunciationKey('I wouldn’t put it that way.'),"i wouldn't put it that way");
 for(const text of ['caught off guard','take stock of'])assert.equal(spokenEnglish(text),text);
});
test('lookup folding does not remove speech punctuation or read Chinese personal notes',()=>{
 assert.equal(lookupText('  ＣＡＦＥ  d’ŒUVRE '),"CAFE d'OEUVRE");assert.equal(spokenEnglish('Take it easy. 保持轻松'),'Take it easy.');assert.equal(spokenEnglish('hors d’œuvre'),"hors d'œuvre");assert.throws(()=>validateDictionaryWord('../x'));assert.throws(()=>validateDictionaryWord('中文'));
});
