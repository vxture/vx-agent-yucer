"use client";
import Link from "next/link";
import { XiaoyuExecution } from "./xiaoyu-execution";
import {
  Banner,
  Button,
  Card,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Icon,
} from "@vxture/design-ui";
import { useXiaoyu } from "./xiaoyu-provider";
import { useMessages } from "../lib/i18n/provider";
import {
  readBusinessForm,
  formChanges,
  formHref,
} from "../../domains/copilot/lib/business-form";
function fieldValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  return typeof value === "string" ? value : JSON.stringify(value) ?? "-";
}
export function XiaoyuFormLinks() {
  const { bundle } = useXiaoyu(),
    { XIAOYU_FORMS: T } = useMessages();
  return (
    <XiaoyuExecution renderDrafts={(saved) => bundle?.drafts
        .filter((d) => d.contractVersion === "business-form/1")
        .map((d) => {
          try {
            const form = readBusinessForm(d.text);
            const changes = formChanges(form);
            const receipt = saved.get(d.id);
            return (
              <Card key={d.key} className="@container gap-sm p-md">
                <div className="flex flex-wrap items-center gap-sm">
                  <Icon name="clipboard" size="sm" />
                  <span className="text-label">
                    {String(form.fields.name ?? T[form.module])}
                  </span>
                  <span className="text-body-small text-muted-foreground">
                    {receipt ? T.savedSnapshot : T.draftSnapshot}
                  </span>
                  {receipt ? null : <Button
                    asChild
                    size="md"
                    variant="secondary"
                    className="ml-auto"
                  >
                    <Link href={formHref(form, bundle.task.id, d.key)}>
                      {T.open}
                    </Link>
                  </Button>}
                </div>
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button size="md" variant="ghost">
                      {T.fields} ({changes.length})
                      <Icon name="chevron-down" size="sm" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <dl className="mt-sm grid grid-cols-1 gap-sm text-body @md:grid-cols-2">
                      {changes.map(({path: key, before, after: value, changed}) => (
                        <div
                          key={key}
                          className="min-w-0 rounded-sm border border-border p-sm"
                        >
                          <dt className="text-muted-foreground">
                            {T.labels[key.split(".").at(-1) as keyof typeof T.labels] ?? T.labels[key.split(".")[0] as keyof typeof T.labels]}
                            {form.manualFields.some(
                              (k) => k === key || k.startsWith(key + ".") || key.startsWith(k + "."),
                            ) ? (
                              <span className="ml-sm text-body-small">
                                {T.protected}
                              </span>
                            ) : null}
                          </dt>
                          <dd className="mt-xs space-y-xs break-words text-body">
                            {changed && before !== undefined ? <div className="text-muted-foreground"><span>{T.before}: </span><span className="line-clamp-2">{fieldValue(before)}</span></div> : null}
                            <div><span className="text-muted-foreground">{changed ? T.after : T.unchanged}: </span><span className="line-clamp-3">{fieldValue(value)}</span></div>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CollapsibleContent>
                </Collapsible>
                {form.manualFields.length || form.sources.some(s => s.kind !== "access") ? (
                  <p className="text-body-small text-muted-foreground">
                    {form.manualFields.length ? <span>{T.protected}: {form.manualFields.length}</span> : null}
                    {form.sources.some(s => s.kind !== "access") ? <span className="ml-sm">{T.sources}: {form.sources.filter(s => s.kind !== "access").length}</span> : null}
                  </p>
                ) : null}
              </Card>
            );
          } catch {
            return <Banner key={d.key} tone="warning" title={T.unavailable} />;
          }
        })} />
  );
}
