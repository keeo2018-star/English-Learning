import {rememberLibrary} from './offline-library';
import {supabase} from './supabase';
import {acknowledgeReview,pendingReviews} from './offline-store';
import {rateItem,reviewState} from './review';
import type {LearningItem} from './learning';
const running=new Map<string,Promise<void>>();
export async function syncOfflineReviews(owner:string){
 if(!supabase||!navigator.onLine)return;const client=supabase;
 if(running.has(owner))return running.get(owner);
 const sync=async()=>{
  const events=await pendingReviews(owner);if(!events.length)return;
  // Verify the current bearer with the server before using any account's outbox.
  const auth=await client.auth.getUser();if(auth.error||auth.data.user?.id!==owner)throw Error('Sign in again to sync your saved reviews.');
  let unavailable=false;
  for(const event of events){
   const session=await client.auth.getSession();if(session.data.session?.user.id!==owner)throw Error('Account changed. Reviews remain saved on this device.');
   for(let retry=0;retry<3;retry++){
    const loaded=await client.from('words').select('*').eq('id',event.itemId).eq('user_id',owner).single();if(loaded.error){if(loaded.error.code==='PGRST116'){const recorded=await client.from('review_events').select('id').eq('id',event.id).eq('learning_item_id',event.itemId).eq('user_id',owner).maybeSingle();if(recorded.data?.id===event.id)await acknowledgeReview(owner,event.id);else unavailable=true;break;}throw Error('Could not load a saved review yet. Its progress remains on this device.');}
    const word=loaded.data as LearningItem;if(event.updated.collection_id&&word.collection_id!==event.updated.collection_id){unavailable=true;break;}const next=rateItem(word,event.rating,Date.parse(event.at));
    const result=await client.rpc('record_offline_learning_review',{p_event_id:event.id,p_item_id:event.itemId,p_rating:event.rating==='sure'?'sure':'not_sure',p_expected_count:reviewState(word)?.review_count||0,p_due_at:next.due_at,p_interval_days:next.interval_days,p_review_state:next.review_state,p_reviewed_at:event.at});
    if(result.error?.code==='40001'&&retry<2)continue;
    if(result.error)throw Error(['PGRST202','PGRST205'].includes(result.error.code)?'Your reviews are saved on this device. Sync is not available yet.':'Could not sync yet. Your reviews are saved on this device.');
    if(result.data?.id!==event.itemId)throw Error('Could not confirm review sync. Your review is still saved.');
    if((await client.auth.getSession()).data.session?.user.id!==owner)throw Error('Account changed. Your review is safely saved for that account.');
    const snapshot=await acknowledgeReview(owner,event.id,result.data);if(snapshot)rememberLibrary(owner,snapshot,false);break;
   }
  }
  if(unavailable)throw Error('Some reviews need attention because their Library entries are unavailable. Other reviews can still sync.');
 };
 const task=(async()=>{if(navigator.locks)await navigator.locks.request('noted-review-sync:'+owner,sync);else await sync();})().finally(()=>running.delete(owner));running.set(owner,task);return task;
}
