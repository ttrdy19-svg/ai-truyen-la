import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';
import {splitChapters,splitChunks,readEpub,translationMessages} from './core.mjs';
import {Store,Translator} from './store.mjs';
import {Gemini} from './gemini.mjs';
import {createServer} from './server.mjs';
import {FontLibrary} from './fonts.mjs';
import archiveModule from './archive-render.cjs';
const root=path.dirname(fileURLToPath(import.meta.url));
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'AI-Truyen-La-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return new Store(path.join(dir,'books'));}
function zip(entries){const chunks=[],dirs=[];let offset=0;for(const [name,source] of Object.entries(entries)){const n=Buffer.from(name),raw=Buffer.from(source),data=deflateRawSync(raw),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(8,8);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(n.length,26);chunks.push(h,n,data);const d=Buffer.alloc(46);d.writeUInt32LE(0x02014b50);d.writeUInt16LE(8,10);d.writeUInt32LE(data.length,20);d.writeUInt32LE(raw.length,24);d.writeUInt16LE(n.length,28);d.writeUInt32LE(offset,42);dirs.push(d,n);offset+=h.length+n.length+data.length;}const c=Buffer.concat(dirs),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(c.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,c,end]);}
test('TXT: Chinese/Vietnamese headings; chunks preserve every source character',()=>{
 const result=splitChapters('\uFEFFLời dẫn\r\n第001章 云海\r\n你好\r\n\r\nChương 2: Trở lại\r\nĐọc tiếp.');assert.equal(result.length,3);assert.equal(result[1].title,'第001章 云海');assert.equal(result[2].source,'Đọc tiếp.');
 for(const source of ['云'.repeat(14000),'😀'.repeat(4000),('第一行\n\n第二行。\n').repeat(1200)]){const chunks=splitChunks(source);assert.equal(chunks.join(''),source);assert.ok(chunks.every(c=>c.length<=2500));assert.ok(chunks.every(c=>!/[\uD800-\uDBFF]$/.test(c)));}
});
test('EPUB: spine order, text, metadata, entities, invalid archives',()=>{
 const book=readEpub(zip({'META-INF/container.xml':'<container><rootfile full-path="OEBPS/content.opf"/></container>','OEBPS/content.opf':'<dc:title>Truyện &amp; mây</dc:title><dc:creator>Tác giả</dc:creator><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine>','OEBPS/a.xhtml':'<html><body><h1>Chương 2</h1><p>A &amp; B</p></body></html>','OEBPS/b.xhtml':'<html><body><h1>第1章</h1><script>bad()</script><p>你好</p></body></html>'}));
 assert.equal(book.title,'Truyện & mây');assert.equal(book.chapters[0].title,'第1章');assert.ok(!book.chapters[0].source.includes('bad'));assert.ok(book.chapters[1].source.includes('A & B'));assert.throws(()=>readEpub(Buffer.from('bad')));
});
test('Single-page Vietnamese EPUB: split real chapter headings, ignore linked TOC, ready to read without AI',t=>{
 const bytes=zip({'META-INF/container.xml':'<container><rootfile full-path="OPF/content.opf"/></container>','OPF/content.opf':'<dc:title>Truyện tự viết</dc:title><dc:language>vi</dc:language><manifest><item id="p" href="page.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="p"/></spine>','OPF/page.xhtml':'<html><body><h1>Truyện tự viết</h1><nav><h3><a href="#one">Chương 1: Mây</a></h3><h3><a href="#two">Chương 2: Nắng</a></h3></nav><h3 id="one">Chương 1: Mây</h3><h4>Biên tập: người viết</h4><p>Mây trắng bay.</p><h3 id="two">Chương 2: Nắng</h3><p>Nắng lên &amp; chim hót.</p></body></html>'});
 const parsed=readEpub(bytes);assert.equal(parsed.language,'vi');assert.equal(parsed.chapters.length,2);assert.equal(parsed.chapters[0].title,'Chương 1: Mây');assert.ok(parsed.chapters[0].source.includes('Mây trắng bay.'));assert.ok(!parsed.chapters[0].source.includes('Chương 2'));assert.ok(parsed.chapters[0].source.includes('Biên tập: người viết'));assert.equal(parsed.chapters[1].source,'Nắng lên & chim hót.');
 const store=fixture(t);const b=store.attach('ta-hon-don-thanh',{filename:'test.epub',base64:bytes.toString('base64')});assert.equal(b.chapters.length,2);assert.equal(b.importInfo.asVietnamese,true);assert.match(b.importInfo.sha256,/^[a-f\d]{64}$/);const first=store.chapter(b.id,0);assert.equal(first.status,'done');assert.equal(first.origin,'imported-vietnamese');assert.equal(first.translation,first.source);assert.equal(store.list()[0].done,2);
});
test('Store: persistent original, backup/restore creates new IDs, path validation',t=>{
 const store=fixture(t),b=store.importFile({filename:'Mây.txt',title:'Truyện test',base64:Buffer.from('第1章 初见\n你好').toString('base64')});store.saveChapter(b.id,0,{...store.chapter(b.id,0),translation:'Xin chào',status:'done'});const restored=store.restore(store.backup());assert.ok(restored.length===2);assert.notEqual(restored[1].id,b.id);assert.equal(store.list().length,4);assert.equal(store.chapter(b.id,0).source,'你好');assert.throws(()=>store.book('../secret'));assert.throws(()=>store.restore({format:'bad'}));
});
test('Translator: pause, checkpoint, restart and skip completed chunks',async t=>{
 const store=fixture(t),b=store.create({title:'Test',chapters:[{title:'第1章',source:'云'.repeat(5600)}]});let calls=0,block=true;
 const api={translate:async(book,c,part,context,signal)=>{calls++;if(block&&calls===2)return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('abort')),{once:true}));return {text:'Bản Việt '+calls,model:'test'};}};
 const worker=new Translator(store,api,()=> 'gemini-3.6-flash');worker.start(b.id);const first=worker.current.task;
 for(let i=0;i<200&&calls<2;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls,2);worker.pause();await first;assert.equal(worker.status().state,'paused');assert.equal(store.chapter(b.id,0).parts.filter(p=>p.translation).length,1);
 block=false;worker.start(b.id);await worker.current.task;assert.equal(worker.status().state,'done');assert.equal(store.chapter(b.id,0).status,'done');assert.equal(calls,4);worker.start(b.id);await worker.current.task;assert.equal(calls,4);
});
test('Translator rejects changed glossary mid chapter, preserves checkpoints on 429',async t=>{
 const store=fixture(t),b=store.create({title:'T',chapters:[{title:'1',source:'云'.repeat(5000)}]});let calls=0;const api={translate:async()=>{if(++calls>1)throw Error('429 hết hạn mức');return {text:'Đã lưu',model:'test'};}};const worker=new Translator(store,api,()=> 'gemini-3.6-flash');worker.start(b.id);await worker.current.task;assert.equal(worker.status().state,'error');assert.equal(store.chapter(b.id,0).translation,'Đã lưu');store.patch(b.id,{glossary:'云 = Vân'});worker.start(b.id);await worker.current.task;assert.match(worker.status().error,/đã đổi/);assert.equal(calls,2);
 const restored=store.restore(store.backup()).find(x=>x.title==='T');assert.equal(store.chapter(restored.id,0).parts[0].translation,'Đã lưu');
});
test('Gemini: correct endpoint, native system instruction, no thought leakage, reject truncation/429',async()=>{
 let sent;const api=new Gemini({getKey:()=> 'SECRET',fetchImpl:async(url,options)=>{sent={url,options};return {ok:true,json:async()=>({modelVersion:'gemini-3.6-flash',candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'ẩn'},{text:'Xin chào'}]}}]})};}});
 const result=await api.generate({model:'gemini-3.6-flash',messages:[{role:'system',content:'Tên theo Hán Việt'},{role:'user',content:'你好'}]});assert.equal(result.text,'Xin chào');assert.ok(sent.url.endsWith('gemini-3.6-flash:generateContent'));assert.equal(sent.options.headers['x-goog-api-key'],'SECRET');assert.ok(JSON.parse(sent.options.body).systemInstruction);assert.throws(()=>translationMessages({},null,'x',''),TypeError);
 api.fetch=async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'bị cắt'}]}}]})});await assert.rejects(api.generate({model:'gemini-3.6-flash',messages:[{content:'a'}]}),/chưa trả bản dịch đầy đủ/);
 api.fetch=async()=>({ok:false,status:429,json:async()=>({})});await assert.rejects(api.generate({model:'gemini-3.6-flash',messages:[{content:'a'}]}),/không đổi key/);
 await assert.rejects(api.generate({model:'gemini-3.1-flash-image',messages:[]}),/model ảnh/);
});
test('HTTP: library, CSRF, import, model check, translate, bookmark while running, exports',async t=>{
 const store=fixture(t),gemini={models:async()=>[{id:'gemini-3.6-flash'}],generate:async()=>({text:'Mẫu thử',model:'gemini-3.6-flash'}),translate:async()=>({text:'Xin chào',model:'gemini-3.6-flash'})};
 const service=await createServer({root,config:{dataRoot:path.dirname(store.root),studioRoot:root},store,gemini,keyProvider:()=> 'PRIVATE_KEY'});t.after(()=>service.stop());
 const state=await(await fetch(service.url+'/api/state')).json();assert.equal(state.books[0].total,0);assert.ok(!JSON.stringify(state).includes('PRIVATE_KEY'));
 assert.equal((await fetch(service.url+'/api/settings',{method:'POST',body:'{}'})).status,403);
 const post=async(route,input)=>{const r=await fetch(service.url+route,{method:'POST',headers:{'content-type':'application/json','x-app-token':state.token},body:JSON.stringify(input)});return {status:r.status,j:await r.json()};};
 const b=(await post('/api/import',{filename:'T.txt',title:'HTTP',base64:Buffer.from('第1章 你好\nHello').toString('base64')})).j;
 assert.equal((await post('/api/books/'+b.id+'/translate',{from:0,count:1})).status,400);await post('/api/test-model',{});assert.equal((await post('/api/books/'+b.id+'/translate',{from:0,count:1})).status,200);if(service.translator.current)await service.translator.current.task;
 assert.equal(store.chapter(b.id,0).translation,'Xin chào');assert.match(await(await fetch(service.url+'/api/books/'+b.id+'/export')).text(),/Xin chào/);
 const foreign=await fetch(service.url+'/api/settings',{method:'POST',headers:{'x-app-token':state.token,origin:'https://evil.test'},body:'{}'});assert.equal(foreign.status,403);
 assert.equal((await fetch(service.url+'/')).status,200);assert.equal((await fetch(service.url+'/app.js')).status,200);
 const back=await(await fetch(service.url+'/api/backup')).json();assert.equal(back.format,'ai-truyen-la');assert.ok(!JSON.stringify(back).includes('PRIVATE_KEY'));
});
test('Shared fonts: prefer Regular, serve only catalog assets, persist reader choices across server restarts',async t=>{
 const store=fixture(t),dataRoot=path.dirname(store.root),fontDirectory=path.join(dataRoot,'fonts');fs.mkdirSync(fontDirectory);
 fs.writeFileSync(path.join(fontDirectory,'Sample-Bold.ttf'),'bold');fs.writeFileSync(path.join(fontDirectory,'Sample-Regular.ttf'),'regular-bytes');fs.writeFileSync(path.join(dataRoot,'outside.ttf'),'private');
 fs.writeFileSync(path.join(fontDirectory,'danh-sach.json'),JSON.stringify([null,{ten:'Sample Việt',file:'Sample-Bold.ttf'},{ten:'Escape',file:'../outside.ttf'},{ten:'Sample Việt',file:'Sample-Bold.ttf'}]));
 const library=new FontLibrary(()=>fontDirectory),catalog=library.catalog();assert.equal(catalog.sharedCount,1);const chosen=catalog.fonts.find(f=>f.source==='studio');assert.equal(library.asset(chosen.url).bytes.toString(),'regular-bytes');assert.equal(library.asset('/fonts/outside.ttf'),null);assert.match(library.css(),/@font-face/);assert.equal(new FontLibrary(()=>path.join(dataRoot,'missing')).catalog().sharedAvailable,false);
 let service;const start=()=>createServer({root,config:{dataRoot,studioRoot:root},store,keyProvider:()=>null,fontDirectory});t.after(()=>service?.stop());service=await start();
 const state=await(await fetch(service.url+'/api/state')).json(),post=input=>fetch(service.url+'/api/reader-settings',{method:'POST',headers:{'content-type':'application/json','x-app-token':state.token},body:JSON.stringify(input)});
 assert.equal((await(await fetch(service.url+'/api/fonts')).json()).sharedCount,1);assert.match(await(await fetch(service.url+'/fonts.css')).text(),new RegExp(chosen.cssFamily));const asset=await fetch(service.url+chosen.url);assert.equal(asset.headers.get('content-type'),'font/ttf');assert.equal(await asset.text(),'regular-bytes');assert.equal((await fetch(service.url+'/fonts/outside.ttf')).status,404);
 assert.equal((await fetch(service.url+'/api/reader-settings',{method:'POST',body:'{}'})).status,403);assert.equal((await post({fontId:'unknown'})).status,400);assert.equal((await post({size:33})).status,400);assert.equal((await post({size:20.5})).status,400);
 assert.equal((await post({fontId:chosen.id,size:25})).status,200);service.stop();service=await start();assert.deepEqual(await(await fetch(service.url+'/api/reader-settings')).json(),{fontId:chosen.id,size:25});
 fs.renameSync(fontDirectory,fontDirectory+'-offline');assert.deepEqual(await(await fetch(service.url+'/api/reader-settings')).json(),{fontId:'system-georgia',size:25});
});

test('Archive moves only its marked render, verifies all copies, and rejects unowned files',async t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'AI-Truyen-La-archive-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const config={studioData:path.join(base,'studio'),dataRoot:path.join(base,'app')},id='01234567-0123-0123-0123-012345678901',source=path.join(config.studioData,'projects',id);
 fs.mkdirSync(path.join(source,'images'),{recursive:true});fs.writeFileSync(path.join(source,'truyen-la-owner.json'),JSON.stringify({id,owner:'AI Truyen La'}));fs.writeFileSync(path.join(source,'images','a.png'),'original-binary');
 const target=await archiveModule.archiveOwnedRender(config,id);assert.equal(fs.readFileSync(path.join(target,'images','a.png'),'utf8'),'original-binary');assert.ok(!fs.existsSync(source));
 fs.mkdirSync(source);fs.writeFileSync(path.join(source,'truyen-la-owner.json'),JSON.stringify({id,owner:'Another app'}));await assert.rejects(archiveModule.archiveOwnedRender(config,id),/app khác/);assert.ok(fs.existsSync(source));
});
