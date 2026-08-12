import type { ReactNode } from "react";
import { BRAND } from "@yucer/shared/brand";

export const metadata = {
  title: BRAND.displayName,
  description: `${BRAND.displayName} - a Vxture product`,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={BRAND.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
