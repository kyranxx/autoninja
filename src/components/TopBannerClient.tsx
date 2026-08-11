"use client";

import Link from "next/link";
import { CREATE_LISTING_ROUTE } from "@/lib/routes";

export default function TopBannerClient({
  freeListingCta,
}: {
  freeListingCta: string;
}) {
  return (
    <aside
      aria-label={freeListingCta}
      className="print:hidden relative z-[140] hidden w-full bg-primary text-primary-foreground md:block"
    >
      <div className="container-main flex min-h-9 items-center justify-center py-1 text-xs">
        <Link
          href={CREATE_LISTING_ROUTE}
          className="text-center font-semibold leading-tight text-white underline-offset-4 hover:underline"
        >
          {freeListingCta} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </aside>
  );
}
