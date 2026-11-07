"""Assemble a single transactional migration from reviewed schema/functions and the pinned catalog."""
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]); p=pathlib.Path('supabase/migrations/20261107_discover.sql')
notice='-- Noted Discover v1. Existing vocabulary, users and review progress are preserved.\n-- Run discover_preflight.sql FIRST and review the results.\n/*\n'
for f in ['LICENSE-WORDNET.txt','LICENSE-COW.txt','SOURCES.md']: notice+=pathlib.Path('src/data/discover',f).read_text()+'\n'
notice+='*/\n'; rows=json.load(open('src/data/discover/bank.json'))
seed="\ninsert into public.discover_vocabulary(id,word,meaning,pos,example,definition,level,frequency,synset,alternate_meanings,related_synsets)\nselect id,word,meaning,pos,example,definition,level,frequency,synset,alternate_meanings,related_synsets from jsonb_to_recordset($notedbank$"+('[\n'+',\n'.join(json.dumps(row,ensure_ascii=False,separators=(',',':')) for row in rows)+'\n]')+"$notedbank$::jsonb) as x(id integer,word text,meaning text,pos text,example text,definition text,level integer,frequency integer,synset text,alternate_meanings text[],related_synsets text[]) on conflict(id) do nothing;\n"
p.write_text(notice+(root/'schema.sql').read_text()+seed+(root/'functions.sql').read_text())
