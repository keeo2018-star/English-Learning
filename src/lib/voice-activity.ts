// Conservative activity boundaries, not speech recognition. No internal pauses
// are removed. Uncertain noise/speech stays intact for an explicit user choice.
export type Activity = {kind:'speech'|'uncertain'|'silence';start:number;end:number};
const quantile=(a:number[],q:number)=>a[Math.min(a.length-1,Math.floor(a.length*q))]||0;
export function voiceActivity(channels:Float32Array[],rate:number):Activity{
 const length=channels[0]?.length||0,total=length/rate,frame=Math.max(1,Math.round(rate*.02));
 if(!length||!rate)return {kind:'silence',start:0,end:total};
 const frames:{rms:number;cross:number;ratio:number}[]=[];
 // Use the most energetic channel: opposite stereo polarity must not cancel speech.
 for(let start=0;start<length;start+=frame){let best={rms:0,cross:0,ratio:0};
  for(const data of channels){let energy=0,band=0,cross=0,previous=0,high=0,low=0;const hp=Math.exp(-2*Math.PI*90/rate),lp=1-Math.exp(-2*Math.PI*4500/rate);let last=0;
   for(let i=start;i<Math.min(start+frame,length);i++){const x=data[i];energy+=x*x;high=hp*(high+x-previous);previous=x;low+=lp*(high-low);band+=low*low;if((low>=0)!==(last>=0))cross++;last=low;}
   const n=Math.min(frame,length-start),rms=Math.sqrt(band/n);if(rms>best.rms)best={rms,cross:cross/n,ratio:band/Math.max(energy,1e-20)};
  }frames.push(best);
 }
 const sorted=frames.map(f=>f.rms).sort((a,b)=>a-b),peak=sorted.at(-1)||0,noise=quantile(sorted,.15);
 if(peak<.00002)return {kind:'silence',start:0,end:total};
 const high=Math.max(.00008,noise*2.8,peak*.07),low=Math.max(.000025,noise*1.3,peak*.018);
 const probable=frames.map(f=>f.rms>=high&&f.ratio>.12&&f.cross>.001&&f.cross<.65);
 // Require more than a click, plus contrast above estimated background. Low-SNR
 // or steady noise is ambiguous, never grounds to discard a possible quiet voice.
 let run=0,credible=false;for(const yes of probable){run=yes?run+1:0;if(run>=3)credible=true;}
 if(!credible||peak/Math.max(noise,.000005)<3)return {kind:'uncertain',start:0,end:total};
 let first=probable.indexOf(true),last=probable.lastIndexOf(true);
 // Hysteresis includes quiet syllables around strong activity before padding.
 while(first>0&&frames[first-1].rms>low)first--;
 while(last<frames.length-1&&frames[last+1].rms>low)last++;
 return {kind:'speech',start:Math.max(0,first*.02-.25),end:Math.min(total,(last+1)*.02+.25)};
}
export function encodeVoiceWav(channels:Float32Array[],rate:number,start=0,end=channels[0].length){
 const count=channels.length,samples=Math.max(0,end-start),buffer=new ArrayBuffer(44+samples*count*2),v=new DataView(buffer);
 const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,count,true);v.setUint32(24,rate,true);v.setUint32(28,rate*count*2,true);v.setUint16(32,count*2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,buffer.byteLength-44,true);
 let offset=44;for(let i=start;i<end;i++)for(const data of channels){const x=Math.max(-1,Math.min(1,data[i]||0));v.setInt16(offset,x<0?x*32768:x*32767,true);offset+=2;}return buffer;
}
