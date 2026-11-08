import type { Page, Route } from '@playwright/test';
import bank from '../../src/data/discover/bank.json';
import { mockCloud, cloudOrigin, sampleWord } from './cloud';
import type { DiscoverState } from '../../src/lib/discover';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const dailyItems = [...bank.filter(x=>x.level===3).slice(0,8),...bank.filter(x=>x.level===4).slice(0,2)];
export function discoverFixture() {
 const state: DiscoverState={discover_version:2,profile:{assessment_status:'pending',starting_level:3,recommendation_level:3},assessment:null,daily:null};
 const library: Record<string,unknown>[]=[];const calls: { action: string; payload: Record<string,unknown> }[]=[];
 let date=new Date().toISOString().slice(0,10),failure='',lost=false;
 const question=(index:number)=>{ const q=bank.filter(x=>x.level===3)[index]; return {id:q.id,word:q.word,pos:q.pos,example:q.example,level:q.level,choices:[{id:q.id,meaning:q.meaning},...bank.filter(x=>x.pos===q.pos&&x.meaning!==q.meaning).slice(0,3).map(x=>({id:x.id,meaning:x.meaning}))]}; };
 const seen=new Set<number>(),history=new Map<string,NonNullable<DiscoverState['daily']>>();
 const ensure=()=>{if(!state.daily){
  const available=[...dailyItems,...bank.filter(x=>!dailyItems.some(first=>first.id===x.id))].filter(x=>!seen.has(x.id)&&!library.some(saved=>String(saved.word).trim().toLowerCase()===x.word));
  const items=available.slice(0,10);items.forEach(x=>seen.add(x.id));
  state.daily={id:crypto.randomUUID(),local_date:date,timezone:'Europe/London',item_ids:items.map(x=>x.id),items,responses:{},difficulty:state.profile.recommendation_level,remaining_count:available.length-items.length};
  history.set(state.daily.id,state.daily);
 }};
 const handler=async(route:Route)=>{
  const input=route.request().postDataJSON();const action=input.p_action;const payload=input.p_payload||{};calls.push({action,payload});
  if(failure===action){failure='';return route.fulfill({status:503,json:{message:'Temporary sync failure'}});}
  if(action==='get'){}
  else if(action==='skip'){state.profile.assessment_status='skipped';state.assessment=null;ensure();}
  else if(action==='assessment_start'){state.assessment={id,status:'in_progress',responses:[],question:question(0),estimated_level:null,result_seen:false};}
  else if(action==='assessment_answer'){
   const a=state.assessment!;
   if(a.responses.length===payload.position){a.responses.push({item_id:payload.item_id,answer_id:payload.answer_id,correct:payload.answer_id===payload.item_id,level:3});if(a.responses.length===16){a.status='completed';a.question=null;a.estimated_level=4;state.profile={assessment_status:'completed',starting_level:4,recommendation_level:4};}else a.question=question(a.responses.length);}
  }else if(action==='assessment_accept'){state.assessment=null;ensure();}
  else if(action==='daily'){ensure();}
  else if(action==='next_batch'){const current=state.daily!;if(payload.set_id===current.id&&current.items.every(x=>current.responses[String(x.id)])&&current.remaining_count!==0){state.daily=null;ensure();}}
  else if(action==='daily_response'){
   const d=state.daily!, key=String(payload.item_id);
   if(!d.responses[key]){
    const word=d.items.find(x=>x.id===payload.item_id)!;
    let entry=library.find(x=>String(x.word).toLowerCase()===word.word);const added=!entry;
    if(payload.response==='save'&&!entry){entry={...sampleWord,id:crypto.randomUUID(),word:word.word,meaning:word.meaning,example:word.example,item_type:'word',interval_days:0,review_state:null};library.push(entry);}
    d.responses[key]={action:payload.response,library_id:payload.response==='save'?String(entry!.id):null,added:payload.response==='save'&&added};
   }
  }
  if(lost&&['daily_response','next_batch'].includes(action)){lost=false;return route.abort('failed');}
  return route.fulfill({json:structuredClone(state)});
 };
 return {state,library,calls,history,handler, failNext:(action:string)=>{failure=action;},loseNextResponse:()=>{lost=true;},nextDate:(value:string)=>{date=value;},ready:()=>{state.profile.assessment_status='skipped';ensure();}};
}
export async function mockDiscover(page:Page,fixture=discoverFixture()){
 await mockCloud(page,route=>route.fulfill({json:fixture.library}));
 await page.route(cloudOrigin+'/rest/v1/rpc/discover_action',fixture.handler);
 await page.route('**/api/dictionary?*',route=>route.fulfill({json:{word:'example',phonetics:[],chinese:[],english:[],examples:[],synonyms:[]}}));
 return fixture;
}
