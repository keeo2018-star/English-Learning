export const ITEM_TEXT_LIMIT=120,CONTEXT_TEXT_LIMIT=3000;
export const textLength=(text:string)=>Array.from(text).length;
// Typography variants only; never remove punctuation, accents or joiners.
export const captureKey=(value:string)=>value.normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/gu,' ').trim().toLowerCase();
export const TYPE_LINE_BUDGETS=[2,3,4,5,7];
export function adaptiveState(current:number,lines:number[],allowGrowth:boolean){
 if(lines[current]>TYPE_LINE_BUDGETS[current]+.35){for(let i=current+1;i<5;i++)if(lines[i]<=TYPE_LINE_BUDGETS[i])return i;return 4;}
 if(allowGrowth)for(let i=0;i<current;i++)if(lines[i]<=TYPE_LINE_BUDGETS[i]-1+.05)return i;
 return current;
}
export function extractExpression(source:string,start:number,end:number){
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>source.length||end<=start)return null;
 const expression=source.slice(start,end).trim();
 if(!expression||textLength(expression)>ITEM_TEXT_LIMIT||expression===source.trim())return null;
 return {expression,context:source};
}
export type AddOutcome={saved:boolean;message?:string;duplicate?:boolean};
