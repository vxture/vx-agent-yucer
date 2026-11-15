"use client";

import { Button, Combobox, Field, FieldDescription, FieldLabel, Icon } from "@vxture/design-ui";
import { planAccountRegistrationHierarchy } from "../../domains/account/lib/parent";
import type { RegistrationAccountOption } from "../../domains/account/lib/registration-hierarchy";
import { useMessages } from "../lib/i18n/provider";
import { FormFields } from "./form-page";
import { TitleHelp } from "./title-help";

export interface AccountHierarchyValues { readonly parentId:string; readonly childIds:readonly string[] }
export function AccountHierarchyFields({accounts,value,onChange,disabled}:{
  readonly accounts:readonly RegistrationAccountOption[]|null;
  readonly value:AccountHierarchyValues;
  readonly onChange:(next:AccountHierarchyValues)=>void;
  readonly disabled:boolean;
}){
  const {ACCOUNT_PARENT_TEXT:P,ACCOUNT_REGISTRATION_TEXT:T}=useMessages();
  const rows=accounts ?? [];
  const childLinks=(ids:readonly string[])=>ids.map(accountId=>({accountId,expectedParentId:rows.find(a=>a.id===accountId)?.parentId ?? null}));
  const valid=(parentId:string,childIds:readonly string[])=>planAccountRegistrationHierarchy({parentId:parentId||null,childLinks:childLinks(childIds)},rows,"registration-draft").ok;
  const parents=rows.filter(a=>!value.childIds.includes(a.id)&&valid(a.id,value.childIds));
  const available=rows.filter(a=>!value.childIds.includes(a.id)&&valid(value.parentId,[...value.childIds,a.id]));
  return <section className="flex flex-col gap-md" data-registration-hierarchy>
    <div className="flex items-center gap-xs"><h2 className="text-label-medium">{P.sectionTitle}</h2><TitleHelp topic={P.sectionTitle}>{T.hierarchyHelp}</TitleHelp></div>
    <FormFields>
      <Field><FieldLabel>{P.field}</FieldLabel>
        <Combobox value={value.parentId||"__none__"} disabled={disabled||accounts===null}
          onValueChange={id=>onChange({...value,parentId:id==="__none__"?"":id})}
          items={[{value:"__none__",label:P.none},...parents.map(a=>({value:a.id,label:`${a.name} \u00b7 ${a.accountNo}`}))]}
          placeholder={P.none} searchPlaceholder={T.searchAccounts} emptyText={T.noAccountMatches} className="w-full"/>
      </Field>
      <Field className="@xl:col-span-2"><FieldLabel>{P.addChildField}</FieldLabel>
        <Combobox disabled={disabled||accounts===null||!available.length}
          items={available.map(a=>({value:a.id,label:`${a.name} \u00b7 ${a.accountNo}${a.parentId ? ` \u00b7 ${T.currentParent}: ${rows.find(p=>p.id===a.parentId)?.name ?? T.registeredParent}` : ""}`}))}
          onValueChange={id=>{if(available.some(a=>a.id===id))onChange({...value,childIds:[...value.childIds,id]});}}
          placeholder={T.addSubsidiary} searchPlaceholder={T.searchAccounts} emptyText={T.noAccountMatches} className="w-full"/>
      </Field>
    </FormFields>
    {accounts===null?<FieldDescription>{T.accountsUnavailable}</FieldDescription>:null}
    {value.childIds.length?<ul className="flex flex-wrap gap-sm" aria-label={P.addChildField}>
      {value.childIds.map(id=>{
        const child=rows.find(a=>a.id===id);if(!child)return null;
        const oldParent=rows.find(a=>a.id===child.parentId);
        return <li key={id} className="inline-flex max-w-full items-center gap-xs rounded-md bg-accent pl-sm text-body" data-registration-child>
          <Icon name="buildings" size="sm" className="shrink-0 text-muted-foreground" aria-hidden="true"/>
          <span className="min-w-0 break-words">{child.name}{child.parentId?<span className="ml-xs text-body-small text-muted-foreground">{T.moveFrom(oldParent?.name ?? T.registeredParent)}</span>:null}</span>
          <Button type="button" variant="ghost" size="icon-md" disabled={disabled} aria-label={`${P.removeChild}: ${child.name}`} onClick={()=>onChange({...value,childIds:value.childIds.filter(x=>x!==id)})}><Icon name="x" size="sm" aria-hidden="true"/></Button>
        </li>;
      })}
    </ul>:null}
  </section>;
}
