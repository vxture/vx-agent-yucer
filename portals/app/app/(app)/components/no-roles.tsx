"use client";
import { EntryPanel } from "./entry-panel";
export function NoRoles(props: {
  readonly userName: string;
  readonly orgLabel: string | null;
}) {
  return <EntryPanel state={"no-roles"} person={{ name: props.userName, org: props.orgLabel }} retry={() => window.location.reload()} />;
}
