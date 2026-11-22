"use client";
import Link from "next/link";
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
  formHref,
} from "../../domains/copilot/lib/business-form";
export function XiaoyuFormLinks() {
  const { bundle } = useXiaoyu(),
    { XIAOYU_FORMS: T } = useMessages();
  if (!bundle) return null;
  return (
    <>
      {bundle.drafts
        .filter((d) => d.contractVersion === "business-form/1")
        .map((d) => {
          try {
            const form = readBusinessForm(d.text);
            return (
              <Card key={d.key} className="p-md">
                <div className="flex flex-wrap items-center gap-sm">
                  <Icon name="clipboard" size="sm" />
                  <span className="text-label">
                    {String(form.fields.name ?? T[form.module])}
                  </span>
                  <span className="text-body-small text-muted-foreground">
                    {T.notSaved}
                  </span>
                  <Button
                    asChild
                    size="md"
                    variant="secondary"
                    className="ml-auto"
                  >
                    <Link href={formHref(form, bundle.task.id, d.key)}>
                      {T.open}
                    </Link>
                  </Button>
                </div>
                <Collapsible className="mt-md">
                  <CollapsibleTrigger asChild>
                    <Button size="md" variant="ghost">
                      {T.fields} ({Object.keys(form.fields).length})
                      <Icon name="chevron-down" size="sm" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <dl className="mt-sm grid grid-cols-1 gap-sm text-body @md:grid-cols-2">
                      {Object.entries(form.fields).map(([key, value]) => (
                        <div
                          key={key}
                          className="min-w-0 rounded-sm border border-border p-sm"
                        >
                          <dt className="text-muted-foreground">
                            {T.labels[key as keyof typeof T.labels]}
                            {form.manualFields.some(
                              (k) => k === key || k.startsWith(key + "."),
                            ) ? (
                              <span className="ml-sm text-body-small">
                                {T.protected}
                              </span>
                            ) : null}
                          </dt>
                          <dd className="mt-xs line-clamp-2 break-words">
                            {typeof value === "string" &&
                            !/^[a-f0-9-]{36}$/i.test(value)
                              ? value
                              : value === null
                                ? "-"
                                : Array.isArray(value)
                                  ? `${value.length} ${T.entries}`
                                  : typeof value === "object"
                                    ? `${Object.keys(value).length} ${T.entries}`
                                    : String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CollapsibleContent>
                </Collapsible>
                <p className="mt-sm text-body-small text-muted-foreground">
                  {T.protected}: {form.manualFields.length} / {T.sources}:{" "}
                  {form.sources.filter((s) => s.kind !== "access").length}
                </p>
              </Card>
            );
          } catch {
            return <Banner key={d.key} tone="warning" title={T.unavailable} />;
          }
        })}
    </>
  );
}
