import { translationMessages } from './core.mjs';
export const preferredModels=['gemini-3.8-flash','gemini-3.6-flash','gemini-3.5-flash'];
export function redact(message) { return String(message).replace(/AIza[\w-]+/g,'[đã ẩn key]').replace(/([?&]key=)[^&\s]+/gi,'$1[đã ẩn]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[tài khoản]'); }
export class Gemini {
  constructor({getKey,fetchImpl=fetch}) {this.getKey=getKey;this.fetch=fetchImpl;}
  async models(signal) {
    const key=await this.getKey(); if(!key)throw Error('Chưa có Google API key. Nhập key trong Cài đặt hoặc kiểm tra dự án Studio.');
    let page='', all=[];
    do {
      const r=await this.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'+(page?'&pageToken='+encodeURIComponent(page):''),{headers:{'x-goog-api-key':key},signal:signal||AbortSignal.timeout(30000)});
      const j=await r.json();if(!r.ok)throw Error(this.error(r.status,j));
      all.push(...(j.models||[]));page=j.nextPageToken||'';
    }while(page);
    return all.filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&/^models\/gemini-[\d.]+-flash(?:-lite)?$/.test(m.name)).map(m=>({id:m.name.slice(7),name:m.displayName||m.name}));
  }
  error(status,j) {
    if(status===429)return 'Google API hết hạn mức hoặc đang giới hạn (429). Đã dừng; không đổi key để vượt hạn mức. Chờ rồi bấm dịch tiếp.';
    if(status===401||status===403)return 'Google API từ chối key/quyền truy cập ('+status+').';
    if(status===404)return 'Model không có trên key này (404). Bấm Dò model trong Cài đặt rồi chọn model văn bản.';
    return 'Google API HTTP '+status+' · '+redact(j.error?.status||'không trả kết quả');
  }
  async generate({model,messages,signal}) {
    if(!/^gemini-[\d.]+-flash(?:-lite)?$/.test(model))throw Error('Chỉ dùng model Gemini Flash văn bản, không dùng model ảnh/âm thanh/live.');
    const key=await this.getKey();if(!key)throw Error('Chưa có Google API key.');
    const timeout=AbortSignal.timeout(120000), combined=signal?AbortSignal.any([signal,timeout]):timeout;
    const r=await this.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},signal:combined,body:JSON.stringify({systemInstruction:{parts:[{text:messages[0].content}]},contents:messages.slice(1).map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:16384,thinkingConfig:{thinkingLevel:'low'}}})});
    const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(this.error(r.status,j));
    const candidate=j.candidates?.[0];if(candidate?.finishReason!=='STOP')throw Error('Google chưa trả bản dịch đầy đủ ('+(candidate?.finishReason||j.promptFeedback?.blockReason||'rỗng')+'). Đoạn này chưa được lưu là đã dịch.');
    const translated=(candidate.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
    if(!translated)throw Error('Google trả nội dung rỗng.');
    return {text:translated,model:j.modelVersion||model,usage:j.usageMetadata||null};
  }
  translate(book,chapter,part,context,signal,model,first=false) {
    const messages=translationMessages(book,chapter,part,context);
    if(first){messages[0].content+=`\nĐây là đoạn đầu của chương. Dòng đầu tiên phải là tiêu đề đã dịch theo mẫu: Chương ${chapter.number} — <tên chương tiếng Việt>. Sau một dòng trống là bản dịch nội dung. Dịch tiêu đề đúng một lần, không nhắc lại tiêu đề nguồn trong thân bài.`;messages[1].content+=`\nTiêu đề nguồn cần dịch: ${chapter.title}`;}
    return this.generate({model,messages,signal});
  }
}
