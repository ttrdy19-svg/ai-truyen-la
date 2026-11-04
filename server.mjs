import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {Store,Translator,atomic} from './store.mjs';
import {Gemini,redact} from './gemini.mjs';
import {FontLibrary,readerPreferences} from './fonts.mjs';
const allowedTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
async function body(req) {const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>200000000)throw Error('Dữ liệu tối đa 200 MB.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('JSON không hợp lệ.');}}
export async function createServer({root,config,cover,store:givenStore,gemini:givenGemini,keyProvider,fontDirectory}) {
 const store=givenStore||new Store(path.join(config.dataRoot,'AI Sach')),token=randomBytes(24).toString('hex');
 const settingsFile=path.join(config.dataRoot,'settings.json');let settings={model:config.geminiModel||'gemini-3.6-flash',delaySeconds:6};try{settings={...settings,...JSON.parse(fs.readFileSync(settingsFile,'utf8'))}}catch{}
 let sessionKey='',modelCheck=null,coverJob={state:'idle'};
 const persistCover=()=>atomic(path.join(config.dataRoot,'cover-status.json'),{id:coverJob.id,state:coverJob.state,stage:redact(coverJob.stage||''),error:coverJob.error?redact(coverJob.error):undefined,at:new Date().toISOString()});
 const require=createRequire(path.join(config.studioRoot,'package.json'));
 const fontLibrary=new FontLibrary(()=>fontDirectory||require('./desktop/duong-dan.cjs').fonts);
 const readerFile=path.join(config.dataRoot,'reader-settings.json');
 let readerSaved={};try{readerSaved=JSON.parse(fs.readFileSync(readerFile,'utf8'));}catch{}
 const getKey=async()=>sessionKey||(keyProvider?await keyProvider():require('./desktop/key-pool.cjs').loadGeminiKeys()[0])||null;
 const gemini=givenGemini||new Gemini({getKey}),translator=new Translator(store,gemini,()=>settings.model,()=>settings.delaySeconds*1000);
 let url='';
 const startCover=id=>{
  if(coverJob.state==='running')throw Error('Đang tạo bìa.');const book=store.book(id);if(!cover)throw Error('Tạo bìa cần mở bằng MO-APP.cmd.');
  const controller=new AbortController();coverJob={id,state:'running',stage:'Đang chuẩn bị ChatGPT Plus',controller};persistCover();
  coverJob.task=(async()=>{try{
   const result=await cover({bookId:id,title:book.title,description:book.description,signal:controller.signal,onStage:s=>{coverJob.stage=redact(s);persistCover();}});
   if(controller.signal.aborted)throw Error('Đã dừng tạo bìa.');
   if(!result.bytes?.length||result.width<400||result.height<400)throw Error('Ảnh chưa đạt kích thước đọc được.');
   const current=path.join(store.folder(id),'cover.png');if(fs.existsSync(current))fs.copyFileSync(current,path.join(store.folder(id),'cover-'+Date.now()+'.png'));
   fs.writeFileSync(current,result.bytes);const b=store.book(id);b.cover={provider:result.provider,renderId:result.renderId,width:result.width,height:result.height,at:new Date().toISOString()};store.save(b);
   Object.assign(coverJob,{state:'done',stage:'Đã lưu bìa ChatGPT Plus'});
  }catch(e){Object.assign(coverJob,{state:'error',error:redact(e.message),stage:'Chưa tạo được bìa'});}finally{persistCover();}})();
  return {state:'running'};
 };
 const server=http.createServer(async(req,res)=>{
  const send=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
  try {
   if(req.headers.host!==new URL(url).host)return send({error:'Host không hợp lệ'},403);
   const u=new URL(req.url,url),parts=u.pathname.split('/').filter(Boolean),method=req.method;
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
   if(!['GET','HEAD'].includes(method)&&(req.headers['x-app-token']!==token||req.headers.origin&&req.headers.origin!==url))return send({error:'Phiên làm việc không hợp lệ'},403);
   if(u.pathname==='/api/fonts'&&method==='GET')return send(fontLibrary.catalog());
   if(u.pathname==='/fonts.css'&&method==='GET'){res.writeHead(200,{'content-type':'text/css; charset=utf-8','cache-control':'no-cache'}).end(fontLibrary.css());return;}
   if(u.pathname.startsWith('/fonts/')&&method==='GET'){const asset=fontLibrary.asset(u.pathname);if(!asset)return send({error:'Không có font này.'},404);res.writeHead(200,{'content-type':asset.type,'cache-control':'public, max-age=3600'}).end(asset.bytes);return;}
   if(u.pathname==='/api/reader-settings'&&method==='GET')return send(readerPreferences(readerSaved,fontLibrary.catalog().fonts));
   if(u.pathname==='/api/reader-settings'&&method==='POST'){
    const input=await body(req),fonts=fontLibrary.catalog().fonts;
    if(input.fontId!==undefined&&!fonts.some(f=>f.id===input.fontId))throw Error('Font không còn trong kho Duy TTD.');
    if(input.size!==undefined&&(!Number.isInteger(input.size)||input.size<15||input.size>32))throw Error('Cỡ chữ từ 15 đến 32.');
    const next=readerPreferences({...readerSaved,...input},fonts);atomic(readerFile,next);readerSaved=next;return send(readerSaved);
   }
   if(u.pathname==='/api/state'&&method==='GET')return send({token,books:store.list(),job:translator.status(),cover:{...coverJob,controller:undefined,task:undefined},settings:{...settings,keyConfigured:Boolean(await getKey()),keySource:sessionKey?'Key phiên này':'Google API của Studio',modelCheck},dataRoot:config.dataRoot});
   if(u.pathname==='/api/settings'&&method==='POST') {if(translator.current)throw Error('Tạm dừng dịch trước khi đổi cấu hình.');const input=await body(req);if(input.model!==undefined){if(!/^gemini-[\d.]+-flash(?:-lite)?$/.test(input.model))throw Error('Chọn model Gemini Flash văn bản.');settings.model=input.model;modelCheck=null;}if(input.delaySeconds!==undefined){if(!Number.isInteger(input.delaySeconds)||input.delaySeconds<0||input.delaySeconds>120)throw Error('Thời gian nghỉ từ 0 đến 120 giây.');settings.delaySeconds=input.delaySeconds;}if(input.key!==undefined){if(input.key&&!/^AIza[\w-]{20,100}$/.test(input.key))throw Error('Key Google không đúng định dạng.');sessionKey=input.key;modelCheck=null;}atomic(settingsFile,settings);return send({ok:true});}
   if(u.pathname==='/api/models'&&method==='POST') {const models=await gemini.models();return send({models});}
   if(u.pathname==='/api/test-model'&&method==='POST') {const result=await gemini.generate({model:settings.model,messages:[{role:'system',content:'Dịch sang tiếng Việt, giữ tên riêng theo Hán Việt. Chỉ trả bản dịch.'},{role:'user',content:'林安站在云端，笑着说：“塔是小了点，气势不能输。”'}]});modelCheck={at:new Date().toISOString(),model:settings.model,actualModel:result.model,sample:result.text};return send(modelCheck);}
   if(u.pathname==='/api/import'&&method==='POST')return send(store.importFile(await body(req)));
   if(u.pathname==='/api/backup'&&method==='GET'){res.setHeader('Content-Disposition','attachment; filename="Truyen-La-backup.json"');return send(store.backup());}
   if(u.pathname==='/api/restore'&&method==='POST')return send({books:store.restore(await body(req))});
   if(u.pathname==='/api/pause'&&method==='POST')return send(translator.pause());
   if(parts[0]==='api'&&parts[1]==='books'&&parts[2]) {
    const id=parts[2],action=parts[3];
    if(!action&&method==='GET')return send(store.book(id));
    if(!action&&method==='POST'){const patch=await body(req);if(translator.current?.id===id&&Object.keys(patch).some(k=>k!=='bookmark'))throw Error('Tạm dừng dịch trước khi sửa truyện.');return send(store.patch(id,patch));}
    if(action==='attach'&&method==='POST'){if(translator.current?.id===id)throw Error('Truyện đang dịch.');return send(store.attach(id,await body(req)));}
    if(action==='translate'&&method==='POST'){if(!modelCheck||modelCheck.model!==settings.model)throw Error('Vào Cài đặt → Thử dịch để xác nhận model trước lượt dịch đầu.');return send(translator.start(id,await body(req)));}
    if(action==='cover'&&method==='POST')return send(startCover(id));
    if(action==='cover.png'&&method==='GET'){const file=path.join(store.folder(id),'cover.png');if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':'image/png','cache-control':'no-cache'}).end(fs.readFileSync(file));return;}
    if(action==='export'&&method==='GET') {const book=store.book(id);const source=u.searchParams.get('mode')==='source';const content=book.chapters.map((_,i)=>{const c=store.chapter(id,i);return (c.translatedTitle||c.title)+'\n\n'+(source?c.source:c.translation?(c.status==='done'?'':'[BẢN DỊCH DỞ]\n')+c.translation:'[CHƯA DỊCH]');}).join('\n\n────────────────────────\n\n');res.writeHead(200,{'content-type':'text/plain; charset=utf-8','content-disposition':'attachment; filename="Truyen-La.txt"'}).end('\uFEFF'+book.title+'\n'+book.author+'\n\n'+content);return;}
    if(action==='chapters'&&parts[4]!==undefined){const index=Number(parts[4]);if(method==='GET')return send(store.chapter(id,index));if(method==='POST'){if(translator.current?.id===id)throw Error('Tạm dừng dịch trước khi sửa chương.');const input=await body(req),c=store.chapter(id,index);if(typeof input.translation!=='string'||input.translation.length>2000000||!input.translation.trim())throw Error('Bản sửa không được rỗng hoặc dài quá 2 triệu ký tự.');c.history=[...(c.history||[]),{translation:c.translation,status:c.status,at:new Date().toISOString()}].slice(-5);c.translation=input.translation.trim();c.status='done';c.parts=[];c.translatedTitle=String(input.translatedTitle||c.translatedTitle||'').slice(0,300);return send(store.saveChapter(id,index,c));}}
   }
   if(method==='GET'&&['/','/index.html','/app.js','/style.css'].includes(u.pathname)){const name=u.pathname==='/'?'index.html':u.pathname.slice(1);res.writeHead(200,{'content-type':allowedTypes[path.extname(name)],'cache-control':'no-cache'}).end(fs.readFileSync(path.join(root,name)));return;}
   send({error:'Không tìm thấy.'},404);
  }catch(e){send({error:redact(e.message)},400);}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number.isInteger(config.port)&&config.port>1023&&config.port<65536?config.port:0,'127.0.0.1',resolve);});url='http://127.0.0.1:'+server.address().port;
 return {url,store,translator,startCover,waitForCover:()=>coverJob.task,coverStatus:()=>({...coverJob,controller:undefined,task:undefined}),stop:()=>{translator.pause();coverJob.controller?.abort();server.close();}};
}
