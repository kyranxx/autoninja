"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import AuthModal from "@/components/AuthModal";
import { useAuth } from "@/context/AuthContext";

type AuthEntryView = "login" | "register";

function getRedirectTarget(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  const redirectParam = new URLSearchParams(window.location.search).get("redirect");
  return redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";
}

export function AuthEntryPage({
  initialView,
  srTitleKey,
}: {
  initialView: AuthEntryView;
  srTitleKey: "loginSrTitle" | "registerSrTitle";
}) {
  const t = useTranslations("authPages");
  const [showModal, setShowModal] = useState(true);
  const { push } = useRouter();
  const { user } = useAuth();
  const redirectTo = useMemo(() => getRedirectTarget(), []);

  const handleClose = () => {
    setShowModal(false);
    push(redirectTo);
  };

  const handleContinue = () => {
    push(redirectTo);
  };

  if (user) {
    return (
      <main
        id="main-content"
        className="min-h-screen bg-background flex items-center justify-center px-4"
      >
        <div className="w-full max-w-md rounded-xl border border-border-subtle bg-background-secondary p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-text-primary">{t("alreadyLoggedInTitle")}</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {t("alreadyLoggedInDescription")}
          </p>
          <button
            type="button"
            onClick={handleContinue}
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            {t("continue")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="flex min-h-[calc(100svh-8rem)] items-center justify-center bg-background-muted px-4 py-8 sm:py-12"
    >
      <h1 className="sr-only">{t(srTitleKey)}</h1>
      <AuthModal
        isOpen={showModal}
        onClose={handleClose}
        initialView={initialView}
        presentation="page"
      />
    </main>
  );
}
