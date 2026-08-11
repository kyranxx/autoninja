"use client";

import { formatLocalizedDateTime } from "@/utils/date-format";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMarketCode } from "@/context/MarketContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/shadcn/button";
import {
  createSavedSearchLabel,
  parseSavedSearchFilters,
} from "@/lib/search/saved-searches";

type SavedSearchRecord = {
  id: string;
  label: string;
  query_string: string;
  notify_email: boolean;
  paused: boolean;
  last_notified_listing_created_at: string | null;
  created_at: string;
};

export function SavedSearchesPanel() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const localeTag = locale;
  const marketCode = useMarketCode();
  const [searchState, setSearchState] = useState<{
    savedSearches: SavedSearchRecord[];
    isLoading: boolean;
  }>({
    savedSearches: [],
    isLoading: true,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadSavedSearches = useCallback(async () => {
    setSearchState((current) => ({ ...current, isLoading: true }));
    try {
      const response = await fetch("/api/account/saved-searches");
      const payload = (await response.json().catch(() => null)) as
        | { savedSearches?: SavedSearchRecord[]; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Unable to load saved searches.");
      }

      setSearchState({
        savedSearches: payload?.savedSearches ?? [],
        isLoading: false,
      });
    } catch (error) {
      console.error("Failed to load saved searches:", error);
      toast.error(t("savedSearchesLoadError"));
      setSearchState({ savedSearches: [], isLoading: false });
    }
  }, [t]);

  useEffect(() => {
    void loadSavedSearches();
  }, [loadSavedSearches]);

  const updateSavedSearch = useCallback(
    async (id: string, patch: { paused?: boolean; notifyEmail?: boolean }) => {
      setBusyId(id);
      try {
        const response = await fetch("/api/account/saved-searches", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        });
        const payload = (await response.json().catch(() => null)) as
          | { savedSearch?: SavedSearchRecord; error?: string }
          | null;

        if (!response.ok || !payload?.savedSearch) {
          throw new Error(payload?.error || "Unable to update saved search.");
        }

        setSearchState((current) => ({
          ...current,
          savedSearches: current.savedSearches.map((entry) =>
            entry.id === id ? payload.savedSearch! : entry,
          ),
        }));
      } catch (error) {
        console.error("Failed to update saved search:", error);
        toast.error(t("savedSearchesUpdateError"));
      } finally {
        setBusyId(null);
      }
    },
    [t],
  );

  const deleteSavedSearch = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const response = await fetch(
          `/api/account/saved-searches?id=${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Unable to delete saved search.");
        }

        setSearchState((current) => ({
          ...current,
          savedSearches: current.savedSearches.filter((entry) => entry.id !== id),
        }));
      } catch (error) {
        console.error("Failed to delete saved search:", error);
        toast.error(t("savedSearchesDeleteError"));
      } finally {
        setBusyId(null);
      }
    },
    [t],
  );

  if (searchState.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-background p-4">
        <p className="text-sm text-secondary">{tCommon("loading")}</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-background p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-primary">{t("savedSearchesTitle")}</h2>
          <p className="mt-1 text-sm text-secondary">{t("savedSearchesDescription")}</p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/vysledky">{t("browseCars")}</Link>
        </Button>
      </div>

      {searchState.savedSearches.length === 0 ? (
        <p className="mt-4 text-sm text-secondary">{t("savedSearchesEmpty")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {searchState.savedSearches.map((entry) => {
            const isBusy = busyId === entry.id;
            const searchHref = entry.query_string ? `/vysledky?${entry.query_string}` : "/vysledky";
            const displayLabel = entry.query_string
              ? createSavedSearchLabel(
                  parseSavedSearchFilters(new URLSearchParams(entry.query_string)),
                  localeTag,
                )
              : entry.label;

            return (
              <article
                key={entry.id}
                className="rounded-xl border border-border-subtle bg-background-secondary p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <Link
                      href={searchHref}
                      className="text-base font-semibold text-primary hover:text-accent"
                    >
                      {displayLabel}
                    </Link>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {entry.paused ? t("alertsPaused") : t("active")} •{" "}
                      {entry.notify_email ? t("notifyByEmail") : t("savedSearchEmailOff")}
                    </p>
                    {entry.last_notified_listing_created_at ? (
                      <p className="mt-1 text-xs text-text-tertiary">
                        {t("savedSearchesLastMatch")}:{" "}
                        {formatLocalizedDateTime(
                          entry.last_notified_listing_created_at,
                          localeTag,
                          marketCode,
                        )}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void updateSavedSearch(entry.id, { paused: !entry.paused })
                      }
                      disabled={isBusy}
                    >
                      {entry.paused ? t("resumeThisAlert") : t("pauseThisAlert")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void updateSavedSearch(entry.id, {
                          notifyEmail: !entry.notify_email,
                        })
                      }
                      disabled={isBusy}
                    >
                      {entry.notify_email ? t("savedSearchEmailDisable") : t("notifyByEmail")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void deleteSavedSearch(entry.id)}
                      disabled={isBusy}
                      className="text-error hover:bg-error/10"
                    >
                      {t("savedSearchDelete")}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
