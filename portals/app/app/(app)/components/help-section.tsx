import type { ComponentProps, ReactNode } from "react";
import { Section as DSSection, SectionHeader as DSSectionHeader } from "@vxture/design-ui";
import { TitleHelp } from "./title-help";

type WithHelp = { readonly help?: ReactNode };

export function SectionHeader({ help, titleSuffix, ...props }: ComponentProps<typeof DSSectionHeader> & WithHelp) {
  return <DSSectionHeader {...props} titleSuffix={help ? <span className="inline-flex items-center gap-xs">
    <TitleHelp topic={typeof props.title === "string" ? props.title : undefined}>{help}</TitleHelp>
    {titleSuffix}
  </span> : titleSuffix} />;
}

// The DS Section has no titleSuffix slot; use its own heading above the body.
export function Section({ help, ...props }: ComponentProps<typeof DSSection> & WithHelp) {
  if (!help || !props.title) return <DSSection {...props} />;
  const { title, level, icon, action, description, children, ...body } = props;
  return <DSSection {...body}>
    <SectionHeader title={title} level={level} icon={icon} action={action} description={description} help={help} />
    <div className="flex flex-col gap-md">{children}</div>
  </DSSection>;
}
