// Display/selection helpers only. Never rewrite a saved meaning or example.
const genericHan = /[的了是在和或与一个这那很地得以对为及并等某种]/g;
const genericWords = new Set(['the','and','for','with','that','this','from','into','something','someone','being','having','used','word','meaning','example','usually','person','people','thing','very','also']);
const topics = {
  food: /柑橘|蜜柑|橘子|水果|食物|果汁|开胃菜|巧克力|食用|吃|\b(?:citrus|mandarin|orange|fruit|juice|eat|ate|eaten|peel|sweet|food|dinner|chocolate|appetizer)\b/iu,
  history: /氏族|武士|幕府|封建|萨摩藩|历史|\b(?:clan|samurai|feudal|shogun|historical|rebellion|dynasty)\b/iu,
  finance: /银行|存款|存钱|贷款|金融|\b(?:deposit|money|finance|financial|loan|account|lending)\b/iu,
  river: /河岸|河边|江岸|河流|\b(?:river|riverbank|shore|stream)\b/iu,
  assessment: /审视|评估|估量|反思|盘点|梳理|形势|\b(?:assess|assessment|evaluate|evaluation|reflect|review|situation|consider)\b/iu,
  discomfort: /尴尬|窘迫|不自在|难堪|\b(?:awkward|embarrassed|embarrassing|uncomfortable|uneasy)\b/iu,
  temperature: /寒冷|冰冷|温度|炎热|\b(?:temperature|cold|warm|hot|freezing)\b/iu,
} as const;

export function meaningParts(meaning: string): string[] {
  return meaning.split(/[；;\n]+|(?:\s+[1-9][.)、]\s*)/u)
    .map(text=>text.replace(/^\s*(?:\d+[.)、]\s*|(?:n|vt|vi|v|adj|adv|phr)\.\s*)/iu,'').trim()).filter(Boolean);
}

export function primaryMeaning(meaning: string, limit=110): string {
  let first=meaningParts(meaning)[0]||meaning.trim();
  const sentence=first.split(/。|(?<=[.!?])\s+(?=[A-Z])/u)[0];
  if(sentence)first=sentence;
  // A short headword before a gloss is useful; a POS label is not a meaning.
  const colon=first.search(/[：:]/u);
  if(colon>=2&&colon<=32&&!/^(?:noun|verb|adjective|adverb|名词|动词|形容词)$/iu.test(first.slice(0,colon).trim()))first=first.slice(0,colon);
  const chars=Array.from(first);
  if(chars.length<=limit)return first;
  let short=chars.slice(0,limit-1).join('');
  if(!/\p{Script=Han}/u.test(short))short=short.replace(/\s+\S*$/u,'');
  return short.replace(/[,，、\s]+$/u,'')+'…';
}

function topicSet(text:string){return new Set(Object.entries(topics).filter(([,pattern])=>pattern.test(text)).map(([name])=>name));}
function cleanHan(text:string){return text.replace(/[^\p{Script=Han}]/gu,'').replace(genericHan,'');}
function tokens(text:string){return (text.toLowerCase().match(/[a-zÀ-ÿ]{3,}/gu)||[]).filter(word=>!genericWords.has(word));}

export function conflictingSense(meaning:string,text:string) {
  const left=topicSet(primaryMeaning(meaning)),right=topicSet(text);
  return left.size>0&&right.size>0&&![...left].some(topic=>right.has(topic));
}

// Positive evidence must come from the meaning/context, not the target spelling.
// This is deliberately conservative lexical evidence, not a claim of AI disambiguation.
export function senseEvidence(meaning:string,translation:string,context='',target=''):boolean {
  const selected=primaryMeaning(meaning), escaped=target.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const usage=escaped?context.replace(new RegExp(escaped,'giu'),' '):context;
  const evidence=translation+' '+usage;
  if(!selected.trim()||conflictingSense(selected,evidence))return false;
  const left=topicSet(selected),right=topicSet(evidence);
  if([...left].some(topic=>right.has(topic)))return true;
  const han=cleanHan(selected),translated=cleanHan(translation);
  if(han.length===1&&translated.includes(han))return true;
  for(let i=0;i<han.length-1;i++)if(translated.includes(han.slice(i,i+2)))return true;
  const known=new Set(tokens(evidence));
  return tokens(selected).some(word=>known.has(word)&&!tokens(target).includes(word));
}

type QualityItem={word:string;meaning:string;example?:string|null;example_source?:string|null;learning_details?:{exampleTranslation?:string;exampleSource?:string;source?:string}|null};
export function personalExample(item:QualityItem){return item.example_source==='personal'||item.learning_details?.exampleSource==='personal';}
export function trustedSavedExample(item:QualityItem){
  if(!item.example?.trim())return false;
  return personalExample(item)||senseEvidence(item.meaning,item.learning_details?.exampleTranslation||'',item.example,item.word);
}
export function contentIssues(item:QualityItem):string[]{
  const issues:string[]=[];
  if(Array.from(item.meaning).length>160)issues.push('The saved meaning is long. Choose a concise primary sense.');
  const senses=new Set(meaningParts(item.meaning).flatMap(part=>[...topicSet(part)]));
  if(senses.size>1)issues.push('The saved meaning may contain different senses.');
  if(item.example&&!personalExample(item)&&conflictingSense(item.meaning,(item.learning_details?.exampleTranslation||'')+' '+item.example))issues.push('The saved example may use another sense.');
  return issues;
}
