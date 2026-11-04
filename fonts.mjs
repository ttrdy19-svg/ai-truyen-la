import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const systemFonts=[
 {id:'system-georgia',name:'Georgia',family:'Georgia, "Times New Roman", serif',source:'system'},
 {id:'system-times',name:'Times New Roman',family:'"Times New Roman", serif',source:'system'},
 {id:'system-segoe',name:'Segoe UI',family:'"Segoe UI", Arial, sans-serif',source:'system'},
 {id:'system-arial',name:'Arial',family:'Arial, sans-serif',source:'system'},
 {id:'system-tahoma',name:'Tahoma',family:'Tahoma, sans-serif',source:'system'},
];
export class FontLibrary {
 constructor(getDirectory){this.getDirectory=getDirectory;}
 catalog(){
  const fonts=[...systemFonts];this.files=new Map();let sharedAvailable=false;
  try{
   const root=fs.realpathSync(this.getDirectory()),manifest=JSON.parse(fs.readFileSync(path.join(root,'danh-sach.json'),'utf8').replace(/^\uFEFF/,''));
   if(!Array.isArray(manifest)||manifest.length>1000)throw Error('Danh sách font không hợp lệ.');
   const seen=new Set();
   for(const entry of manifest){
    if(!entry||typeof entry.ten!=='string'||!entry.ten.trim()||entry.ten.length>120||typeof entry.file!=='string'||!/^\.(?:ttf|otf|woff2?)$/i.test(path.extname(entry.file)))continue;
    if(seen.has(entry.ten))continue;
    const relative=entry.file.replace(/-(Bold|SemiBold|Medium)(\.ttf)$/i,'-Regular$2');
    let file=path.resolve(root,relative);if(!fs.existsSync(file))file=path.resolve(root,entry.file);
    const inside=p=>p.startsWith(root+path.sep)&&path.relative(root,p).split(path.sep).every(x=>x!=='..');
    if(!inside(file)||!fs.existsSync(file))continue;
    file=fs.realpathSync(file);if(!inside(file)||!fs.statSync(file).isFile()||fs.statSync(file).size>12000000)continue;
    const id='shared-'+createHash('sha256').update(entry.ten).digest('hex').slice(0,16),cssFamily='TruyenLa_'+id.slice(7),extension=path.extname(file).toLowerCase();
    const weight=entry.bienThe?'100 900':/bold/i.test(path.basename(file))?'700':'400';
    const font={id,name:entry.ten,family:`"${cssFamily}", "Segoe UI", sans-serif`,cssFamily,url:`/fonts/${id}${extension}`,source:'studio',weight};
    fonts.push(font);this.files.set(font.url,{file,extension});seen.add(entry.ten);
   }
   sharedAvailable=true;
  }catch{}
  return {fonts,sharedAvailable,sharedCount:fonts.filter(f=>f.source==='studio').length};
 }
 css(){return this.catalog().fonts.filter(f=>f.source==='studio').map(f=>`@font-face{font-family:"${f.cssFamily}";src:url("${f.url}");font-style:normal;font-weight:${f.weight};font-display:swap;}`).join('\n');}
 asset(url){this.catalog();const item=this.files.get(url);if(!item)return null;return {bytes:fs.readFileSync(item.file),type:({'.ttf':'font/ttf','.otf':'font/otf','.woff':'font/woff','.woff2':'font/woff2'})[item.extension]};}
}
export function readerPreferences(raw,fonts){return {fontId:fonts.some(f=>f.id===raw?.fontId)?raw.fontId:'system-georgia',size:Number.isInteger(raw?.size)&&raw.size>=15&&raw.size<=32?raw.size:21};}
