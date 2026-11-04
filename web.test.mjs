import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readEpub,splitChapters} from './web/parser.mjs';
import {normalizeBook,importFile} from './web/import.mjs';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
function zip(entries){const chunks=[],dirs=[];let offset=0;for(const [name,source] of Object.entries(entries)){const n=Buffer.from(name),raw=Buffer.from(source),data=deflateRawSync(raw),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(8,8);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(n.length,26);chunks.push(h,n,data);const d=Buffer.alloc(46);d.writeUInt32LE(0x02014b50);d.writeUInt16LE(8,10);d.writeUInt32LE(data.length,20);d.writeUInt32LE(raw.length,24);d.writeUInt16LE(n.length,28);d.writeUInt32LE(offset,42);dirs.push(d,n);offset+=h.length+n.length+data.length;}const c=Buffer.concat(dirs),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(c.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,c,end]);}
test('Browser EPUB: real DEFLATE, single-page headings, TOC exclusion and Vietnamese text preserved',async()=>{
 const data=zip({'META-INF/container.xml':'<container><rootfile full-path="OPS/content.opf"/></container>','OPS/content.opf':'<dc:title>Mây nhỏ</dc:title><dc:language>vi</dc:language><manifest><item id="a" href="text/a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine>','OPS/text/a.xhtml':'<html><body><nav><h2><a href="#one">Chương 1: Mây</a></h2></nav><h2 id="one">Chương 1: Mây</h2><p>Mây trắng bay.</p><h2>Chương 2: Nắng</h2><p>Nắng &amp; gió.</p></body></html>'});
 const book=await readEpub(data);assert.equal(book.title,'Mây nhỏ');assert.equal(book.chapters.length,2);assert.equal(book.chapters[0].source,'Mây trắng bay.');assert.equal(book.chapters[1].source,'Nắng & gió.');await assert.rejects(readEpub(new Uint8Array([1,2,3])),/EPUB/);
});
test('Mobile imports TXT and desktop/web backups; preserves translation, clamps bookmarks, rejects empty chapters',async()=>{
 const raw={title:'Tự viết',bookmark:9,chapterData:[{title:'原文',source:'你好',translation:'Xin chào',translatedTitle:'Chào'}]};const book=normalizeBook(raw);assert.equal(book.bookmark,0);assert.equal(book.chapters[0].title,'Chào');assert.equal(book.chapters[0].translation,'Xin chào');assert.equal(book.chapters[0].source,'你好');assert.throws(()=>normalizeBook({chapters:[{source:''}]}),/trống/);
 const file=new Blob(['Chương 1: Mây\nMây bay.\nChương 2: Nắng\nNắng lên.']);file.name='Truyen.txt';const imported=await importFile(file);assert.equal(imported[0].chapters.length,2);assert.equal(imported[0].title,'Truyen');assert.equal(splitChapters('Không có tiêu đề.')[0].source,'Không có tiêu đề.');
 const backup=new Blob([JSON.stringify({format:'ai-truyen-la',version:1,books:[raw]})]);backup.name='backup.json';assert.equal((await importFile(backup))[0].chapters[0].translation,'Xin chào');
});

test('Offline worker caches app and bundled fonts; serves reader and fonts after the network is gone',async()=>{
 const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'web'),scope='https://example.test/ai-truyen-la/',events=new Map(),stored=new Map();let disconnected=false;
 const address=request=>typeof request==='string'?request:request.href||request.url;
 const fetcher=async request=>{if(disconnected)throw Error('offline');const url=new URL(address(request)),file=url.pathname.slice('/ai-truyen-la/'.length)||'index.html';return new Response(fs.readFileSync(path.join(root,file)));};
 const cache={addAll:async urls=>{for(const url of urls)stored.set(url,await fetcher(url));}};
 const caches={open:async()=>cache,keys:async()=>['truyen-la-v1'],delete:async()=>true,match:async request=>stored.get(address(request))?.clone()};
 const self={registration:{scope},addEventListener:(name,fn)=>events.set(name,fn),skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[]}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),{self,caches,fetch:fetcher,URL});let pending;events.get('install')({waitUntil:p=>pending=p});await pending;events.get('activate')({waitUntil:p=>pending=p});await pending;
 assert.ok(stored.size>50);disconnected=true;let response;events.get('fetch')({request:{url:scope,method:'GET',mode:'navigate'},respondWith:p=>response=p});assert.match(await(await response).text(),/Truyện Lạ/);
 const fonts=JSON.parse(fs.readFileSync(path.join(root,'fonts.json'),'utf8')).fonts.filter(f=>f.source==='studio');assert.equal(fonts.length,45);events.get('fetch')({request:{url:scope+fonts[0].url,method:'GET',mode:'cors'},respondWith:p=>response=p});assert.ok((await(await response).arrayBuffer()).byteLength>10000);
});
