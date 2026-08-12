"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type MaintenanceTranslations = ReturnType<typeof useTranslations>;

function formatUnlockError(
  rawMessage: string,
  t: MaintenanceTranslations,
): string {
  if (rawMessage === "Server misconfigured.") {
    return t("serverMisconfigured");
  }

  if (rawMessage === "Invalid password.") {
    return t("invalidPassword");
  }

  if (rawMessage === "Password required.") {
    return t("passwordRequired");
  }

  if (rawMessage === "Too many attempts. Please try again later.") {
    return t("tooManyAttempts");
  }

  return rawMessage;
}

function MaintenanceContent() {
  const t = useTranslations("maintenance");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg(t("passwordRequired"));
      return;
    }

    setIsChecking(true);
    setErrorMsg("");

    try {
      const response = await fetch("/api/maintenance/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.replace("/");
        return;
      }

      let msg = `Error ${response.status}`;
      try {
        const data = await response.json();
        if (data?.error) {
          msg = formatUnlockError(data.error, t);
        }
      } catch {
        // Keep default message when body is not JSON.
      }
      setErrorMsg(msg);
    } catch (err) {
      setErrorMsg(
        t("networkError", {
          message: err instanceof Error ? err.message : "unknown",
        }),
      );
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <main className="fixed inset-0 z-[9999] flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-background-secondary p-6 shadow-sm">
        <div className="text-center">
          <div className="mx-auto inline-flex items-center gap-2 text-2xl font-bold text-primary">
            Auto<span className="text-accent">Ninja</span>
          </div>
          <h1 className="mt-5 text-3xl font-semibold text-primary">{t("title")}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {t("description")}
          </p>
        </div>

        <form onSubmit={handleUnlock} className="mt-6 space-y-3">
          <input
            type="password"
            id="maintenance-unlock-password"
            name="maintenance-unlock-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("unlockPasswordPlaceholder")}
            className={`h-11 w-full rounded-xl border border-border-strong bg-background px-4 text-base sm:text-sm text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent ${errorMsg ? "border-error ring-error/30" : ""}`}
          />
          <button
            type="submit"
            disabled={isChecking || !password.trim()}
            className="h-11 w-full rounded-xl bg-accent text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isChecking ? t("checking") : t("unlock")}
          </button>
        </form>

        {errorMsg && (
          <p className="mt-3 text-center text-xs font-medium text-error" role="alert" aria-live="polite">
            {errorMsg}
          </p>
        )}
      </div>
    </main>
  );
}

export default function MaintenancePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh flex-col items-center justify-center bg-background">
          <div className="size-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      }
    >
      <MaintenanceContent />
    </Suspense>
  );
}
