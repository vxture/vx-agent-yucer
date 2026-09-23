"use client";

import { Badge } from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

// 规则算出 / 模型推断 - where a judgement came from (YC-021 L5 判断与来源标记:
// the two sources must be distinguishable wherever a judgement is shown). One
// component so the judgement workspace, the customer page's judgement note
// and the deal rows cannot drift into three different ways of saying it.
export function SourceMark({ source }: { readonly source: "rule" | "model" }) {
  const { HOME_TEXT } = useMessages();
  const rule = source === "rule";
  return (
    <Badge variant="outline" title={rule ? HOME_TEXT.sourceRuleHint : HOME_TEXT.sourceModelHint}>
      {rule ? HOME_TEXT.sourceRule : HOME_TEXT.sourceModel}
    </Badge>
  );
}
