"use client";
import { EntryPanel } from "./entry-panel";
export function NoRoles(props: {
  readonly userName: string; readonly userPhone: string | null; readonly userPicture: string | null;
  readonly orgLabel: string | null; readonly workspaceLabel: string;
}) {
  return <EntryPanel state={"no-roles"} person={{ name: props.userName, org: props.orgLabel }} retry={() => window.location.reload()} />;
}
