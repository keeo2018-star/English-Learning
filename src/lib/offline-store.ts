import {readReviewSession,mergeReviewSessions,completeSessionCard,type ReviewSession} from './review-session';
import type {LearningItem} from './learning';
import {rateItem,reviewState,type RecallRating} from './review';
export type PendingReview={id:string;owner:string;itemId:string;rating:RecallRating;at:string;sequence?:number;updated:LearningItem};
const NAME='noted-offline-v1';let opening:Promise<IDBDatabase>|null=null;
function database(){if(!opening)opening=new Promise<IDBDatabase>((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(Error('Offline storage is unavailable.'));return;}const request=indexedDB.open(NAME,2);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('libraries'))db.createObjectStore('libraries',{keyPath:'owner'});if(!db.objectStoreNames.contains('ratings')){const ratings=db.createObjectStore('ratings',{keyPath:'id'});ratings.createIndex('owner','owner');}if(!db.objectStoreNames.contains('sessions'))db.createObjectStore('sessions',{keyPath:'owner'});};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db)};request.onerror=()=>{opening=null;reject(request.error)};});return opening;}
function value<T>(request:IDBRequest<T>){return new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});}
function committed(tx:IDBTransaction){const done=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('Could not save offline progress.'));});void done.catch(()=>{});return done;}
export async function storedLibrary(owner:string):Promise<LearningItem[]|null>{const db=await database();const row=await value(db.transaction('libraries').objectStore('libraries').get(owner));return row?.owner===owner&&Array.isArray(row.items)?row.items:null;}
export async function storeLibrary(owner:string,items:LearningItem[]){
 const db=await database(),tx=db.transaction(['libraries','ratings'],'readwrite'),done=committed(tx),libraries=tx.objectStore('libraries');const previous=await value(libraries.get(owner));const pending:PendingReview[]=await value(tx.objectStore('ratings').index('owner').getAll(owner));
 const latest=new Map<string,LearningItem>((previous?.items||[]).map((item:LearningItem)=>[item.id,item]));for(const event of pending){const prior=latest.get(event.itemId);if((reviewState(event.updated)?.review_count||0)>(prior?reviewState(prior)?.review_count||0:0))latest.set(event.itemId,event.updated);}
 const merged=items.map(item=>{const candidate=latest.get(item.id);return candidate&&(reviewState(candidate)?.review_count||0)>(reviewState(item)?.review_count||0)?{...item,review_state:candidate.review_state,due_at:candidate.due_at,interval_days:candidate.interval_days}:item;});libraries.put({owner,items:merged});await done;
}
export async function clearStoredLibrary(owner:string){const db=await database(),tx=db.transaction('libraries','readwrite'),done=committed(tx);tx.objectStore('libraries').delete(owner);await done;}
export async function pendingReviews(owner:string):Promise<PendingReview[]>{const db=await database();const rows=await value(db.transaction('ratings').objectStore('ratings').index('owner').getAll(owner));return rows.filter((e:PendingReview)=>e.owner===owner).sort((a:PendingReview,b:PendingReview)=>(a.sequence??0)-(b.sequence??0)||a.at.localeCompare(b.at)||a.id.localeCompare(b.id));}
export async function acknowledgeReview(owner:string,id:string,confirmed?:LearningItem){
 const db=await database(),tx=db.transaction(['ratings','libraries'],'readwrite'),done=committed(tx),store=tx.objectStore('ratings'),row=await value(store.get(id));
 if(row?.owner!==owner){await done;return null;}
 store.delete(id);let items:LearningItem[]|null=null;
 if(confirmed){const snapshot=await value(tx.objectStore('libraries').get(owner));if(snapshot){const remaining:PendingReview[]=await value(store.index('owner').getAll(owner));let latest=confirmed;
  for(const event of remaining.filter(e=>e.itemId===confirmed.id).sort((a,b)=>(a.sequence??0)-(b.sequence??0)||a.at.localeCompare(b.at))){latest=optimisticReview(latest,event.rating,Date.parse(event.at));store.put({...event,updated:latest});}
  items=snapshot.items.map((item:LearningItem)=>item.id===confirmed.id?latest:item);tx.objectStore('libraries').put({owner,items});}}
 await done;return items;
}
function optimisticReview(item:LearningItem,rating:RecallRating,at:number){const next=rateItem(item,rating,at),before=reviewState(item);return before&&Date.parse(before.last_reviewed_at)>at?{...item,review_state:{...before,review_count:next.review_state!.review_count,sure_count:next.review_state!.sure_count,unsure_count:next.review_state!.unsure_count}}:next;}
// The queue and optimistic snapshot commit together. UI must not advance earlier.
export async function enqueueReview(owner:string,item:LearningItem,rating:RecallRating,id:string,items:LearningItem[],at=Date.now(),session?:ReviewSession|null){
 const db=await database(),tx=db.transaction(['ratings','libraries','sessions'],'readwrite'),done=committed(tx),store=tx.objectStore('ratings');
 const prior:PendingReview|undefined=await value(store.get(id));if(prior&&prior.owner!==owner){tx.abort();await done;throw Error('Review belongs to another account.');}
 const snapshot=await value(tx.objectStore('libraries').get(owner));const latest:LearningItem[]=snapshot?.items||items;const saved=latest.find(row=>row.id===item.id);const base=saved&&(reviewState(saved)?.review_count||0)>(reviewState(item)?.review_count||0)?{...item,review_state:saved.review_state,due_at:saved.due_at,interval_days:saved.interval_days}:item;
 const existing:PendingReview[]=await value(store.index('owner').getAll(owner));
 const event=prior||{id,owner,itemId:item.id,rating,at:new Date(at).toISOString(),sequence:Math.max(0,...existing.map(e=>e.sequence||0))+1,updated:optimisticReview(base,rating,at)};
 const next=latest.map(row=>row.id===item.id?event.updated:row);if(!next.some(row=>row.id===item.id))next.push(event.updated);
 if(!prior)store.add(event);tx.objectStore('libraries').put({owner,items:next});if(session&&session.account===owner)await writeSession(tx.objectStore('sessions'),completeSessionCard(session,id));await done;return {event,items:next};
}

async function writeSession(store:IDBObjectStore,next:ReviewSession){const existing=await value(store.get(next.account));const merged=mergeReviewSessions(next,existing?.data?readReviewSession(JSON.stringify(existing.data),next.account):null);store.put({owner:next.account,data:merged});}
export async function storeReviewSession(session:ReviewSession){const db=await database(),tx=db.transaction('sessions','readwrite'),done=committed(tx);await writeSession(tx.objectStore('sessions'),session);await done;}
export async function storedReviewSession(owner:string){const db=await database();const row=await value(db.transaction('sessions').objectStore('sessions').get(owner));return row?.owner===owner?readReviewSession(JSON.stringify(row.data),owner):null;}
