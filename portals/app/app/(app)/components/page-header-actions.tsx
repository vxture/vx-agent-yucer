import type { ComponentProps, ReactNode } from "react";
import { Button } from "@vxture/design-ui";
import styles from "./business-controls.module.css";

export type PageHeaderActions = {
  readonly view?: ReactNode;
  readonly context?: ReactNode;
  readonly secondary?: ReactNode;
  readonly primary?: ReactNode;
  readonly more?: ReactNode;
};

/** Shared by DS ViewHeader and the breadcrumb row of dossier pages. */
export function PageActionRow({ view, context, secondary, primary, more }: PageHeaderActions) {
  const groups = { view, context, secondary, primary, more };
  if (!Object.values(groups).some(Boolean)) return null;
  return (
    <div className={styles.pageActions} data-business-page-actions>
      {Object.entries(groups).map(([slot, content]) => content ? (
        <div key={slot} className={styles.pageActionGroup} data-page-action-slot={slot}>
          {content}
        </div>
      ) : null)}
    </div>
  );
}

export function PageActionButton({
  intent = "secondary",
  className,
  ...props
}: Omit<Extract<ComponentProps<typeof Button>, { readonly confirmExempt?: never }>, "size" | "variant"> & {
  readonly intent?: "primary" | "secondary";
}) {
  return <Button
    {...props}
    className={className ? `${styles.pageActionButton} ${className}` : styles.pageActionButton}
    size="xl"
    variant={intent === "primary" ? "default" : "outline"}
  />;
}

export function PageActionCrumbs({ children, more }: { readonly children: ReactNode; readonly more?: ReactNode }) {
  return (
    <div className={styles.pageActionCrumbs}>
      <div className="min-w-0">{children}</div>
      <PageActionRow more={more} />
    </div>
  );
}
