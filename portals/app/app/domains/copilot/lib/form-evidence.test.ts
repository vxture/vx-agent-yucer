import assert from "node:assert/strict";
import {test} from "node:test";
import {applyAccountEvidence,validFieldEvidence} from "./form-evidence";
import {mergeForm,readBusinessForm} from "./business-form";
const name="Example customer",website="https://example.org/",creditCode="91310000123456789X";
const quote=`${name}: website ${website}; creditCode ${creditCode}`;
const evidence=[{id:"read-3-1",content:`Official registry excerpt: ${quote}`}];
const claims=[{field:"website" as const,value:website,sourceId:"read-3-1",quote},{field:"creditCode" as const,value:creditCode,sourceId:"read-3-1",quote}];
test("actual company-specific source facts populate native fields and survive serialization",()=>{
  const result=applyAccountEvidence(null,{name},claims,evidence);
  assert.equal(result.fields.website,website);assert.equal(result.fields.creditCode,creditCode);
  const form={...mergeForm(null,"account",null,result.fields),fieldEvidence:result.evidence};
  assert.deepEqual(readBusinessForm(JSON.stringify(form)).fieldEvidence,claims);
});
test("decoded multiline MCP source quotes fill fields without trusting JSON transport escapes",()=>{
  const expectedWebsite="https://www.example.org/",quoted=`Company: ${name}\nWebsite: www.example.org\nRegistration: ${creditCode}`;
  const source=[{id:"read-3-1",content:JSON.stringify({content:[{type:"text",text:quoted}]})}];
  const proposed=[{...claims[0]!,value:expectedWebsite,quote:quoted},{...claims[1]!,quote:quoted}];
  const result=applyAccountEvidence(null,{name},proposed,source);
  assert.equal(result.fields.website,expectedWebsite);assert.equal(result.fields.creditCode,creditCode);
  assert.equal(result.evidence[0]!.quote,quoted);
  assert.equal(applyAccountEvidence(null,{name},[{...proposed[0]!,value:"www.example.org"}],source).fields.website,expectedWebsite);
  for(const value of ["https://other.example/","https://www.example.org/extra","https://www.example.org/?token=secret"])
    assert.throws(()=>applyAccountEvidence(null,{name},[{...proposed[0]!,value}],source),/invalid_form_evidence/);
  assert.throws(()=>applyAccountEvidence(null,{name},[{...proposed[0]!,quote:quoted.replace("\n"," ")}],source),/invalid_form_evidence/);
  const split=[{id:"read-3-1",content:JSON.stringify({name,body:creditCode})}];
  assert.throws(()=>applyAccountEvidence(null,{name},[{...claims[1]!,quote:`${name}\n${creditCode}`}],split),/invalid_form_evidence/);
});
test("unqueried, altered, mismatched-company and conflicting claims never fill a draft",()=>{
  for(const [fields,rows] of [[{name},[]],[{name:"Other customer"},evidence],[{name,website:"https://human.example/"},evidence]] as const)
    assert.throws(()=>applyAccountEvidence(null,fields,claims,rows));
  assert.throws(()=>applyAccountEvidence(null,{name},[{...claims[0],quote:quote+" invented"}],evidence),/invalid_form_evidence/);
  assert.throws(()=>applyAccountEvidence(null,{name},[{...claims[0],value:"javascript:alert(1)",quote:`${name} javascript:alert(1)`}],[{id:"read-3-1",content:`${name} javascript:alert(1)`}]),/invalid_form_evidence/);
});
test("manual edits stay protected and obsolete field provenance is removed",()=>{
  const prepared={...mergeForm(null,"account",null,{name,website}),fieldEvidence:[claims[0]!]};
  const human=mergeForm(prepared,"account",null,{website:"https://human.example/"},true);
  assert.deepEqual(human.fieldEvidence,[]);
  assert.deepEqual(mergeForm(prepared,"account",null,{name:"Another company"},true).fieldEvidence,[]);
  assert.deepEqual(applyAccountEvidence(prepared,{name:"Another company"},undefined,[]).evidence,[]);
  assert.equal(applyAccountEvidence(human,{name},claims,evidence).fields.website,undefined);
  assert.equal(mergeForm(human,"account",null,applyAccountEvidence(human,{name},claims,evidence).fields).fields.website,"https://human.example/");
});
test("bounded evidence validation rejects arbitrary source objects, duplicates and oversized material",()=>{
  assert.equal(validFieldEvidence(claims),true);
  for(const value of [null,{},[claims[0],claims[0]],[{...claims[0],token:"not-allowed"}],[{...claims[0],quote:"x".repeat(1501)}],[{...claims[0],sourceId:"invented"}]])assert.equal(validFieldEvidence(value),false);
  assert.throws(()=>readBusinessForm(JSON.stringify({...mergeForm(null,"account",null,{name}),fieldEvidence:[{bad:true}]})),/invalid_form_evidence/);
});
