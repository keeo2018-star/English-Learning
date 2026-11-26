import test from 'node:test';import assert from 'node:assert/strict';
import {lookupRelated,selectRelated,relatedQuery,relatedSenseMatches,relatedPreview,relatedMeaning,vocabularyKey} from '../../src/lib/related-words.ts';
const term=(word,frequency=1,tags=[])=>({word,score:100,tags:[...tags,`f:${frequency}`]});
test('semantic recommendations reject duplicates, obscure and spelling-only hits',()=>{const r=selectRelated('zodiac',[term('ZODIAC'),term(' horoscope '),term('Horoscope'),term('constellation'),term('astrology'),term('obscure',.001),term('spelling',5,['results_type:spelling'])],[]);assert.deepEqual(r.items.map(x=>x.word),['horoscope','constellation','astrology']);assert.deepEqual(r.family,[]);assert.ok(!r.items.some(x=>x.meaning));});
test('explicit synonym and antonym relationships precede semantic candidates',()=>{const r=selectRelated('create',[term('build'),term('make')],[term('make')],[term('destroy')]);assert.deepEqual(r.items,[{word:'make',relation:'synonym'},{word:'destroy',relation:'antonym'},{word:'build',relation:'related'}]);assert.deepEqual(r.family,[])});
test('provider queries the complete expression, with no triggers, spelling or token splitting',async()=>{const urls=[];const r=await lookupRelated('Take it easy.',async url=>{urls.push(new URL(url));return Response.json([term('relax'),term('calm down')])});assert.equal(urls.length,3);assert.ok(urls.every(u=>u.hostname==='api.datamuse.com'&&!u.searchParams.has('sp')&&!u.searchParams.has('rel_trg')));assert.equal(urls[0].searchParams.get('ml'),'take it easy');assert.equal(urls[1].searchParams.get('rel_syn'),'take it easy');assert.equal(urls[2].searchParams.get('rel_ant'),'take it easy');assert.equal(r.items.length,2)});
test('partial failures retain useful results, full failures remain retryable',async()=>{const r=await lookupRelated('relax',async url=>new URL(url).searchParams.has('ml')?Response.json([term('unwind')]):new Response('',{status:503}));assert.deepEqual(r.items,[{word:'unwind',relation:'related'}]);await assert.rejects(lookupRelated('relax',async()=>new Response('',{status:429})),/unavailable/)});
test('invalid queries never fan out; empty results remain empty',async()=>{for(const x of ['', '中文','https://bad.test', 'x'.repeat(121)]){assert.equal(relatedQuery(x),'');assert.deepEqual((await lookupRelated(x,()=>{throw Error('must not fetch')})).items,[])}assert.deepEqual((await lookupRelated('unfindable',async()=>Response.json([]))).items,[])});
test('saved expression meaning filters inventory/finance/weapon senses; does not transmit it',()=>{
 const meaning='全面盘点，整体评估：对情况或资源进行检查。';
 assert(relatedSenseMatches(meaning,['评估，评价'],[]));
 assert(relatedSenseMatches(meaning,['反思、回顾并评估'],[]));
 for(const unrelated of ['证券、股票','弹药，军需资源','评级，额定功率','秒，证券交易委员会'])assert(!relatedSenseMatches(meaning,[unrelated],[]));
 assert(!relatedSenseMatches(meaning,['朝……（里面）看，向……看'],[]));
 assert(!relatedSenseMatches('河岸',['银行，金融机构'],[]));
 assert(!relatedSenseMatches('创造',['破坏'],[],'antonym')); // lexical opposition alone cannot disambiguate sense
 assert(!relatedSenseMatches('评估',[],[]));
});
test('compact previews preserve the full stored meaning; apostrophe keys agree',()=>{
 assert.equal(relatedPreview('v. 评估，评价：对情况作出判断。'),'评估，评价');
 assert.equal(vocabularyKey(' I wouldn’t  say '),"i wouldn't say");
});

test('selects an available matching sense instead of the first unrelated dictionary gloss',()=>{
 assert.equal(relatedMeaning('评估',['比率；评级；评估；估价']),'评估');
 assert.equal(relatedMeaning('河岸',['银行；河岸']),'河岸');
});
