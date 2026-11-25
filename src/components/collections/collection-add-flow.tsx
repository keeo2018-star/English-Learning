'use client';
import {useEffect,useRef,useState} from 'react';
import {AddWordFlow,type AddDraft} from '@/components/dictionary/add-word-flow';
import {storedCollectionDraft,storeCollectionDraft} from '@/lib/offline-store';
import type {LearningCollection} from '@/lib/collections';
export function CollectionAddFlow(props:React.ComponentProps<typeof AddWordFlow>&{owner?:string;collection?:LearningCollection}){
 const {owner,collection}=props;
 const collectionId=collection?.id;
 const [draft,setDraft]=useState<AddDraft|null|undefined>(undefined),[storageError,setStorageError]=useState('');
 const latest=useRef<AddDraft|null>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>{if(!owner||!collectionId)return;let alive=true;void storedCollectionDraft(owner,collectionId).then(value=>{if(alive){const valid=value&&typeof value==='object'&&'query' in value&&typeof value.query==='string'?value as AddDraft:null;latest.current=valid;setDraft(valid);}}).catch(()=>{if(alive){setDraft(null);setStorageError('Draft storage is unavailable. Keep this page open until you save.');}});return()=>{alive=false;clearTimeout(timer.current);const value=latest.current;if(value)void storeCollectionDraft(owner,collectionId,value).catch(()=>{});};},[owner,collectionId]);
 const onDraftChange=(value:AddDraft)=>{latest.current=value;if(owner&&collection){clearTimeout(timer.current);timer.current=setTimeout(()=>{void storeCollectionDraft(owner,collection.id,value).catch(()=>{setStorageError('Could not keep this draft on this device. Save it before leaving.');});},300);}};
 if(owner&&collection&&draft===undefined)return <p role="status">Restoring your draft…</p>;
 return <>{storageError&&<p role="status">{storageError}</p>}<AddWordFlow {...props} initialDraft={draft||undefined} onDraftChange={owner&&collection?onDraftChange:undefined}/></>;
}
