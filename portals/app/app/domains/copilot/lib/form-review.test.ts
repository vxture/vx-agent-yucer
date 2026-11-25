import assert from "node:assert/strict";
import {test} from "node:test";
import {fieldPatch,pathValue,readableText,reviewValue,REVIEW_FIELDS} from "./form-review";
import {mergeForm,fieldsFor} from "./business-form";
const id="a0000000-0000-4000-a000-000000000001";
const missing="Needs review",labels={[id]:"Medium business",active:"Active"};
const copy={empty:"To supplement",unavailable:missing,yes:"Yes",no:"No",entries:"Details"};
test("visible reference text resolves names, suppresses unknown IDs and keeps canonical values unchanged",()=>{
  const form=mergeForm(null,"account",null,{name:"Customer",customerSizeId:id});
  assert.equal(reviewValue(form.fields.customerSizeId,labels,copy,0,"customerSizeId"),"Medium business");
  assert.equal(form.fields.customerSizeId,id);
  assert.equal(readableText(`Size ${id.toUpperCase()}`,labels,missing),"Size Medium business");
  assert.equal(readableText(`Not loaded: ${id}`,{},missing),"Not loaded: Needs review");
  assert.equal(reviewValue("unknown-member",{},copy,0,"ownerSub"),missing);
});
test("nested relation arrays are readable without raw JSON or UUIDs",()=>{
  const result=reviewValue([{productId:id,quantity:2,optional:false,note:null},{accountId:"b0000000-0000-4000-a000-000000000002"}],labels,copy);
  assert.match(result,/Medium business/);assert.match(result,/2/);assert.match(result,/No/);
  assert.doesNotMatch(result,/[{}]|[a-f0-9]{8}-[a-f0-9-]{27}/i);
  assert.equal(reviewValue([],labels,copy),copy.empty);
  assert.equal(reviewValue(undefined,labels,copy),copy.empty);
  assert.equal(reviewValue("active",labels,copy),"Active");
});
test("compact fields preserve the native nested aggregate and manual-edit protection",()=>{
  const previous=mergeForm(null,"segment",null,{name:"Market",criteria:{needSummary:"Existing",customerNeed:"Keep"}});
  const human=mergeForm(previous,"segment",null,fieldPatch("criteria.needSummary","Human"),true);
  assert.equal(pathValue(human.fields,"criteria.customerNeed"),"Keep");
  assert.equal(pathValue(mergeForm(human,"segment",null,{criteria:{needSummary:"Model"}}).fields,"criteria.needSummary"),"Human");
  for(const [module,fields] of Object.entries(REVIEW_FIELDS))for(const field of fields){
    assert.doesNotThrow(()=>fieldsFor(module as keyof typeof REVIEW_FIELDS,fieldPatch(field.path,field.kind==="number"?2026:field.kind==="select"?(({tier:"standard",status:"active",novelty:"existing"} as Record<string,string>)[field.path]??null):"")));
  }
});
