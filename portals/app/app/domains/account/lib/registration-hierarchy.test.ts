import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRegistrationRelations as match, readRegistrationRelations as read, type RegistrationAccountOption } from "./registration-hierarchy";
import { planAccountRegistrationHierarchy as plan, type RegistrationHierarchy } from "./parent";
const a = (id: string, name: string, parentId: string | null = null): RegistrationAccountOption => ({id,name,parentId,accountNo:`ACC-${id}`});
const parent = a("p", "Parent Group");
const child = a("c", "Child Ltd");
const identity = {name:"New Customer"};

test("relationship extraction accepts only exact names supported by this turn and never model IDs", () => {
  const text = "New Customer belongs to Parent Group; Child Ltd belongs to New Customer.";
  const raw = {relations:[
    {kind:"parent",name:parent.name,id:"invented",evidence:"belongs to Parent Group"},
    {kind:"child",name:child.name,evidence:"Child Ltd belongs to New Customer"},
    {kind:"child",name:"Invented",evidence:"Child Ltd"},
    {kind:"parent",name:parent.name,evidence:"previous turn"},
    {kind:"parent",name:parent.name,evidence:"Parent Group"},
    {kind:"owner",name:child.name,evidence:child.name},
  ]};
  assert.deepEqual(read("```json\n"+JSON.stringify(raw)+"\n```",text),[{kind:"parent",name:parent.name},{kind:"child",name:child.name}]);
  assert.deepEqual(read("invalid",text),[]);
});

test("unique registered names match; ambiguous and missing names remain proposals", () => {
  const result = match([{kind:"parent",name:"PARENT GROUP"},{kind:"child",name:child.name},{kind:"child",name:"Twin"},{kind:"child",name:"Missing"}],
    [parent,child,a("t1","Twin"),a("t2","Twin")],identity);
  assert.equal(result.parent?.id,parent.id);
  assert.deepEqual(result.children,[child]);
  assert.deepEqual(result.proposals.map(p=>p.status),["ambiguous","missing"]);
});

test("manual choices and existing subsidiary ownership are not automatically overwritten", () => {
  const held = a("held","Assigned Child",parent.id);
  const result = match([{kind:"parent",name:parent.name},{kind:"child",name:held.name}],
    [parent,held,a("other","Other")],identity,{parentId:"other"});
  assert.equal(result.parent,undefined);
  assert.deepEqual(result.children,[]);
  assert.deepEqual(result.proposals.map(p=>p.status),["conflict","conflict"]);
});

test("automatic matching refuses indirect ancestor cycles in either claim order", () => {
  const root = a("root","Root"); const leaf = a("leaf","Leaf","root");
  for (const claims of [[{kind:"parent" as const,name:"Leaf"},{kind:"child" as const,name:"Root"}],
    [{kind:"child" as const,name:"Root"},{kind:"parent" as const,name:"Leaf"}]]) {
    const result = match(claims,[root,leaf],identity);
    assert.equal(result.proposals.length,1);
    assert.equal(result.proposals[0]?.status,"conflict");
    assert.equal(!!result.parent && result.children.length > 0,false);
  }
});

test("an already registered customer exposes its visible family without moving subsidiaries to a duplicate", () => {
  const existing = a("e","Existing",parent.id);const subsidiary = a("s","Subsidiary",existing.id);
  const result = match([{kind:"child",name:subsidiary.name}],[parent,existing,subsidiary],{name:"existing"});
  assert.deepEqual(result.existing,{account:existing,parent,children:[subsidiary]});
  assert.deepEqual(result.children,[]);
  const hiddenParent = match([],[existing,subsidiary],{name:"Existing"});
  assert.equal(hiddenParent.existing?.parent,null);
});

test("multiple proposed parents require a choice; a credit-code match takes precedence over names", () => {
  const result = match([{kind:"parent",name:parent.name},{kind:"parent",name:child.name}],[parent,child],identity);
  assert.equal(result.parent,undefined);assert.equal(result.proposals.length,2);
  const exact = match([],[{...parent,creditCode:"CODE"},child],{name:"Changed Name",creditCode:"CODE"});
  assert.equal(exact.existing?.account.id,parent.id);
});

test("complete-tree validation refuses cycles, stale ownership, duplicates and malformed selections", () => {
  const rows = [parent,child,a("leaf","Leaf",parent.id)];
  const cases: [RegistrationHierarchy,string][] = [
    [{parentId:"leaf",childLinks:[{accountId:parent.id,expectedParentId:null}]},"parent_cycle"],
    [{childLinks:[{accountId:"leaf",expectedParentId:null}]},"hierarchy_changed"],
    [{parentId:"missing"},"parent_not_found"],
    [{childLinks:[{accountId:"missing",expectedParentId:null}]},"child_not_found"],
    [{childLinks:[{accountId:child.id,expectedParentId:null},{accountId:child.id,expectedParentId:null}]},"hierarchy_invalid"],
    [{childLinks:null} as unknown as RegistrationHierarchy,"hierarchy_invalid"],
    [{childLinks:[{accountId:child.id}] } as unknown as RegistrationHierarchy,"hierarchy_invalid"],
  ];
  for(const [input,code] of cases){const out=plan(input,rows,"new");assert.equal(!out.ok&&out.violations[0]?.code,code);}
});
