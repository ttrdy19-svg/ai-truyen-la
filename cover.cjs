const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const {createRequire}=require('node:module');
const {archiveOwnedRender}=require('./archive-render.cjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function portBusy(port) {return new Promise(resolve=>{const c=net.connect({host:'127.0.0.1',port});c.once('connect',()=>{c.destroy();resolve(true)});c.once('error',()=>resolve(false));c.setTimeout(1000,()=>{c.destroy();resolve(false)});});}
function ledgerFile(config,bookId){if(!/^[a-z\d-]{1,64}$/.test(bookId||''))throw Error('Mã truyện không hợp lệ.');return path.join(config.dataRoot,'cover-render-'+bookId+'.local.json');}
async function recoverSavedCover({config,bookId,title,onStage}) {
 let ledger;try{ledger=JSON.parse(await fs.readFile(ledgerFile(config,bookId),'utf8'));}catch{return null;}
 if(!/^[a-f\d-]{36}$/.test(ledger.id||'')||ledger.title!==title)return null;
 const meta=JSON.parse(await fs.readFile(path.join(config.dataRoot,'AI Sach',bookId,'book.json'),'utf8'));
 if(meta.cover?.renderId===ledger.id)return null;
 const source=path.join(config.studioData,'projects',ledger.id),archive=path.join(config.dataRoot,'AI Phuong An Bia',ledger.id);
 let folder=source;try{await fs.access(path.join(folder,'images.json'));}catch{folder=archive;}
 let state,marker;try{state=JSON.parse(await fs.readFile(path.join(folder,'images.json'),'utf8'));marker=JSON.parse(await fs.readFile(path.join(folder,'truyen-la-owner.json'),'utf8'));}catch{return null;}
 if(marker.owner!=='AI Truyen La'||marker.id!==ledger.id||!state.run?.done)return null;
 const candidate=state.candidates?.[0];if(!/^images\/[a-f\d-]{36}\.png$/.test(candidate?.file||''))return null;
 const bytes=await fs.readFile(path.join(folder,candidate.file));
 if(folder===source){for(const c of state.candidates)c.account='';await fs.writeFile(path.join(folder,'images.json'),JSON.stringify(state));await archiveOwnedRender(config,ledger.id);}
 onStage('Đang nhận ảnh đã vẽ xong từ Studio');return {bytes,provider:'ChatGPT Plus · luồng ảnh Studio',renderId:ledger.id};
}
async function sharedCover({config,req,bookId,title,description,signal,onStage}) {
 const {randomUUID}=require('node:crypto');
 const {WebSocket}=req('ws');
 const info=JSON.parse(await fs.readFile(path.join(config.studioData,'unity-bridge.json'),'utf8'));
 if(!/^[a-f\d]{48}$/.test(info.token||'')||!Number.isInteger(info.port)||info.port<1024||info.port>65535)throw Error('Cấu hình cầu nối Studio không hợp lệ.');
 const socket=new WebSocket(`ws://127.0.0.1:${info.port}/?token=${info.token}`);
 const pending=new Map();let closed=false;
 await new Promise((ok,no)=>{const timer=setTimeout(()=>{socket.terminate();no(Error('Cầu ảnh Studio chưa nối sau 10 giây.'));},10000);socket.once('open',()=>{clearTimeout(timer);ok();});socket.once('error',()=>{clearTimeout(timer);no(Error('Không nối được cầu ảnh của Studio.'));});});
 const id=randomUUID(),projectRoot=path.join(config.studioData,'projects'),folder=path.join(projectRoot,id);
 const call=(method,...args)=>new Promise((resolve,reject)=>{if(closed)return reject(Error('Cầu ảnh Studio đã đóng.'));const callId=randomUUID(),timer=setTimeout(()=>{pending.delete(callId);reject(Error('Studio chưa trả lời: '+method));},60000);pending.set(callId,{resolve,reject,timer});socket.send(JSON.stringify({id:callId,method,args}));});
 socket.on('message',raw=>{const msg=JSON.parse(raw);if(msg.event==='apps:images'&&msg.payload?.id===id){const stage=msg.payload.images?.run?.stage;if(stage)onStage(stage);}const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.ok?p.resolve(msg.result):p.reject(Error(msg.error||'Luồng ảnh báo lỗi.'));}});
 socket.on('error',()=>{});socket.on('close',()=>{closed=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Studio đóng cầu ảnh giữa chừng.'));}pending.clear();});
 let started=false,finished=false;
 try {
  const accountView=await call('apps:accounts');
  const plus=accountView.accounts.filter(a=>a.enabled!==false&&a.services?.includes('chatgpt')&&a.sites?.chatgpt?.plan==='Plus');
  if(!plus.length)throw Error('Studio chưa bật profile Plus cho tạo ảnh.');
  if(plus.some(a=>a.busy>0))throw Error('Luồng Plus trong Studio đang có việc. Chờ việc ảnh hiện tại xong rồi tạo bìa.');
  await fs.mkdir(folder,{recursive:false});
  const project={schemaVersion:1,id,title,singer:'',genre:'Tranh bìa truyện võng du cổ phong vui nhộn',themes:['Tháp phòng','Lăng Tiêu Thành','Thanh Minh Vân Hải'],languages:['Việt'],lyrics:'',audio:{path:'',duration:0,hash:id},source:{kind:'external-truyen-la'},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await fs.writeFile(path.join(folder,'project.json'),JSON.stringify(project));
  await fs.writeFile(path.join(folder,'truyen-la-owner.json'),JSON.stringify({id,owner:'AI Truyen La'}));
  await fs.writeFile(ledgerFile(config,bookId),JSON.stringify({id,title,at:new Date().toISOString()}));
  const theme=`Create premium fantasy NOVEL COVER ART, no music or musical instruments. Story title: ${title}. ${description}. A spectacular ancient Chinese city floating above an ocean of luminous clouds, whimsical defense towers, a fully clothed adult male city lord with a mischievous smile, jade emerald and warm gold, peach sunrise. Rich painterly cinematic illustration, intricate architectural silhouettes, playful adventurous mood, original characters only. Keep the strongest subject in the central 2:3 area of the landscape composition, allow gentle scenery on both sides. No text, no logos, no watermarks. The fifth variation should be the strongest iconic book-cover composition.`;
  onStage('Studio đang tạo 5 phương án bìa bằng ChatGPT Plus');
  await call('apps:images-generate',id,{adapterId:'chatgpt',theme});started=true;
  const end=Date.now()+720000;let snapshot;
  do{signal?.throwIfAborted();snapshot=await call('apps:images',id);if(!snapshot.run?.stage)break;onStage(snapshot.run.stage);await wait(2000);}while(Date.now()<end);
  if(snapshot.run?.stage)throw Error('Studio chưa tạo xong; bản việc được giữ trong kho backend để kiểm tra trước khi thử lại.');
  finished=true;
  const candidate=snapshot.candidates?.[0];if(!candidate)throw Error(snapshot.run?.errors?.[0]||snapshot.run?.error||'ChatGPT chưa trả file ảnh.');
  const payload=await call('apps:image-bytes',id,candidate.id);
  const bytes=Buffer.from(payload?.$bytes||'','base64');if(!bytes.length)throw Error('Studio chưa gửi được file bìa.');
  return {bytes,provider:'ChatGPT Plus · luồng ảnh Studio',renderId:id,prompt:theme};
 } finally {
  if(signal?.aborted&&started&&!finished)await call('apps:images-cancel',id).catch(()=>{});
  // Move only our marked temporary render record, after its image job has finished.
  if(finished){
   const marker=JSON.parse(await fs.readFile(path.join(folder,'truyen-la-owner.json'),'utf8'));
   if(marker.id===id&&marker.owner==='AI Truyen La'&&path.dirname(folder)===projectRoot){
    const imageFile=path.join(folder,'images.json');
    try{const imageState=JSON.parse(await fs.readFile(imageFile,'utf8'));for(const c of imageState.candidates||[])c.account='';await fs.writeFile(imageFile,JSON.stringify(imageState));}catch{}
    await archiveOwnedRender(config,id);
   }
  }
  socket.close();
 }
}
function makeCoverService({config,safeStorage,onStage=()=>{}}) {
 let active=false;
 return async function makeCover({bookId,title,description,signal}) {
  if(active)throw Error('Đang tạo một bìa truyện.');active=true;
  let hub,browser,borrowed=null;
  try {
   const req=createRequire(path.join(config.studioRoot,'package.json'));
   const recovered=await recoverSavedCover({config,bookId,title,onStage});if(recovered)return recovered;
   const {ExtensionHub,PORT}=req('./desktop/apps/extension-hub.cjs');
   if(await portBusy(PORT))return await sharedCover({config,req,bookId,title,description,signal,onStage});
   const {AccountBook}=req('./desktop/apps/accounts.cjs');
   const {extensionAdapter}=req('./desktop/apps/images/adapters.cjs');
   browser=req('./desktop/apps/browser-profiles.cjs');
   hub=new ExtensionHub({directory:config.studioData,sourceDirectory:path.join(config.studioRoot,'desktop','extension')});
   await hub.start();
   const accounts=new AccountBook({directory:config.studioData,safeStorage,hub});
   const book=await accounts.read();
   const options=book.accounts.filter(a=>a.enabled!==false&&a.services?.includes('chatgpt')&&a.sites?.chatgpt?.plan==='Plus'&&a.profileDir);
   if(!options.length)throw Error('Sổ tài khoản chưa có profile ChatGPT Plus được bật cho tạo ảnh. Kiểm tra trong Studio.');
   onStage('Đang nối luồng ChatGPT Plus');await wait(1800);
   const account=options.find(a=>hub.online(a.id))||options[0];
   if(!hub.online(account.id)) {
    borrowed=account;browser.wake(account.profileDir);
    for(let i=0;i<60&&!hub.online(account.id);i++){signal?.throwIfAborted();await wait(500);}
   }
   if(!hub.online(account.id))throw Error('Tiện ích chưa nối về từ profile Plus.');
   if(hub.outdated(account.id)){await wait(2000);for(let i=0;i<30&&(!hub.online(account.id)||hub.outdated(account.id));i++)await wait(500);}
   if(!hub.online(account.id)||hub.outdated(account.id))throw Error('Tiện ích chưa cập nhật xong; thử lại sau.');
   const threadFile=path.join(config.dataRoot,'cover-thread.local.json');
   let threads={};try{threads=JSON.parse(await fs.readFile(threadFile,'utf8'))}catch{}
   const filtered={ready:async()=>[account],thread:async()=>threads[account.id]||null,setThread:async(id,service,n,url)=>{threads[id]=url;await fs.writeFile(threadFile,JSON.stringify(threads));}};
   const adapter=extensionAdapter({service:'chatgpt',hub,accounts:filtered,parallel:1});
   const prompt=`Create ONE premium illustrated fantasy novel book cover, portrait 2:3, visually gorgeous and legible as a small thumbnail. Novel title: ${JSON.stringify(title)}. Story brief: ${JSON.stringify(description)}. For Ta Hỗn Độn Thành: a spectacular ancient Chinese floating city above an ocean of pearlescent clouds, elegant jade-green and gold defense towers with whimsical tiny creatures, a confident smiling fully clothed adult male city lord in the foreground, playful adventurous mood. Painterly cinematic key art, intricate atmospheric worldbuilding, emerald/teal shadows, warm peach sunrise and luminous gold, exceptional depth and rich texture, elegant composition, no existing game/anime characters. Leave safe margins. Tasteful large Vietnamese title typography with exact accents, title only, no extra subtitles, no logos, no watermark. Generate the actual image now.`;
   const [result]=await adapter.generate({jobs:[{prompt,ratio:'2:3',count:1}],signal,onStage});
   if(!result?.data)throw Error(result?.error||'ChatGPT chưa trả file ảnh.');
   return {bytes:result.data,provider:'ChatGPT Plus · tiện ích Studio',prompt};
  } finally {
   if(borrowed&&hub){hub.closeProfile(borrowed.id);hub.closeMarks(borrowed.id);await wait(1500);browser.sleep(borrowed.profileDir);}
   if(hub)await hub.close().catch(()=>{});
   active=false;
  }
 };
}
module.exports={makeCoverService};
