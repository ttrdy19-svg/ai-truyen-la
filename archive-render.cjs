const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
async function archiveOwnedRender(config,id){
 if(!/^[a-f\d-]{36}$/.test(id||''))throw Error('Mã bản việc ảnh không hợp lệ.');
 const base=await fs.realpath(path.join(config.studioData,'projects'));
 const source=await fs.realpath(path.join(base,id));
 if(path.dirname(source)!==base||path.basename(source)!==id)throw Error('Bản việc nằm ngoài thư mục cho phép.');
 const owner=JSON.parse(await fs.readFile(path.join(source,'truyen-la-owner.json'),'utf8'));
 if(owner.id!==id||owner.owner!=='AI Truyen La')throw Error('Không chuyển bản việc của app khác.');
 const parent=path.resolve(config.dataRoot,'AI Phuong An Bia');await fs.mkdir(parent,{recursive:true});
 const target=path.join(parent,id);if(path.dirname(target)!==parent)throw Error('Sai thư mục lưu bìa.');
 const files=[];
 async function walk(folder,relative=''){for(const entry of await fs.readdir(folder,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Không chuyển bản việc chứa liên kết.');const rel=path.join(relative,entry.name);if(entry.isDirectory())await walk(path.join(folder,entry.name),rel);else if(entry.isFile())files.push(rel);else throw Error('Bản việc có loại file không hỗ trợ.');}}
 await walk(source);
 try{await fs.access(target);}catch{await fs.cp(source,target,{recursive:true,errorOnExist:true,force:false});}
 for(const rel of files){const [a,b]=await Promise.all([fs.readFile(path.join(source,rel)),fs.readFile(path.join(target,rel))]);if(a.length!==b.length||createHash('sha256').update(a).digest('hex')!==createHash('sha256').update(b).digest('hex'))throw Error('Bản sao bìa chưa khớp; giữ bản nguồn.');}
 // Only our UUID-named, owner-marked render directory, with every file verified above.
 await fs.rm(source,{recursive:true});return target;
}
module.exports={archiveOwnedRender};
