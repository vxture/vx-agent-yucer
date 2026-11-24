import { createHash } from "node:crypto";
export const MATERIAL_LIMIT=24000;
export interface TaskMaterial {version:"task-material/1";name:string;type:string;digest:string;text:string;addedAt:string}
export function textMaterial(name:string,bytes:Uint8Array,now=new Date()):TaskMaterial {
  const ext=name.split(".").at(-1)?.toLowerCase();
  if(!["txt","md","csv","json"].includes(ext??"") || bytes.length>MATERIAL_LIMIT || !bytes.length)throw Error("unsupported_material");
  const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
  if(text.includes("\0") || text.length>8500)throw Error("unsupported_material");
  if(ext==="json")JSON.parse(text);
  const result:TaskMaterial={version:"task-material/1",name:name.replace(/[\x00-\x1f]/g,"").slice(0,160),type:ext!,digest:createHash("sha256").update(bytes).digest("hex"),text,addedAt:now.toISOString()};
  if(JSON.stringify(result).length>10000)throw Error("unsupported_material");
  return result;
}
export function readTaskMaterial(text:string):TaskMaterial|null {
  try{const v=JSON.parse(text);return v.version==="task-material/1"&&typeof v.text==="string"&&v.text.length<=8500&&typeof v.name==="string"&&/^[a-f0-9]{64}$/.test(v.digest)?v:null;}catch{return null;}
}
