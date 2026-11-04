const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {createRequire}=require('node:module');
const assert=require('node:assert/strict');
(async()=>{
 const own=__dirname,req=createRequire('D:/AI Duy TTD Studio/package.json'),{JSDOM}=req('jsdom');
 const {createServer}=await import(pathToFileURL(path.join(own,'server.mjs')));
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'AI-Truyen-La-DOM-'));
 let service,dom;
 try {
  const gemini={models:async()=>[{id:'gemini-3.6-flash',name:'Flash text'}],generate:async()=>({text:'Lâm An đứng trên mây.',model:'gemini-3.6-flash'}),translate:async()=>({text:'Chương 1 — Thành phố trên mây\n\nLâm An nhìn tháp, cười: “Tháp nhỏ thì nhỏ, khí thế vẫn phải lớn.”',model:'gemini-3.6-flash'})};
  service=await createServer({root:own,config:{studioRoot:'D:/AI Duy TTD Studio',dataRoot:data},gemini,keyProvider:()=> 'private-test-key'});
  dom=new JSDOM(fs.readFileSync(path.join(own,'index.html'),'utf8'),{url:service.url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.fetch=(url,opts)=>fetch(new URL(url,service.url),opts);w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  const errors=[];w.addEventListener('error',e=>errors.push(e.message));
  const source=fs.readFileSync(path.join(own,'app.js'),'utf8');await w.eval('(async()=>{'+source+'})()');
  const $=s=>w.document.querySelector(s),click=s=>$(s).click();
  const until=async(predicate)=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('DOM wait timeout');};
  assert.match($('#featured').textContent,/Ta Hỗn Độn Thành/);click('#openSettings');assert.ok($('#settingsDialog').open);click('#testModel');await until(()=>$('#modelResult').textContent.includes('Đã xác nhận'));$('#settingsDialog').close();
  const state=await(await fetch(service.url+'/api/state')).json();
  const r=await fetch(service.url+'/api/import',{method:'POST',headers:{'content-type':'application/json','x-app-token':state.token},body:JSON.stringify({filename:'Truyen-tu-viet.txt',title:'Mây nhỏ — truyện thử',author:'Chú Lạ',base64:Buffer.from('第1章 云上小城\n林安看着小箭塔，笑了。\n第2章 清晨\n云散了。').toString('base64')})});const b=await r.json();assert.equal(b.chapters.length,2);
  await until(()=>{click('[data-view="library"]');return $('#bookGrid').textContent.includes('Mây nhỏ');});
  click('[data-action="select"][data-id="'+b.id+'"]');await until(()=>$('#featured').textContent.includes('Mây nhỏ'));click('#featured [data-action="work"]');await until(()=>$('#workBook').value===b.id&&$('#workSummary').textContent.includes('2 chương'));
  click('#translateOne');await until(()=>$('#jobCard').textContent.includes('ĐÃ LƯU LƯỢT DỊCH'));click('#workRead');await until(()=>!$('#reader').hidden&&$('#readingText').textContent.includes('Lâm An'));assert.match($('#chapterTitle').textContent,/Thành phố trên mây/);
  click('#fontChoice');assert.ok($('#fontDialog').open);assert.ok($('#readerFont').querySelectorAll('option').length>=5);
  const pick=$('#readerFont').querySelector('optgroup[label="Kho Duy TTD"] option')||$('#readerFont').querySelector('option[value="system-segoe"]');
  $('#readerFont').value=pick.value;$('#readerFont').dispatchEvent(new w.Event('change'));click('#fontSizeUp');click('#fontSizeUp');click('#fontSizeDown');
  await until(()=>$('#fontSaveStatus').textContent.includes('Đã lưu'));assert.equal($('#fontSizeValue').textContent,'22 px');assert.ok(w.document.documentElement.style.getPropertyValue('--reader-family'));
  assert.deepEqual(await(await fetch(service.url+'/api/reader-settings')).json(),{fontId:pick.value,size:22});$('#fontDialog').close();
  $('#readMode').value='parallel';$('#readMode').dispatchEvent(new w.Event('change'));assert.match($('#readingText').textContent,/林安/);assert.match($('#readingText').textContent,/Lâm An/);
  click('#editChapter');$('#editChapterText').value='Bản đã sửa, đọc mượt hơn.';click('#saveChapter');await until(()=>$('#readingText').textContent.includes('Bản đã sửa'));click('#nextChapter');await until(()=>$('#chapterMeta').textContent.includes('CHƯƠNG 2'));
  const original=service.store.chapter(b.id,0).source;assert.match(original,/林安/);assert.equal(service.store.chapter(b.id,0).history.length,1);await until(()=>service.store.book(b.id).bookmark===1);
  assert.equal(errors.length,0);console.log('PASS DOM: library, model mock, import, translate mock, reader, font dialog/preview, rapid font-size saves, parallel, manual edits, bookmark; no JS errors.');
 }finally{dom?.window.close();service?.stop();fs.rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
