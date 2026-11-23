"use client";
import { EntryPanel } from "./entry-panel";
export function NoSubscription(props: { readonly subscribeHref?: string | null; readonly expired?: boolean;
  readonly userName: string; readonly userPhone: string | null; readonly userPicture: string | null;
  readonly orgLabel: string | null; readonly workspaceLabel: string;
}) {
  return <EntryPanel state={props.expired ? "expired" : "no-subscription"} person={{ name: props.userName, org: props.orgLabel }} purchaseHref={props.subscribeHref}  retry={() => window.location.reload()} />;
}
