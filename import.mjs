import {splitChapters,readEpub} from './parser.mjs';
function clean(value,max){if(typeof value!=='string'||value.length>max)throw Error('Nội dung trong file không hợp lệ hoặc quá dài.');return value;}
export function normalizeBook(raw,fallback='Truyện mới'){
 const data=raw.chapterData||raw.chapters;
 if(!Array.isArray(data)||!data.length||data.length>10000)throw Error('Truyện cần có từ 1 đến 10.000 chương.');
 const chapters=data.map((c,i)=>({title:clean(c.translatedTitle||c.title||`Chương ${i+1}`,500),source:clean(c.source||'',20000000),translation:clean(c.translation||'',20000000)}));
 if(chapters.some(c=>!(c.translation||c.source).trim()))throw Error('File có chương trống. Chưa nhập để tránh mất nội dung.');
 const cover=typeof raw.cover==='string'&&raw.cover.length<10000000&&/^[A-Za-z0-9+/=]+$/.test(raw.cover)?raw.cover:'';
 return {id:crypto.randomUUID(),title:clean(raw.title||fallback,500),author:clean(raw.author||'',300),chapters,cover,bookmark:Number.isInteger(raw.bookmark)?Math.max(0,Math.min(raw.bookmark,chapters.length-1)):0,addedAt:new Date().toISOString()};
}
export async function importFile(file){
 if(!file||file.size>150000000)throw Error('File tối đa 150 MB; TXT/EPUB tối đa 50 MB.');
 const name=file.name.replace(/\.[^.]+$/,'');
 if(/\.json$/i.test(file.name)){const data=JSON.parse(await file.text());if(!['ai-truyen-la','truyen-la-web'].includes(data.format)||data.version!==1||!Array.isArray(data.books)||!data.books.length||data.books.length>200)throw Error('Chọn bản sao lưu JSON của Truyện Lạ.');return data.books.map(b=>normalizeBook(b));}
 if(file.size>50000000)throw Error('TXT/EPUB tối đa 50 MB.');
 const bytes=await file.arrayBuffer();
 if(/\.epub$/i.test(file.name))return [normalizeBook(await readEpub(bytes),name)];
 if(/\.txt$/i.test(file.name)){let content;try{content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('TXT cần mã hóa UTF-8. Dùng chức năng Xuất TXT trong app máy tính.');}return [normalizeBook({title:name,chapters:splitChapters(content)})];}
 throw Error('Chọn TXT, EPUB hoặc JSON sao lưu Truyện Lạ.');
}
