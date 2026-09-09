import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@vxture/design-ui";

/**
 * 二级页面的面包屑 (owner, 2026-09-08).
 *
 * A THIN BINDING, not a component: it is the DS's own Breadcrumb family with
 * this product's rule about what goes in it, which is the one kind of local
 * wrapper CLAUDE.md sanctions. It restyles nothing.
 *
 * WHY IT EXISTS AT ALL. Two pages already carried a breadcrumb - the account
 * and the deal detail - each writing the same fourteen lines by hand, and the
 * two took their parent label from different places (ACCOUNT_TEXT.backToList
 * vs PIPELINE_TEXT.title). Fourteen more pages had none, so a person landing
 * on 新建大区 could not tell what it belongs to. One binding means the trail
 * reads the same everywhere and the parent's name comes from the registry the
 * menu uses - a page cannot call its parent something the menu does not.
 *
 * THE LAST CRUMB IS NOT A LINK. It is where you already are; a link to the
 * current page is a control that does nothing (`BreadcrumbPage` is the DS's
 * element for exactly this).
 *
 * WHERE IT GOES: first child of the page's ViewLayout, above the ViewHeader.
 * The header answers "what is this"; the crumb answers "where am I", and the
 * second question is the one you have while your eyes are still moving.
 */
export function PageCrumbs({
  trail,
  current,
}: {
  /** Ancestors, outermost first. Labels come from DOMAIN_LABEL wherever the
   *  ancestor is a page the menu also names. */
  readonly trail: readonly { readonly label: string; readonly href: string }[];
  /** This page. Rendered as text, never as a link. */
  readonly current: string;
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.map((step) => (
          <BreadcrumbItem key={step.href}>
            {/* asChild + next/link: a breadcrumb is in-app navigation, and a
                bare <a> would reload the whole shell to move one level up. */}
            <BreadcrumbLink asChild>
              <Link href={step.href}>{step.label}</Link>
            </BreadcrumbLink>
            <BreadcrumbSeparator />
          </BreadcrumbItem>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
