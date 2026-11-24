"use client";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Card, Icon } from "@vxture/design-ui";
import { useXiaoyu } from "./xiaoyu-provider";
import { useMessages } from "../lib/i18n/provider";
export interface FormReviewBinding {
  taskId: string;
  key: string;
  register: (sync: (() => Promise<void>) | null) => void;
  commit: () => Promise<void>;
}
const Review = createContext<FormReviewBinding | null>(null);
export const useTaskFormReview = () => useContext(Review);
/** The native editor saves only its private task draft here. Domain writes
 * remain exclusively in the version-bound execution proposal/receipt service. */
export function XiaoyuFormReview({ taskId, formKey, children }: { taskId: string; formKey: string; children: ReactNode }) {
  const { bundle, client, busy } = useXiaoyu();
  const { XIAOYU_FORMS: T } = useMessages();
  const sync = useRef<(() => Promise<void>) | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();
  const commit = async () => {
    if (!sync.current) throw Error("form_sync_failed");
    await sync.current();
    await client.refresh();
  };
  if (!bundle || bundle.task.id !== taskId || !bundle.drafts.some(d => d.key === formKey)) return null;
  return <Review.Provider value={{taskId, key: formKey, register: value => { sync.current = value; }, commit}}>
    <Card className="gap-md p-md" data-task-native-editor>
      <div className="flex items-center gap-sm border-b border-border pb-sm">
        <Icon name="edit" size="sm" /><h3 className="min-w-0 flex-1 text-label">{T.fields}</h3>
        <Button size="md" variant="secondary" disabled={saving || busy || bundle.task.status!=="active"} onClick={() => {
          setSaving(true); setError(false);
          void commit().then(() => router.push(`/copilot?task=${taskId}`)).catch(() => setError(true)).finally(() => setSaving(false));
        }}>{T.reviewDone}</Button>
      </div>
      {error ? <Banner tone="warning" title={T.unavailable} /> : null}
      <fieldset disabled={saving || busy || bundle.task.status!=="active"} className="min-w-0" data-task-native-fields>{children}</fieldset>
    </Card>
  </Review.Provider>;
}
