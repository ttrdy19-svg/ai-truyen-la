const {app,BrowserWindow,dialog,safeStorage,nativeImage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {createRequire}=require('node:module');
const {pathToFileURL}=require('node:url');
const root=__dirname,config=JSON.parse(fs.readFileSync(path.join(root,'config.local.json'),'utf8'));
config.studioData||=path.join(app.getPath('appData'),'ai-manor-studio');
config.dataRoot||=path.join(root,'AI Du Lieu');
app.setPath('userData',path.join(config.dataRoot,'AI Electron'));
if(!app.requestSingleInstanceLock()){app.quit();return;}
let win,service;
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.whenReady().then(async()=>{
 const {createServer}=await import(pathToFileURL(path.join(root,'server.mjs')));
 const {makeCoverService}=require('./cover.cjs');
 const studioRequire=createRequire(path.join(config.studioRoot,'package.json'));
 let keyPromise;
 const keyProvider=()=>keyPromise||=(async()=>{
  try {const saved=safeStorage.decryptString(fs.readFileSync(path.join(config.studioData,'gemini-api-key.bin')));if(saved)return saved;}catch{}
  try {const {AccountBook}=studioRequire('./desktop/apps/accounts.cjs');const keys=await new AccountBook({directory:config.studioData,safeStorage,hub:null}).geminiKeys();if(keys[0])return keys[0];}catch{}
  return studioRequire('./desktop/key-pool.cjs').loadGeminiKeys()[0]||null;
 })();
 let stage=()=>{};
 const cover=makeCoverService({config,safeStorage,onStage:s=>stage(s)});
 service=await createServer({root,config,keyProvider,cover:async request=>{
  stage=request.onStage;
  const result=await cover(request);
  const image=nativeImage.createFromBuffer(result.bytes);if(image.isEmpty())throw Error('File ảnh ChatGPT không đọc được.');
  result.bytes=image.toPNG();result.width=image.getSize().width;result.height=image.getSize().height;return result;
 }});
 if(process.argv.includes('--background-model-check')){
  const state=await(await fetch(service.url+'/api/state')).json();
  const response=await fetch(service.url+'/api/test-model',{method:'POST',headers:{'content-type':'application/json','x-app-token':state.token},body:'{}'});
  const result=await response.json();fs.writeFileSync(path.join(config.dataRoot,'google-status.json'),JSON.stringify({status:response.status,...result,at:new Date().toISOString()},null,2));app.quit();return;
 }
 if(process.argv.includes('--background-cover')){service.startCover('ta-hon-don-thanh');await service.waitForCover();app.quit();return;}
 win=new BrowserWindow({width:1380,height:900,minWidth:900,minHeight:650,title:'Truyện Lạ · Kho truyện của Chú Lạ',backgroundColor:'#f5f2eb',show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(service.url+'/'))event.preventDefault();});
 fs.writeFileSync(path.join(config.dataRoot,'runtime.local.json'),JSON.stringify({url:service.url,pid:process.pid}));
 win.setMenuBarVisibility(false);win.once('ready-to-show',()=>win.show());await win.loadURL(service.url);win.show();
 if(process.argv.includes('--create-cover'))service.startCover('ta-hon-don-thanh');
}).catch(e=>{dialog.showErrorBox('Truyện Lạ',String(e.message).replace(/AIza[\w-]+/g,'[đã ẩn]'));app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>service?.stop());
