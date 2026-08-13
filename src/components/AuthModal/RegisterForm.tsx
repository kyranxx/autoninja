
import React from "react";
import Link from "next/link";
import { EnvelopeSimple, LockSimple, User, Eye, EyeSlash, ArrowLeft } from "@phosphor-icons/react";
import { AuthField, PasswordStrength, AuthState } from "./types";
import { useIconWeight } from "@/context/IconWeightContext";

import { pushClass, InputIcon, Spinner } from "./shared";


function getPasswordStrengthLabel(
  strength: PasswordStrength,
  t: (key: string) => string,
): string {
  switch (strength) {
    case "strong":
      return t("passwordStrength.strong");
    case "medium":
      return t("passwordStrength.medium");
    case "weak":
      return t("passwordStrength.weak");
    default:
      return "";
  }
}

function getPasswordStrengthWidth(strength: PasswordStrength): string {
  switch (strength) {
    case "strong":
      return "100%";
    case "medium":
      return "66%";
    case "weak":
      return "33%";
    default:
      return "0%";
  }
}

function getPasswordStrengthBarClass(strength: PasswordStrength): string {
  switch (strength) {
    case "strong":
      return "bg-success";
    case "medium":
      return "bg-warning";
    case "weak":
      return "bg-error";
    default:
      return "bg-transparent";
  }
}

function getPasswordStrengthTextClass(strength: PasswordStrength): string {
  switch (strength) {
    case "strong":
      return "text-success";
    case "medium":
      return "text-warning";
    case "weak":
      return "text-error";
    default:
      return "text-text-tertiary";
  }
}

/* ─── Register form ─── */

