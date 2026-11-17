import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionsForRoles } from "../../authz/catalog";
import { scopeAccountStore } from "../../authz/scoped-stores";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { unwrap } from "../shared/result";
import { createAccount, setAccountParent, type AccountContext } from "./service";
import { InMemoryAccountStore, type AccountPlanWrite } from "./store";
const WS="ws_registration_hierarchy";
const basics={name:"New",region:null,province:null,industryId:null,segmentId:null,customerTypeId:null,customerSizeId:null,customerNatureId:null,creditCode:null,website:null,employeeCount:null};
const context=(store=new InMemoryAccountStore()):AccountContext=>({workspaceId:WS,sub:"owner",store,
  holder:{permissions:new Set(permissionsForRoles(["sales_leader"]))},entitlement:{...EMPTY_ENTITLEMENT,workspace_id:WS,product:"yucer",tier:"pro"}});
const code=(r:{ok:boolean;violations?:{code:string}[]})=>!r.ok&&r.violations![0]!.code;

test("creation saves parent and subsidiaries together, retaining existing child ownership",async()=>{
 const c=context();const parent=unwrap(await createAccount(c,{...basics,name:"Parent"}));
 const child=await c.store.createAccount(WS,{...basics,name:"Child",ownerSub:"another-owner"});
 const made=unwrap(await createAccount(c,{...basics,parentId:parent.id,childLinks:[{accountId:child.id,expectedParentId:null}]}));
 assert.equal(made.parentId,parent.id);assert.equal((await c.store.getAccount(WS,child.id))?.parentId,made.id);
 assert.equal((await c.store.getAccount(WS,child.id))?.ownerSub,"another-owner");
 assert.equal(code(await setAccountParent(c,parent.id,child.id)),"parent_cycle");
});

test("scoped, foreign, stale and cyclic relationships fail without creating a customer",async()=>{
 const c=context();const parent=unwrap(await createAccount(c,{...basics,name:"Parent"}));
 const child=unwrap(await createAccount(c,{...basics,name:"Child",parentId:parent.id}));
 const foreign=unwrap(await createAccount({...c,workspaceId:"foreign"},basics));
 const before=(await c.store.listAccounts(WS)).length;
 assert.equal(code(await createAccount(c,{...basics,childLinks:[{accountId:child.id,expectedParentId:null}]})),"hierarchy_changed");
 assert.equal(code(await createAccount(c,{...basics,parentId:child.id,childLinks:[{accountId:parent.id,expectedParentId:null}]})),"parent_cycle");
 assert.equal(code(await createAccount(c,{...basics,parentId:foreign.id})),"parent_not_found");
 const scoped={...c,store:scopeAccountStore(c.store,{kind:"own" as const,sub:"invisible",accountIds:[]})};
 assert.equal(code(await createAccount(scoped,{...basics,parentId:parent.id})),"parent_not_found");
 assert.equal(code(await createAccount(scoped,{...basics,childLinks:[{accountId:child.id,expectedParentId:parent.id}]})),"child_not_found");
 assert.equal((await c.store.listAccounts(WS)).length,before);
 assert.equal((await c.store.getAccount(WS,child.id))?.parentId,parent.id);
});

test("explicitly confirmed child reassignment preserves other fields",async()=>{
 const c=context();const old=unwrap(await createAccount(c,basics));const child=unwrap(await createAccount(c,{...basics,parentId:old.id}));
 const made=unwrap(await createAccount(c,{...basics,childLinks:[{accountId:child.id,expectedParentId:old.id}]}));
 assert.equal((await c.store.getAccount(WS,child.id))?.parentId,made.id);
});

test("a failing plan write rolls back the customer and leaves child assignments intact",async()=>{
 class Failing extends InMemoryAccountStore {override async upsertAccountPlan(_ws:string,_p:AccountPlanWrite&{accountId:string}):Promise<never>{throw new Error("plan failure");}}
 const c=context(new Failing());const child=unwrap(await createAccount(c,basics));
 await assert.rejects(createAccount(c,{...basics,tier:"strategic",plan:{period:"Y2026",targetAmount:100,contactCadenceDays:14,execCadenceDays:60},childLinks:[{accountId:child.id,expectedParentId:null}]}),/plan failure/);
 assert.equal((await c.store.listAccounts(WS)).length,1);assert.equal((await c.store.getAccount(WS,child.id))?.parentId,null);
});
