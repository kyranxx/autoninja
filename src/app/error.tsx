"use client";

import { useEffect, useId } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BRAND_NAME } from "@/config/brand";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  const fallbackId = useId().replace(/:/g, "");
  const errorId = error.digest || fallbackId;
  const t = useTranslations("errorPage");

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="card p-8 sm:p-10">
          <p className="eyebrow mb-3">{t("eyebrow")}</p>
          <h1 className="text-3xl font-display font-semibold text-text-primary">
            {t("title")}
          </h1>
          <p className="mt-3 text-text-secondary">
            {t("description", { brand: BRAND_NAME })}
          </p>

          <div className="mt-6 rounded-lg border border-border bg-background-muted p-4 text-sm">
            <p className="font-medium text-text-primary">{t("errorId")}</p>
            <p className="mt-1 font-mono text-text-secondary">{errorId}</p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => reset()}
              className="btn-primary motion-interruptible"
            >
              {t("retry")}
            </button>
            <Link href="/" className="btn-secondary motion-interruptible">
              {t("home")}
            </Link>
            <Link href="/kontakt" className="btn-outline motion-interruptible">
              {t("contact")}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
