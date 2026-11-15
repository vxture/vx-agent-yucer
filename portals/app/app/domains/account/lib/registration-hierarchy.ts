import { planAccountRegistrationHierarchy } from "./parent";

// The model extracts names with evidence. Only scoped registry data resolves IDs.
export interface RegistrationAccountOption {
  readonly id: string;
  readonly name: string;
  readonly accountNo: string;
  readonly parentId: string | null;
}
export interface RegistrationRelationClaim {
  readonly kind: "parent" | "child";
  readonly name: string;
}
export interface RegistrationRelationProposal extends RegistrationRelationClaim {
  readonly status: "ambiguous" | "missing" | "conflict";
  readonly candidates: readonly RegistrationAccountOption[];
}
export interface RegistrationHierarchyResult {
  readonly parent?: RegistrationAccountOption;
  readonly children: readonly RegistrationAccountOption[];
  readonly proposals: readonly RegistrationRelationProposal[];
  readonly existing?: {
    readonly account: RegistrationAccountOption;
    readonly parent: RegistrationAccountOption | null;
    readonly children: readonly RegistrationAccountOption[];
  };
}
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu,"");

export function readRegistrationRelations(answer: string, text: string): RegistrationRelationClaim[] {
  let raw: unknown;
  try { raw=JSON.parse(answer.replace(/^\s*```(?:json)?\s*/,"").replace(/\s*```\s*$/,"")); } catch { return []; }
  if(!raw || typeof raw!=="object" || !("relations" in raw) || !Array.isArray(raw.relations))return [];
  const rows:RegistrationRelationClaim[]=[];
  for(const claim of raw.relations.slice(0,30)){
    if(!claim || typeof claim!=="object" || !["parent","child"].includes(claim.kind) ||
      typeof claim.name!=="string" || !claim.name.trim() || claim.name.length>255 ||
      typeof claim.evidence!=="string" || !claim.evidence.trim() ||
      !text.includes(claim.evidence) || !normalize(claim.evidence).includes(normalize(claim.name)))continue;
    if(!rows.some(r=>r.kind===claim.kind&&normalize(r.name)===normalize(claim.name)))
      rows.push({kind:claim.kind,name:claim.name.trim()});
  }
  return rows;
}

export function matchRegistrationRelations(
  claims: readonly RegistrationRelationClaim[],
  accounts: readonly (RegistrationAccountOption & {creditCode?:string|null})[],
  identity: {name:string;creditCode?:string},
  current: {parentId?:string|null;childIds?:readonly string[]} = {},
): RegistrationHierarchyResult {
  const publicRow=(a:RegistrationAccountOption):RegistrationAccountOption=>({id:a.id,name:a.name,accountNo:a.accountNo,parentId:a.parentId});
  const exact = identity.creditCode?.trim() ? accounts.filter(a=>a.creditCode===identity.creditCode!.trim())
    : accounts.filter(a=>normalize(a.name)===normalize(identity.name));
  // A registered customer's existing family belongs to that customer. Never
  // copy its subsidiaries onto a newly duplicated record.
  if(exact.length===1){
    const account=exact[0]!;
    return {children:[],proposals:[],existing:{account:publicRow(account),
      parent:accounts.find(a=>a.id===account.parentId) ? publicRow(accounts.find(a=>a.id===account.parentId)!) : null,
      children:accounts.filter(a=>a.parentId===account.id).map(publicRow)}};
  }
  let parent:RegistrationAccountOption|undefined;
  const children:RegistrationAccountOption[]=[];
  const proposals:RegistrationRelationProposal[]=[];
  const parentClaims=claims.filter(c=>c.kind==="parent");
  for(const claim of claims){
    const candidates=accounts.filter(a=>normalize(a.name)===normalize(claim.name)).map(publicRow);
    if(candidates.length!==1){proposals.push({...claim,status:candidates.length?"ambiguous":"missing",candidates});continue;}
    const candidate=candidates[0]!;
    let conflict=claim.kind==="parent"
      ? parentClaims.length>1 || (!!current.parentId && current.parentId!==candidate.id) ||
        current.childIds?.includes(candidate.id) || children.some(c=>c.id===candidate.id)
      : candidate.parentId!==null || current.parentId===candidate.id || parent?.id===candidate.id;
    const nextParent = claim.kind === "parent" ? candidate.id : current.parentId || parent?.id || null;
    const childIds = [...new Set([...(current.childIds ?? []), ...children.map(a => a.id), ...(claim.kind === "child" ? [candidate.id] : [])])];
    const checked = planAccountRegistrationHierarchy({parentId:nextParent,childLinks:childIds.map(accountId=>({accountId,expectedParentId:accounts.find(a=>a.id===accountId)?.parentId ?? null}))},accounts,"registration-draft");
    conflict = conflict || !checked.ok;
    if(conflict){proposals.push({...claim,status:"conflict",candidates});continue;}
    if(claim.kind==="parent")parent=candidate;
    else if(!current.childIds?.includes(candidate.id))children.push(candidate);
  }
  return {parent,children,proposals};
}
