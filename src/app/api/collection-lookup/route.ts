import {collectionLookup} from '@/lib/collection-lookup';
import {learningLanguages} from '@/lib/collections';
export const maxDuration=25;
export async function POST(request:Request){try{
 if(Number(request.headers.get('content-length'))>4096)throw Error('Search text is too long.');const body=await request.json();
 if(!Object.hasOwn(learningLanguages,body.target)||!['en','zh-CN'].includes(body.explanation)||!(body.source==='auto'||Object.hasOwn(learningLanguages,body.source)))throw Error('Choose supported learning and explanation languages.');
 const items=await collectionLookup(body.query,body.target,body.explanation,body.source);return Response.json({items},{headers:{'Cache-Control':'no-store'}});
}catch(error){return Response.json({message:error instanceof Error?error.message:'Lookup is unavailable. Your draft is kept.'},{status:400,headers:{'Cache-Control':'no-store'}});}}
