import test from 'node:test';
import assert from 'node:assert/strict';
import {selectExample,containsItem,exampleKey} from '../../src/lib/example-quality.ts';
const pick=(word,meaning,source,translation='')=>selectExample(word,meaning,[{source,translation}]);
test('whole expression, Unicode apostrophes and sentence-ending punctuation',()=>{
 assert(containsItem("I wouldn't put it that way, to be honest.", 'I wouldn’t put it that way.'));
 assert(containsItem("We served hors d'oeuvre before dinner.",'hors d’œuvre'));
 assert(!containsItem('The stock of fish is growing.','take stock of'));
 assert.equal(exampleKey('  CAUGHT  off guard '),'caught off guard');
});
test('rejects missing, repeated, short, overlong and malformed examples',()=>{
 for(const source of ['', 'caught off guard.', 'Caught off guards surprised me.', '<p>She was caught off guard by the question.</p>', 'She was caught off guard '+ 'really '.repeat(80)])assert.equal(pick('caught off guard','',source),'');
 assert.equal(pick('I would rather stay home.','','I would rather stay home.'),'');
});
test('preserves complete expression and avoids a clearly different translated sense',()=>{
 const source='She was caught off guard by the question.';
 assert.equal(pick('caught off guard','措手不及',source,'这个问题让她措手不及。'),source);
 assert.equal(pick('bank','银行','We sat on the bank of the river.','我们坐在河岸上。'),'');
 assert.equal(selectExample('bank','银行',[{source:'We sat on the bank of the river.',translation:'我们坐在河岸上。'},{source:'She went to the bank to deposit money.',translation:'她去银行存钱。'}]),'She went to the bank to deposit money.');
});
test('untranslated context needs independent meaning evidence',()=>{
 assert.equal(pick('serendipity','', 'Finding this book was pure serendipity.'),'');
 assert.equal(selectExample('unknown','',[]),'');
});
