const fileLimit = 12 * 1024 * 1024;
const decodeTimeout = 10000;

export async function photoCanvas(file: File): Promise<HTMLCanvasElement> {
  if (!file.size || file.size > fileLimit) throw Error('Choose an image smaller than 12 MB.');
  if ((file.type && !/^image\/(jpeg|png|webp|gif|bmp|heic|heif)$/i.test(file.type)) ||
      (!file.type && !/\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name))) {
    throw Error('Choose a photo or screenshot in a supported image format.');
  }
  const url=URL.createObjectURL(file);
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const image=new Image();
    await Promise.race([
      new Promise<void>((resolve,reject)=>{
        image.onload=()=>resolve();image.onerror=()=>reject(Error('This image could not be opened. Try a JPEG or PNG instead.'));
        image.src=url;
      }),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('The image took too long to open.')),decodeTimeout);}),
    ]);
    const ratio=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(image.naturalWidth*ratio);
    canvas.height=Math.round(image.naturalHeight*ratio);
    const context=canvas.getContext('2d');
    if(!context||!canvas.width||!canvas.height)throw Error('This image could not be opened.');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas;
  } finally {
    clearTimeout(timer);
    URL.revokeObjectURL(url);
  }
}

export async function recognizePhoto(canvas: HTMLCanvasElement, signal: AbortSignal):Promise<string> {
  signal.throwIfAborted();
  const {createWorker}=await import('tesseract.js');
  signal.throwIfAborted();
  const worker=await createWorker(['eng','chi_sim','fra','spa']);
  const terminate=()=>{void worker.terminate();};
  try {
    signal.throwIfAborted();
    const result=await new Promise<string>((resolve,reject)=>{
      const abort=()=>reject(signal.reason);
      signal.addEventListener('abort',abort,{once:true});
      void worker.recognize(canvas).then(({data})=>resolve(data.text.trim()),reject)
        .finally(()=>signal.removeEventListener('abort',abort));
    });
    return Array.from(result).slice(0,4000).join('');
  } finally {terminate();}
}

export function selectedInput(value:string,start:number,end:number):string {
  return (end>start?value.slice(start,end):value).trim();
}
