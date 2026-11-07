"""Build a licensed lexical bank; no generated translations or examples.
Usage: python scripts/build-discover-bank.py /path/to/downloaded/source/files
Source URLs, attribution and licenses: src/data/discover/SOURCES.md.
"""
import csv, json, re, sys, pathlib, collections, hashlib
root=pathlib.Path(sys.argv[1]); out=pathlib.Path('src/data/discover'); out.mkdir(parents=True,exist_ok=True)
levels={}; posmap={'noun':'n','verb':'v','adjective':'a','adverb':'r'}
for filename in ['cefr.csv','advanced.csv']:
 for row in csv.DictReader(open(root/filename)):
  word=row['headword'].lower(); pos=posmap.get(row['pos']); level=row['CEFR']
  if re.fullmatch('[a-z][a-z-]+',word) and pos and level in ['A1','A2','B1','B2','C1','C2']:
   levels.setdefault((word,pos),['A1','A2','B1','B2','C1','C2'].index(level)+1)
chinese=collections.defaultdict(list)
for line in open(root/'cmn.tab'):
 parts=line.rstrip().split('\t')
 if len(parts)==3 and parts[1]=='cmn:lemma' and re.fullmatch('[\u4e00-\u9fff]{1,12}',parts[2]):
  chinese[parts[0]].append(parts[2])
tags={}
for line in open(root/'dict/index.sense'):
 sense,offset,number,count=line.split(); lemma,tail=sense.split('%'); pos={'1':'n','2':'v','3':'a','4':'r','5':'a'}[tail[0]]
 tags[(lemma.replace('_',' '),offset+'-'+pos)]=int(count)
raw=[]; all_chinese=collections.defaultdict(set); all_synsets=collections.defaultdict(set)
for filename,pos in [('noun','n'),('verb','v'),('adj','a'),('adv','r')]:
 for line in open(root/f'dict/data.{filename}'):
  if not line[:1].isdigit(): continue
  data,gloss=line.rstrip().split(' | ',1); parts=data.split(); offset=parts[0]; synset=offset+'-'+pos; count=int(parts[3],16)
  lemmas=[parts[4+2*i].replace('_',' ') for i in range(count)]
  p=4+2*count; pointers=int(parts[p]); related=[parts[p+2+4*i]+'-'+('a' if parts[p+3+4*i]=='s' else parts[p+3+4*i]) for i in range(pointers) if parts[p+1+4*i] in ['&','^','=']]
  for word in lemmas:
   all_chinese[word].update(chinese.get(synset,[])); all_synsets[word].add(synset); all_synsets[word].update(related)
  if not chinese.get(synset): continue
  examples=re.findall(r'"([^"]+)"',gloss)
  for word in lemmas:
   if (word,pos) not in levels or tags.get((word,synset),0)<1: continue
   example=next((e for e in examples if 4<=len(e.split())<=24 and re.search(r'(?<![\w-])'+re.escape(word)+r'(?![\w-])',e,re.I)),None)
   if not example: continue
   meaning='；'.join(dict.fromkeys(chinese[synset][:3])); definition=gloss.split('; "')[0].strip()
   raw.append({'word':word,'pos':pos,'level':levels[(word,pos)],'meaning':meaning,'example':example,'definition':definition,'frequency':tags[(word,synset)],'synset':synset})
# Prefer the most attested sense with a real usage example, then one row per word.
raw.sort(key=lambda r:(-r['frequency'],r['synset'])); unique={}
for row in raw: unique.setdefault(row['word'],row)
counts=collections.Counter(r['level'] for r in unique.values()); print('available:',dict(sorted(counts.items())))
rows=[]
for level in range(1,7):
 candidates=[r for r in unique.values() if r['level']==level]
 candidates.sort(key=lambda r:(-r['frequency'],r['word']))
 for row in candidates[:200]:
  row['alternate_meanings']=sorted(all_chinese[row['word']]); row['related_synsets']=sorted(all_synsets[row['word']]); rows.append(row)
curation=json.load(open('scripts/discover-curation.json'))
rows=[r for r in rows if r['word'] in curation]
for row in rows:
 chosen=curation[row['word']]
 assert chosen in chinese[row['synset']], (row['word'], chosen)
 row['meaning']=chosen
 row['id']=int(hashlib.sha256(('noted-discover-1|'+row['word']+'|'+row['synset']).encode()).hexdigest()[:7],16)
assert len({r['id'] for r in rows})==len(rows)
rows.sort(key=lambda r:(r['level'],r['word']))
(out/'bank.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
(out/'source-hashes.json').write_text(json.dumps({n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in ['cefr.csv','advanced.csv','cmn.tab','wordnet.tar.gz']},indent=2)+'\n')
print('shipped:',len(rows),dict(sorted(collections.Counter(r['level'] for r in rows).items())))
for level in range(1,7):
 print('LEVEL',level,[(r['word'],r['meaning'],r['example']) for r in rows if r['level']==level][:12])