function RegisterForm({
  state,
  loading,
  canSubmitRegister,
  hasMinLength,
  hasLetterAndNumber,
  passwordsMatch,
  passwordStrength,
  registerNameRef,
  onSubmit,
  onFieldChange,
  onTogglePassword,
  onToggleConfirmPassword,
  onTermsChange,
  onDealerIntentChange,
  onBackToLogin,
  t,
}: {
  state: AuthState;
  loading: boolean;
  canSubmitRegister: boolean;
  hasMinLength: boolean;
  hasLetterAndNumber: boolean;
  passwordsMatch: boolean;
  passwordStrength: PasswordStrength;
  registerNameRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (event: React.FormEvent) => void;
  onFieldChange: (field: AuthField, value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmPassword: () => void;
  onTermsChange: (checked: boolean) => void;
  onDealerIntentChange: (checked: boolean) => void;
  onBackToLogin: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const { weight } = useIconWeight();
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-2.5">
      {/* Full name */}
      <div className="relative">
        <InputIcon><User weight={weight} className="size-4" /></InputIcon>
        <input
          ref={registerNameRef}
          type="text"
          id="auth-register-full-name"
          name="auth-register-full-name"
          value={state.fullName}
          onChange={(event) => onFieldChange("fullName", event.target.value)}
          placeholder={t("register.fullNamePlaceholder")}
          className="input w-full h-12 !pl-12"
          autoComplete="name"
        />
      </div>

      {/* Email */}
      <div className="relative">
        <InputIcon><EnvelopeSimple weight={weight} className="size-4" /></InputIcon>
        <input
          type="email"
          id="auth-register-email"
          name="auth-register-email"
          value={state.email}
          onChange={(event) => onFieldChange("email", event.target.value)}
          placeholder={t("register.emailPlaceholder")}
          className="input w-full h-12 !pl-12"
          autoComplete="email"
        />
      </div>

      {/* Password */}
      <div className="relative">
        <InputIcon><LockSimple weight={weight} className="size-4" /></InputIcon>
        <input
          type={state.showPassword ? "text" : "password"}
          id="auth-register-password"
          name="auth-register-password"
          value={state.password}
          onChange={(event) => onFieldChange("password", event.target.value)}
          placeholder={t("register.passwordPlaceholder")}
          className="input w-full h-12 !pl-12 !pr-12"
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={onTogglePassword}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary cursor-pointer"
          aria-label={t("aria.togglePassword")}
        >
          {state.showPassword ? (
            <EyeSlash weight={weight} className="size-4" />
          ) : (
            <Eye weight={weight} className="size-4" />
          )}
        </button>
      </div>

      {/* Strength bar + checklist combined */}
      <div className="space-y-1">
        <div className="h-1 rounded-full bg-background-tertiary overflow-hidden">
          <div
            className={`h-full transition-all duration-200 ${getPasswordStrengthBarClass(passwordStrength)}`}
            style={{ width: getPasswordStrengthWidth(passwordStrength) }}
            data-testid="register-password-strength-bar"
          />
        </div>
        <p
          className={`text-xs font-semibold ${getPasswordStrengthTextClass(passwordStrength)}`}
          data-testid="register-password-strength-label"
        >
          {getPasswordStrengthLabel(passwordStrength, (key) => t(key))}
        </p>
        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <span className={hasMinLength ? "text-success" : undefined}>
            {hasMinLength ? "✓" : "○"} {t("register.minLengthChecklist")}
          </span>
          <span className={hasLetterAndNumber ? "text-success" : undefined}>
            {hasLetterAndNumber ? "✓" : "○"} {t("register.letterNumberChecklist")}
          </span>
        </div>
      </div>

      {/* Confirm password */}
      <div className="relative">
        <InputIcon><LockSimple weight={weight} className="size-4" /></InputIcon>
        <input
          type={state.showConfirmPassword ? "text" : "password"}
          id="auth-register-confirm-password"
          name="auth-register-confirm-password"
          value={state.confirmPassword}
          onChange={(event) => onFieldChange("confirmPassword", event.target.value)}
          placeholder={t("register.confirmPasswordPlaceholder")}
          className="input w-full h-12 !pl-12 !pr-12"
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={onToggleConfirmPassword}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary cursor-pointer"
          aria-label={t("aria.toggleConfirmPassword", { fallback: "Zobraziť heslo" })}
        >
          {state.showConfirmPassword ? <EyeSlash weight={weight} className="size-4" /> : <Eye weight={weight} className="size-4" />}
        </button>
      </div>
      {state.confirmPassword.length > 0 && (
        <p
          className={`text-xs ${passwordsMatch ? "text-success" : "text-error"}`}
          data-testid="register-password-match"
        >
          {passwordsMatch ? t("register.passwordsMatch") : t("register.passwordsDoNotMatch")}
        </p>
      )}

      {/* Terms */}
      <label
        htmlFor="auth-register-terms"
        className="flex items-start gap-2 text-xs text-text-secondary cursor-pointer"
      >
        <input
          type="checkbox"
          id="auth-register-terms"
          name="auth-register-terms"
          checked={state.agreedToTerms}
          onChange={(event) => onTermsChange(event.target.checked)}
          className="mt-0.5 size-4 rounded border-border text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-background-secondary cursor-pointer"
        />
        <span>
          {t("register.termsStart")}{" "}
          <Link
            href="/obchodne-podmienky"
            className="text-primary underline decoration-accent decoration-2 underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("register.termsLink")}
          </Link>{" "}
          {` ${t("register.and")} `}
          <Link
            href="/ochrana-udajov"
            className="text-primary underline decoration-accent decoration-2 underline-offset-2"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("register.privacyLink")}
          </Link>
        </span>
      </label>

      {/* Dealer intent */}
      <label
        htmlFor="auth-register-dealer-intent"
        className="flex items-start gap-2 text-xs text-text-secondary cursor-pointer"
      >
        <input
          type="checkbox"
          id="auth-register-dealer-intent"
          name="auth-register-dealer-intent"
          checked={state.wantsDealerAccount}
          onChange={(event) => onDealerIntentChange(event.target.checked)}
          className="mt-0.5 size-4 rounded border-border text-[var(--color-primary)] focus:ring-[var(--color-primary)] bg-background-secondary cursor-pointer"
        />
        <span>
          {t("register.dealerIntent")}
        </span>
      </label>

      {state.wantsDealerAccount ? (
        <p className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs text-text-secondary">
          {t("register.dealerHint")}
        </p>
      ) : null}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !canSubmitRegister}
        className="btn-accent w-full h-12 rounded-xl font-semibold disabled:opacity-50 cursor-pointer"
      >
        {loading ? <Spinner /> : t("register.submit")}
      </button>

      {/* Back to login */}
      <button
        type="button"
        onClick={onBackToLogin}
        className={`w-full flex items-center justify-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary transition-colors cursor-pointer ${pushClass}`}
      >
        <ArrowLeft weight={weight} className="size-3.5" />
        {t("reset.backToLogin")}
      </button>
    </form>
  );
}


export default RegisterForm;
