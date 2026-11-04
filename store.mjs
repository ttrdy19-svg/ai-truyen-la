import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {splitChapters,splitChunks,text,defaultGlossary,defaultStyle,readEpub} from './core.mjs';
export function atomic(file,value) {fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.partial';fs.writeFileSync(temp,JSON.stringify(value,null,2),'utf8');fs.renameSync(temp,file);}
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export class Store {
 constructor(root) {this.root=root;fs.mkdirSync(root,{recursive:true});if(!fs.existsSync(this.bookFile('ta-hon-don-thanh')))this.create({id:'ta-hon-don-thanh',title:'Ta Hỗn Độn Thành',author:'Lăng Hư Nguyệt Ảnh',description:'Lý Hán Cường xây thành, đặt những tòa tháp kỳ quặc và chống từng đợt quái vật. Một cuộc phiêu lưu võng du hài hước giữa Lăng Tiêu Thành và biển mây.',sourceUrl:'https://123truyen.vn/ta-hon-don-thanh',glossary:defaultGlossary,chapters:[]});}
 folder(id) {if(!/^[a-z\d-]{1,64}$/.test(id||''))throw Error('Mã truyện không hợp lệ.');return path.join(this.root,id);}
 bookFile(id) {return path.join(this.folder(id),'book.json');}
 book(id) {return read(this.bookFile(id));}
 save(book) {book.updatedAt=new Date().toISOString();atomic(this.bookFile(book.id),book);return book;}
 chapterFile(id,index) {const b=this.book(id);if(!Number.isInteger(index)||index<0||index>=b.chapters.length)throw Error('Không có chương này.');return path.join(this.folder(id),'chapters',index+'.json');}
 chapter(id,index) {return read(this.chapterFile(id,index));}
 saveChapter(id,index,c) {c.updatedAt=new Date().toISOString();atomic(this.chapterFile(id,index),c);const b=this.book(id);b.chapters[index]={title:c.title,translatedTitle:c.translatedTitle||'',status:c.status,parts:c.parts?.length||0,done:c.parts?.filter(p=>p.translation).length||0,chars:c.source.length};this.save(b);return c;}
 list() {return fs.readdirSync(this.root,{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(this.bookFile(d.name))).map(d=>this.book(d.name)).map(b=>({...b,chapters:undefined,total:b.chapters.length,done:b.chapters.filter(c=>c.status==='done').length,chars:b.chapters.reduce((s,c)=>s+c.chars,0)})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 create(input) {
  const id=input.id||randomUUID();if(fs.existsSync(this.bookFile(id)))throw Error('Truyện này đã tồn tại.');
  const chapters=input.chapters||[];if(chapters.length>10000)throw Error('Tối đa 10.000 chương mỗi truyện.');
  const b={id,title:text(input.title||'Truyện mới',300),author:text(input.author||'',200),description:text(input.description||'',3000),sourceUrl:text(input.sourceUrl||'',2000),glossary:text(input.glossary??'',20000),style:text(input.style||defaultStyle,5000),createdAt:new Date().toISOString(),bookmark:0,chapters:[]};
  fs.mkdirSync(path.join(this.folder(id),'chapters'),{recursive:true});
  const vietnamese=input.asVietnamese===true||/^vi(?:-|$)/i.test(input.language||'');
  chapters.forEach((raw,index)=>{const source=text(raw.source);if(!source)throw Error('Chương rỗng: '+(index+1));const c={title:text(raw.title||`Chương ${index+1}`,300),source,status:vietnamese?'done':'pending',translation:vietnamese?source:'',origin:vietnamese?'imported-vietnamese':'imported-source',parts:[]};atomic(path.join(this.folder(id),'chapters',index+'.json'),c);b.chapters.push({title:c.title,status:c.status,done:0,parts:0,chars:source.length});});
  b.importInfo={filename:String(input.filename||'').slice(0,300),language:input.language||'',asVietnamese:vietnamese};
  return this.save(b);
 }
 importFile(input) {
  const bytes=Buffer.from(input.base64||'','base64');if(!bytes.length||bytes.length>50000000)throw Error('File tối đa 50 MB.');
  let parsed;
  if(/\.epub$/i.test(input.filename))parsed=readEpub(bytes);
  else if(/\.txt$/i.test(input.filename)){const enc=['utf-8','gb18030','utf-16le'].includes(input.encoding)?input.encoding:'utf-8';const raw=new TextDecoder(enc,{fatal:true}).decode(bytes);parsed={chapters:splitChapters(raw)};}
  else throw Error('Chọn file TXT hoặc EPUB.');
  const b=this.create({...parsed,filename:input.filename,asVietnamese:input.asVietnamese===true,title:input.title||parsed.title||input.filename.replace(/\.[^.]+$/,''),author:input.author||parsed.author||'',description:input.description||'',glossary:input.glossary||''});
  return b;
 }
 attach(id,input) {
  const b=this.book(id);if(b.chapters.length)throw Error('Truyện đã có chương. Nhập thành truyện mới để giữ bản gốc.');
  const bytes=Buffer.from(input.base64||'','base64');if(!bytes.length||bytes.length>50000000)throw Error('File tối đa 50 MB.');
  const parsed=/\.epub$/i.test(input.filename)?readEpub(bytes):/\.txt$/i.test(input.filename)?{chapters:splitChapters(new TextDecoder(input.encoding||'utf-8',{fatal:true}).decode(bytes))}:null;
  const chapters=parsed?.chapters,vietnamese=input.asVietnamese===true||/^vi(?:-|$)/i.test(parsed?.language||'');
  if(!chapters||chapters.length>10000)throw Error('Chọn TXT/EPUB, tối đa 10.000 chương.');
  chapters.forEach((raw,index)=>{const c={title:raw.title,source:raw.source,status:vietnamese?'done':'pending',translation:vietnamese?raw.source:'',origin:vietnamese?'imported-vietnamese':'imported-source',parts:[]};atomic(path.join(this.folder(id),'chapters',index+'.json'),c);b.chapters.push({title:c.title,status:c.status,done:0,parts:0,chars:c.source.length});});
  b.importInfo={filename:String(input.filename).slice(0,300),sha256:createHash('sha256').update(bytes).digest('hex'),language:parsed?.language||'',asVietnamese:vietnamese,importedAt:new Date().toISOString()};
  return this.save(b);
 }
 patch(id,patch) {const b=this.book(id);for(const [key,max] of Object.entries({title:300,author:200,description:3000,glossary:20000,style:5000,sourceUrl:2000}))if(patch[key]!==undefined)b[key]=text(patch[key],max);if(Number.isInteger(patch.bookmark)&&patch.bookmark>=0&&patch.bookmark<b.chapters.length)b.bookmark=patch.bookmark;return this.save(b);}
 backup() {return {format:'ai-truyen-la',version:1,at:new Date().toISOString(),books:this.list().map(summary=>{const book=this.book(summary.id);return {...book,chapterData:book.chapters.map((_,i)=>this.chapter(book.id,i)),cover:fs.existsSync(path.join(this.folder(book.id),'cover.png'))?fs.readFileSync(path.join(this.folder(book.id),'cover.png')).toString('base64'):null};})};}
 restore(payload) {
  if(payload?.format!=='ai-truyen-la'||payload.version!==1||!Array.isArray(payload.books)||payload.books.length>200)throw Error('File sao lưu không hợp lệ.');
  // Validate the complete import before writing, and create new IDs to preserve existing books.
  const entries=payload.books.map(raw=>{if(!Array.isArray(raw.chapterData)||raw.chapterData.length>10000)throw Error('Sao lưu thiếu chương.');text(raw.title,300);raw.chapterData.forEach(c=>{text(c.source);text(c.translation||'');text(c.title,300);if(c.status==='done'&&!c.translation?.trim())throw Error('Chương đã dịch nhưng nội dung trống.');});if(raw.cover&&(!/^iVBOR/.test(raw.cover)||raw.cover.length>40000000))throw Error('Ảnh sao lưu không hợp lệ.');return raw;});
  return entries.map(raw=>{const b=this.create({...raw,id:randomUUID(),chapters:raw.chapterData});raw.chapterData.forEach((c,i)=>{const validParts=Array.isArray(c.parts)&&c.parts.every(p=>typeof p.source==='string'&&typeof p.translation==='string')&&c.parts.map(p=>p.source).join('')===c.source;this.saveChapter(b.id,i,{title:c.title,translatedTitle:c.translatedTitle||'',source:c.source,translation:c.translation||'',status:c.status==='done'?'done':validParts&&c.parts.some(p=>p.translation)?'partial':'pending',parts:validParts?c.parts:[],fingerprint:/^[a-f\d]{64}$/.test(c.fingerprint||'')?c.fingerprint:undefined,history:Array.isArray(c.history)?c.history.slice(-5):[]});});if(raw.cover){fs.writeFileSync(path.join(this.folder(b.id),'cover.png'),Buffer.from(raw.cover,'base64'));const saved=this.book(b.id);saved.cover=raw.cover?{provider:raw.coverProvider||'Ảnh khôi phục',at:new Date().toISOString()}:undefined;this.save(saved);}return this.book(b.id);});
 }
}
export class Translator {
 constructor(store,gemini,getModel,getDelay=()=>0) {Object.assign(this,{store,gemini,getModel,getDelay});this.current=null;this.last=null;this.lastRequestAt=0;}
 status() {return this.current?{...this.current,controller:undefined,task:undefined}:this.last||{state:'idle'};}
 start(id,{from=0,count=1}={}) {
  if(this.current)throw Error('Đang dịch một truyện. Tạm dừng trước khi mở lượt khác.');
  const book=this.store.book(id),model=this.getModel();if(!book.chapters.length)throw Error('Nhập file truyện trước.');
  if(!Number.isInteger(from)||from<0||from>=book.chapters.length||!Number.isInteger(count)||count<1)throw Error('Khoảng chương không hợp lệ.');
  const end=Math.min(book.chapters.length,from+count),controller=new AbortController();
  const job={id,state:'running',model,from,end,chapter:from,part:0,parts:0,completed:0,startedAt:new Date().toISOString(),controller};this.current=job;
  job.task=this.run(job,structuredClone(book)).catch(e=>{job.state=controller.signal.aborted?'paused':'error';job.error=controller.signal.aborted?'Đã tạm dừng; phần đã lưu được giữ lại.':String(e.message);}).finally(()=>{this.last={...job,controller:undefined,task:undefined};this.current=null;});
  return this.status();
 }
 async run(job,book) {
  const signal=job.controller.signal, fingerprint=createHash('sha256').update(book.style+'\n'+book.glossary+'\n'+job.model).digest('hex');
  for(let index=job.from;index<job.end;index++) {
   signal.throwIfAborted();job.chapter=index;const c=this.store.chapter(book.id,index);if(c.status==='done'){job.completed++;continue;}
   if(c.parts?.some(p=>p.translation)&&c.fingerprint!==fingerprint)throw Error('Bảng tên/phong cách/model đã đổi giữa chương. Hoàn tất chương với cấu hình cũ hoặc lưu bản sửa tay trước khi dịch tiếp.');
   if(!c.parts?.length)c.parts=splitChunks(c.source).map(source=>({source,translation:''}));c.fingerprint=fingerprint;c.status='partial';job.parts=c.parts.length;
   for(let n=0;n<c.parts.length;n++) {
    signal.throwIfAborted();job.part=n+1;if(c.parts[n].translation)continue;
    const context=c.parts.slice(0,n).map(p=>p.translation).join('\n\n')|| (index?this.store.chapter(book.id,index-1).translation.slice(-1600):'');
    const pause=this.lastRequestAt+this.getDelay()-Date.now();if(pause>0){job.waitingUntil=Date.now()+pause;await delay(pause,undefined,{signal});}job.waitingUntil=null;this.lastRequestAt=Date.now();
    const result=await this.gemini.translate(book,{...c,number:index+1},c.parts[n].source,context,signal,job.model,n===0);
    signal.throwIfAborted();let content=result.text;
    if(n===0){const heading=content.match(/^(Chương\s+\d+[^\n]{0,250})\n+([\s\S]+)$/i);if(heading){c.translatedTitle=heading[1].trim();content=heading[2].trim();}}
    c.parts[n].translation=content;c.parts[n].model=result.model;c.parts[n].at=new Date().toISOString();
    c.translation=c.parts.filter(p=>p.translation).map(p=>p.translation).join('\n\n');this.store.saveChapter(book.id,index,c);
   }
   c.status='done';c.model=job.model;this.store.saveChapter(book.id,index,c);job.completed++;
  }
  job.state='done';
 }
 pause() {if(this.current)this.current.controller.abort();return this.status();}
}
