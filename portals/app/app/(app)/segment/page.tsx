import { redirect } from "next/navigation";
// Keep existing links while the market library lives inside market strategy.
export default async function SegmentPage({searchParams}:{readonly searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const values=await searchParams;
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(values)) {
    for(const item of Array.isArray(value)?value:value===undefined?[]:[value])query.append(key,item);
  }
  query.set("view","markets");
  redirect(`/strategy?${query}`);
}
