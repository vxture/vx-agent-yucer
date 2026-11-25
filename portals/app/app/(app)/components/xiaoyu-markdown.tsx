"use client";
import Markdown from "react-markdown";
import type { ReactNode } from "react";
import remarkGfm from "remark-gfm";
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from "@vxture/design-ui";
import { readableText } from "../../domains/copilot/lib/form-review";
import { publicSourceUrl } from "../../domains/copilot/lib/task-artifacts";
import styles from "./xiaoyu-markdown.module.css";

export function collaborationHref(href: string): string | undefined {
  if(href.startsWith("/") && !href.startsWith("//") && !/[\\\r\n]/.test(href))return href;
  return publicSourceUrl(href) ?? undefined;
}
type Node={type:string;value?:string;children?:Node[];properties?:Record<string,unknown>};
/** Transform visible text after parsing so internal navigation URLs retain keys. */
function readableReferences(options:{labels:Record<string,string>;unavailable:string}){
  return (tree:Node)=>{
    const visit=(node:Node)=>{
      if(node.type==="text" && node.value)node.value=readableText(node.value,options.labels,options.unavailable);
      if(node.properties)for(const key of ["title","alt"])if(typeof node.properties[key]==="string")node.properties[key]=readableText(node.properties[key],options.labels,options.unavailable);
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
function MarkdownTable({children}:{readonly children?:ReactNode}) {
  return <div className="min-w-0 overflow-x-auto" data-xiaoyu-wide-block><Table>{children}</Table></div>;
}
function MarkdownPre({children}:{readonly children?:ReactNode}) {
  return <pre data-xiaoyu-wide-block>{children}</pre>;
}
/** Domain content wrapper (TD-041). DS owns table, type, spacing and colors.
 * No raw HTML, image requests, embedded widgets or model-supplied styles. */
export function XiaoyuMarkdown({text,labels={},unavailable}:{text:string;labels?:Record<string,string>;unavailable:string}){
  return <div className={`${styles.content} text-body leading-relaxed`} data-xiaoyu-rich-content>
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[[readableReferences,{labels,unavailable}]]} skipHtml
      allowedElements={["p","br","strong","em","del","h1","h2","h3","h4","h5","h6","ul","ol","li","blockquote","pre","code","hr","a","table","thead","tbody","tr","th","td"]}
      components={{
        h1:({children})=><h3 className="text-label-medium">{children}</h3>,h2:({children})=><h3 className="text-label-medium">{children}</h3>,h3:({children})=><h3 className="text-label-medium">{children}</h3>,
        h4:({children})=><h4 className="text-label">{children}</h4>,h5:({children})=><h4 className="text-label">{children}</h4>,h6:({children})=><h4 className="text-label">{children}</h4>,
        pre:MarkdownPre,
        code:({children})=><code className="font-mono text-body-small">{children}</code>,
        a:({href,children,title})=>{const safe=href?collaborationHref(href):undefined;return safe?<a href={safe} title={title} {...(safe.startsWith("/")?{}:{target:"_blank",rel:"noopener noreferrer"})}>{children}</a>:<span>{children}</span>;},
        table:MarkdownTable,
        thead:({children})=><TableHeader>{children}</TableHeader>,tbody:({children})=><TableBody>{children}</TableBody>,
        tr:({children})=><TableRow>{children}</TableRow>,th:({children})=><TableHead>{children}</TableHead>,td:({children})=><TableCell>{children}</TableCell>,
      }} >{text}</Markdown>
  </div>;
}
