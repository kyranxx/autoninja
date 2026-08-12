
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";
import { AuthView, AuthModalController } from "./types";
import { useIconWeight } from "@/context/IconWeightContext";

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: AuthView;
  presentation?: "modal" | "page";
}

import { pushClass, GoogleIcon } from "./shared";
import { BrandedPanel, MobileBrandStrip } from "./BrandedPanel";
import { useAuthModalController } from "./useAuthModal";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import ResetForm from "./ResetForm";
import VerifyView from "./VerifyView";

/* ─── Form content switcher ─── */

function AuthFormContent({
  controller,
  t,
}: {
  controller: AuthModalController;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const { state } = controller;

  return (
    <div key={state.view} className="animate-fade-in">
      {/* Header */}
      <div className={state.view === "register" ? "mb-4" : "mb-6"}>
        <h2 className={`font-semibold text-text-primary ${state.view === "register" ? "text-xl" : "text-2xl"}`}>
          {state.view === "login" && t("header.loginTitle")}
          {state.view === "register" && t("header.registerTitle")}
          {state.view === "reset" && t("header.resetTitle")}
          {state.view === "verify" && t("header.verifyTitle")}
        </h2>
        {state.view !== "reset" ? (
          <p className="text-sm text-text-tertiary mt-0.5">
            {state.view === "login" && t("header.loginSubtitle")}
            {state.view === "register" && t("header.registerSubtitle")}
            {state.view === "verify" && t("header.verifySubtitle")}
          </p>
        ) : null}
      </div>

      {/* Social login (top, for login & register only) */}
      {(state.view === "login" || state.view === "register") && (
        <div className={state.view === "register" ? "mb-3" : "mb-5"}>
          <button
            type="button"
            onClick={controller.handleGoogleLogin}
            className={`w-full flex items-center justify-center gap-3 py-2.5 border border-[var(--color-primary)] rounded-xl text-sm font-semibold text-text-primary hover:shadow-sm transition-all cursor-pointer ${pushClass}`}
            style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, white)" }}
          >
            <GoogleIcon />
            <span>{t("social.continueWithGoogle")}</span>
          </button>

          {/* Divider */}
          <div className={`relative ${state.view === "register" ? "my-3" : "my-5"}`}>
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-subtle" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-background-secondary text-xs text-text-tertiary uppercase tracking-wider">
                {t("social.or")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Forms */}
      {state.view === "login" && (
        <LoginForm
          email={state.email}
          password={state.password}
          loading={state.loading}
          showPassword={state.showPassword}
          loginEmailRef={controller.loginEmailRef}
          onSubmit={controller.handleLogin}
          onForgotPassword={() => controller.changeView("reset")}
          onEmailChange={(value) => controller.setField("email", value)}
          onPasswordChange={(value) => controller.setField("password", value)}
          onTogglePassword={controller.toggleShowPassword}
          t={t}
        />
      )}

      {state.view === "register" && (
        <RegisterForm
          state={state}
          loading={state.loading}
          canSubmitRegister={controller.canSubmitRegister}
          hasMinLength={controller.hasMinLength}
          hasLetterAndNumber={controller.hasLetterAndNumber}
          passwordsMatch={controller.passwordsMatch}
          passwordStrength={controller.passwordStrength}
          registerNameRef={controller.registerNameRef}
          onSubmit={controller.handleRegister}
          onFieldChange={controller.setField}
          onTogglePassword={controller.toggleShowPassword}
          onToggleConfirmPassword={controller.toggleShowConfirmPassword}
          onTermsChange={controller.setAgreedToTerms}
          onDealerIntentChange={controller.setDealerIntent}
          onBackToLogin={() => controller.changeView("login")}
          t={t}
        />
      )}

      {state.view === "reset" && (
        <ResetForm
          email={state.email}
          loading={state.loading}
          resetEmailRef={controller.resetEmailRef}
          onSubmit={controller.handleResetPassword}
          onBackToLogin={() => controller.changeView("login")}
          onEmailChange={(value) => controller.setField("email", value)}
          t={t}
        />
      )}

      {state.view === "verify" && (
        <VerifyView
          email={state.email}
          resendLoading={state.resendLoading}
          resendCooldown={state.resendCooldown}
          onResend={controller.handleResendConfirmation}
          onBackToLogin={() => controller.changeView("login")}
          t={t}
        />
      )}
    </div>
  );
}


/* ─── Footer ─── */

function AuthModalFooter({
  view,
  onChangeView,
  t,
}: {
  view: AuthView;
  onChangeView: (view: AuthView) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <div className="px-6 py-4 bg-background-tertiary/40 border-t border-border-subtle text-center">
      {view === "login" ? (
        <p className="text-sm text-text-secondary">
          {t("footer.noAccount")}{" "}
          <button
            type="button"
            onClick={() => onChangeView("register")}
            className="text-[var(--color-brand-accent-on-light)] font-semibold hover:underline cursor-pointer"
          >
            {t("footer.register")}
          </button>
        </p>
      ) : view === "register" ? (
        <p className="text-sm text-text-secondary">
          {t("footer.hasAccount")}{" "}
          <button
            type="button"
            onClick={() => onChangeView("login")}
            className="text-[var(--color-brand-accent-on-light)] font-semibold hover:underline cursor-pointer"
          >
            {t("footer.login")}
          </button>
        </p>
      ) : view === "verify" ? (
        <button
          type="button"
          onClick={() => onChangeView("login")}
          className="text-sm text-[var(--color-brand-accent-on-light)] font-semibold hover:underline cursor-pointer"
        >
          {t("footer.goToLogin")}
        </button>
      ) : null}
    </div>
  );
}


/* ─── Main export ─── */

export default function AuthModal({
  isOpen,
  onClose,
  initialView = "login",
  presentation = "modal",
}: AuthModalProps) {
  const t = useTranslations("authModal");
  const { weight } = useIconWeight();
  const isPagePresentation = presentation === "page";
  const controller = useAuthModalController({
    isOpen,
    onClose,
    initialView,
    t,
    lockDocumentScroll: !isPagePresentation,
  });

  if (!isOpen) return null;

  return (
    <div
      className={
        isPagePresentation
          ? "relative flex w-full items-center justify-center"
          : "fixed inset-0 z-[200] flex items-center justify-center p-4"
      }
    >
      {isPagePresentation ? null : (
        <button
          type="button"
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          aria-label={t("aria.closeBackdrop")}
          onClick={controller.closeModal}
        />
      )}

      <div
        className={`relative grid w-full max-w-[860px] grid-cols-1 grid-rows-[1fr] overflow-hidden rounded-2xl border border-border bg-background-secondary shadow-xl md:grid-cols-[340px_1fr] ${
          isPagePresentation ? "" : "max-h-[92vh] animate-modal-in"
        }`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={controller.closeModal}
          className={`absolute top-3 right-3 z-20 size-9 flex items-center justify-center rounded-full border border-border bg-background-secondary/90 text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-colors cursor-pointer ${pushClass}`}
          aria-label={t("aria.closeButton")}
        >
          <X weight={weight} className="size-4" />
        </button>

        {/* Left branded panel (desktop) */}
        <BrandedPanel t={t} emphasizeLogo={controller.state.view === "reset"} />

        {/* Right form side */}
        <div className={`flex min-h-0 flex-col overflow-hidden ${isPagePresentation ? "" : "max-h-[92vh]"}`}>
          {/* Mobile brand strip */}
          <MobileBrandStrip
            t={t}
            emphasizeLogo={controller.state.view === "reset"}
          />

          <div className="flex-1 min-h-0 px-4 py-5 sm:px-8 sm:py-6 overflow-y-auto scrollbar-thin">
            <AuthFormContent controller={controller} t={t} />
          </div>

          <AuthModalFooter
            view={controller.state.view}
            onChangeView={controller.changeView}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}
