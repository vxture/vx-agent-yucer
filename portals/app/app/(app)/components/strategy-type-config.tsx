"use client";

import { Field, FieldLabel, Input, NativeSelect } from "@vxture/design-ui";
import { VocabularyConfig, type VocabularyResult } from "./vocabulary-config";
import { Tag } from "./tag";
import { STRATEGY_THEMES, type StrategyType } from "../../domains/strategy/lib/strategy-type";
import { useMessages } from "../lib/i18n/provider";

function descriptionCell(row: StrategyType) {
  return <span className="text-body-small text-muted-foreground">{row.description || "-"}</span>;
}

function availabilityCell(enabled: boolean, label: string) {
  return <Tag tone={enabled?"success":"neutral"}>{label}</Tag>;
}

export function StrategyTypeConfig({rows,editable,onSave}: {
  readonly rows: readonly StrategyType[]; readonly editable: boolean;
  readonly onSave: (input:StrategyType)=>Promise<VocabularyResult>;
}) {
  const {MARKET_STRATEGY_TEXT:T,PLAN_ERROR}=useMessages();
  const themes={focus:T.themeFocus,expand:T.themeExpand,innovate:T.themeInnovate,partner:T.themePartner,diversify:T.themeDiversify};
  return <VocabularyConfig rows={rows.map(t=>({...t,id:t.code}))} idPrefix="strategy-type" editable={editable}
    page={{icon:"flag",count:String}} errors={PLAN_ERROR}
    text={{title:T.typeConfig,why:T.typeConfigHelp,noun:T.strategyType,add:T.typeAdd,save:T.typeSave,
      codeLabel:T.typeCode,codeHint:T.typeCodeHint,nameLabel:T.typeName,colName:T.typeName,deleteConsequence:T.typeConfigHelp}}
    columns={[
      {id:"description",header:T.typeDescription,width:"lg",cell:descriptionCell},
      {id:"theme",header:T.typeTheme,cell:r=>themes[r.theme]},
      {id:"enabled",header:T.typeEnabled,cell:r=>availabilityCell(r.enabled,r.enabled?T.typeEnabledLabel:T.typeDisabledLabel)},
    ]}
    deleteHiddenWhen={()=>true} onDelete={async()=>({ok:false,error:"denied"})}
    extraActions={(r,run)=>[{id:"availability",label:r.enabled?T.typeDisabledLabel:T.typeEnabledLabel,onSelect:()=>run(onSave({...r,enabled:!r.enabled}))}]}
    extraDefaults={{description:"",theme:"focus" as StrategyType["theme"],enabled:true,sortOrder:rows.length}}
    extraFromRow={r=>({description:r.description,theme:r.theme,enabled:r.enabled,sortOrder:r.sortOrder})}
    renderExtra={(value,set,disabled)=><>
      <Field><FieldLabel htmlFor="strategy-type-description">{T.typeDescription}</FieldLabel><Input id="strategy-type-description" maxLength={240} placeholder={T.typeDescriptionPlaceholder} value={value.description} disabled={disabled} onChange={e=>set({...value,description:e.target.value})}/></Field>
      <Field><FieldLabel htmlFor="strategy-type-theme">{T.typeTheme}</FieldLabel><NativeSelect id="strategy-type-theme" value={value.theme} disabled={disabled} onChange={e=>set({...value,theme:e.target.value as StrategyType["theme"]})}>
        {STRATEGY_THEMES.map(theme=><option key={theme} value={theme}>{themes[theme]}</option>)}
      </NativeSelect>
        <div className="h-24 overflow-hidden rounded-md border border-border bg-primary/5 text-primary-text" aria-hidden="true">
          <div className="h-full w-full bg-current opacity-30" style={{maskImage:`url(/assets/strategy/${value.theme}.svg)`,maskSize:"contain",maskPosition:"center",maskRepeat:"no-repeat"}}/>
        </div>
      </Field>
      <Field><FieldLabel htmlFor="strategy-type-enabled">{T.typeEnabled}</FieldLabel><NativeSelect id="strategy-type-enabled" disabled={disabled} value={value.enabled?"on":"off"} onChange={e=>set({...value,enabled:e.target.value==="on"})}><option value="on">{T.typeEnabledLabel}</option><option value="off">{T.typeDisabledLabel}</option></NativeSelect></Field>
      <Field><FieldLabel htmlFor="strategy-type-sort">{T.typeSort}</FieldLabel><Input id="strategy-type-sort" type="number" min={0} max={9999} step={1} value={value.sortOrder} disabled={disabled} onChange={e=>set({...value,sortOrder:e.target.valueAsNumber})}/></Field>
    </>}
    onSave={onSave}/>
}
