"use client";
import { useState, type ReactNode } from "react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
} from "@vxture/design-ui";

// Collapsible deliberately leaves its trigger to the consumer. Use native DS
// buttons, which match business actions and do not underline the section title.
export function PlanQuarterDisclosure({
  label,
  children,
  compact = false,
}: {
  label: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button size={compact ? "md" : "lg"} variant="ghost" className="w-full">
          <span className="flex w-full items-center justify-between gap-sm">
            {label}
            <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-md">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
