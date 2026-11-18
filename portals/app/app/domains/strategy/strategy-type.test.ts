import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryStrategyStore } from "./store";
import { createPlan, editPlan, publishStrategy, reviseStrategy, type StrategyContext } from "./service";
import { defaultStrategyTypeId } from "./lib/strategy-type";
import { listStrategyTypes, saveStrategyType } from "./type-service";

function context(): StrategyContext {
  return {workspaceId:"strategy-types",sub:"owner",store:new InMemoryStrategyStore(),
    holder:{permissions:new Set(permissionsForRoles(["sales_leader"]))},
    entitlement:{...EMPTY_ENTITLEMENT,workspace_id:"strategy-types",product:"yucer",tier:"business"}};
}
const draft={name:"Industry expansion",period:"2027",planNo:"TYPE-2027",objective:"Establish reference customers",ownerSub:null,strategyTypeId:defaultStrategyTypeId(1)};

test("type presets are workspace scoped; renaming/disabling never overwrites them on read",async()=>{
  const c=context();const types=unwrap(await listStrategyTypes(c));
  assert.equal(types.length,8);
  unwrap(await saveStrategyType(c,{...types[0],name:"Priority industries",enabled:false}));
  assert.equal(unwrap(await listStrategyTypes(c))[0].name,"Priority industries");
  assert.equal(unwrap(await listStrategyTypes({...c,workspaceId:"other"}))[0].name,types[0].name);
});

test("publications freeze type and art; revisions inherit a disabled type and may replace it",async()=>{
  const c=context();const p=unwrap(await createPlan(c,draft));
  const v1=unwrap(await publishStrategy(c,p.id,p.editToken!));
  const selected=unwrap(await listStrategyTypes(c)).find(t=>t.id===draft.strategyTypeId)!;
  unwrap(await saveStrategyType(c,{...selected,name:"Renamed",theme:"partner",enabled:false}));
  const frozen=(await c.store.getPlan(c.workspaceId,v1.id))!;
  assert.equal(frozen.strategyType?.theme,"expand");assert.equal(frozen.strategyType?.name,selected.name);
  assert.equal((await c.store.listPlans(c.workspaceId))[0].strategyType?.theme,"expand");
  assert.equal((await editPlan(c,v1.id,{...draft,strategyTypeId:defaultStrategyTypeId(0)})).ok,false);
  assert.equal((await createPlan(c,{...draft,planNo:"DISABLED"})).ok,false);
  const revision=unwrap(await reviseStrategy(c,v1.id));
  assert.equal(revision.strategyTypeId,draft.strategyTypeId);
  const changed=unwrap(await editPlan(c,revision.id,{...draft,name:"Updated",changeReason:"Change direction",strategyTypeId:defaultStrategyTypeId(0)},{expectedEditToken:revision.editToken}));
  const v2=unwrap(await publishStrategy(c,changed.id,changed.editToken!));
  assert.equal(v2.publishedSnapshot?.strategyType?.theme,"focus");
  assert.equal((await c.store.getPlan(c.workspaceId,v1.id))?.strategyType?.theme,"expand");
});

test("untyped legacy plans remain neutral and omitted type edits preserve the existing choice",async()=>{
  const c=context();const {strategyTypeId:_type,...plain}=draft;
  const p=unwrap(await createPlan(c,plain));
  assert.equal((await c.store.getPlan(c.workspaceId,p.id))?.strategyType,null);
  const typed=unwrap(await createPlan(c,{...draft,planNo:"TYPED"}));
  unwrap(await editPlan(c,typed.id,{...plain,name:"New name"},{expectedEditToken:typed.editToken}));
  assert.equal((await c.store.getPlan(c.workspaceId,typed.id))?.strategyTypeId,draft.strategyTypeId);
});

test("types reject invalid data, missing permissions, and entitlement gaps",async()=>{
  const c=context();const type=unwrap(await listStrategyTypes(c))[0];
  for(const value of [{...type,theme:"invalid"},{...type,code:"../file"},{...type,name:" "},{...type,sortOrder:NaN}])
    assert.equal((await saveStrategyType(c,value as typeof type)).ok,false);
  for(const denied of [{...c,holder:{permissions:new Set<never>()}}]) {
    assert.equal((await listStrategyTypes(denied)).ok,false);
    assert.equal((await saveStrategyType(denied,type)).ok,false);
  }
  // Settings are a basic management surface; the business strategy remains gated.
  const free={...c,entitlement:{...c.entitlement,tier:"free" as const}};
  assert.equal((await listStrategyTypes(free)).ok,true);
  assert.equal((await saveStrategyType(free,type)).ok,true);
  assert.equal((await createPlan(free,draft)).ok,false);
  assert.equal((await createPlan(c,{...draft,strategyTypeId:"not-in-this-workspace"})).ok,false);
});
