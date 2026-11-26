'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { supabase } from '@/lib/supabase';
import { collectionItems, isOriginalEnglish, type LearningCollection } from '@/lib/collections';
import { offlineLibrary } from '@/lib/offline-library';
import { DEMO_STORAGE_KEY, type LearningItem } from '@/lib/learning';
import { prepareReviewPronunciation, stopPronunciation } from '@/lib/pronunciation';
import styles from './home.module.css';

type Counts = { due:number; total:number; offline?:boolean };
type Snapshot = { key:string; counts?:Counts };

export function TodayReview({ owner, collection, collectionReady }: {
  owner:string|null; collection:LearningCollection|null; collectionReady:boolean;
}) {
  const key=JSON.stringify([owner,collection?.id]);
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!collectionReady||supabase&&!owner)return;
    let abandoned=false,version=0;
    const controller=new AbortController();
    function countLocal(rows:LearningItem[],offline=false){
      const available=collectionItems(rows,collection,isOriginalEnglish(collection));
      return {total:available.length,due:available.filter(row=>Date.parse(row.due_at)<=Date.now()).length,offline};
    }
    async function refresh(){
      const ticket=++version;
      let counts:Counts|undefined;
      try{
        if(!supabase)counts=countLocal(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)||'[]'));
        else if(owner){
          const client=supabase;
          const scoped=()=>{
            const query=client.from('words').select('id',{count:'exact',head:true}).eq('user_id',owner).abortSignal(controller.signal);
            if(!collection)return query;
            return isOriginalEnglish(collection)?query.or(`collection_id.eq.${collection.id},collection_id.is.null`):query.eq('collection_id',collection.id);
          };
          if(!navigator.onLine)throw new Error('offline');
          const [total,due]=await Promise.all([scoped(),scoped().lte('due_at',new Date().toISOString())]);
          if(total.error||due.error||total.count===null||due.count===null)throw new Error('Unavailable count');
          counts={total:total.count,due:due.count};
        }
      }catch{
        const rows=owner?offlineLibrary(owner):null;
        if(rows)counts=countLocal(rows,true);
      }
      if(!abandoned&&version===ticket)setSnapshot({key,counts});
    }
    void refresh();
    window.addEventListener('focus',refresh);
    window.addEventListener('noted-reviews-synced',refresh);
    const timer=setInterval(refresh,60000);
    return()=>{abandoned=true;controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('noted-reviews-synced',refresh);};
  },[collection,collectionReady,key,owner,retry]);

  const current=snapshot?.key===key?snapshot:null;
  const counts=current?.counts;
  const signedOut=!!supabase&&!owner;
  return <section className={styles.today} aria-labelledby="today-review-title">
    <div><h2 id="today-review-title">Today’s review</h2>
    {signedOut?<p>Sign in to see your review queue.</p>:!collectionReady||!current?<p role="status">Checking your words…</p>:counts?
      <p>{counts.due? `${counts.due} ${counts.due===1?'word':'words'} due`:counts.total?'You’re all caught up.':'Add your first word to start reviewing.'}
        {counts.offline&&<small> · Saved offline</small>}</p>:<p>Couldn’t load your review count.</p>}</div>
    {signedOut?<Link className="wb-control" href="/auth">Sign in</Link>:counts?
      counts.due?<Link className="wb-control" href="/review" onClick={()=>{stopPronunciation();prepareReviewPronunciation();}}>Start reviewing <Icon name="right" size={16}/></Link>:
      !counts.total?<Link className="wb-control wb-control-outline" href="/add">Add a word</Link>:null:
      current&&<button type="button" className="secondary" onClick={()=>{setSnapshot(null);setRetry(value=>value+1);}}>Retry</button>}
  </section>;
}
