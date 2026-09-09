"use client";

import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Icon,
} from "@vxture/design-ui";
import { useMessages } from "../lib/i18n/provider";

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
 *
 * THE BACK BUTTON LEADS THE ROW (owner, 2026-09-08), and it is an ICON:
 * going up one level is the most common next action on a page like this, and
 * the trail already spells out where that is - a second copy of the word would
 * be the same instruction twice.
 *
 * arrow-left, NOT chevron-left: the separators between crumbs are chevrons,
 * and two chevron glyphs a centimetre apart pointing opposite ways read as one
 * broken widget (owner, 2026-09-05, on the page this pattern comes from).
 *
 * It goes to the IMMEDIATE PARENT - the last crumb before this page - rather
 * than to browser history: the trail is what the reader is looking at, and a
 * control that lands somewhere the trail does not name is a different promise.
 * A page with no ancestors renders no button rather than a disabled one.
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
  const { SHELL_TEXT } = useMessages();
  const up = trail.at(-1);

  return (
    <div className="gap-2xs flex items-center">
      {up ? (
        <Button asChild variant="ghost" size="icon-sm" aria-label={SHELL_TEXT.backUp}>
          <Link href={up.href}>
            <Icon name="arrow-left" size="sm" />
          </Link>
        </Button>
      ) : null}
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
    </div>
  );
}
