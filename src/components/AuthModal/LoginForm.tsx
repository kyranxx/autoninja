
import React from "react";
import { EnvelopeSimple, LockSimple, Eye, EyeSlash } from "@phosphor-icons/react";
import { InputIcon, Spinner } from "./shared";
import { useIconWeight } from "@/context/IconWeightContext";

/* ─── Login form ─── */

function LoginForm({
  email,
  password,
  loading,
  showPassword,
  loginEmailRef,
  onSubmit,
  onForgotPassword,
  onEmailChange,
  onPasswordChange,
  onTogglePassword,
  t,
}: {
  email: string;
  password: string;
  loading: boolean;
  showPassword: boolean;
  loginEmailRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (event: React.FormEvent) => void;
  onForgotPassword: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const { weight } = useIconWeight();
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      {/* Email */}
      <div className="relative">
        <InputIcon><EnvelopeSimple weight={weight} className="size-4" /></InputIcon>
        <input
          ref={loginEmailRef}
          type="email"
          id="auth-login-email"
          name="auth-login-email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder={t("login.emailPlaceholder")}
          className="input w-full h-12 !pl-12"
          autoComplete="email"
        />
      </div>

      {/* Password */}
      <div className="relative">
        <InputIcon><LockSimple weight={weight} className="size-4" /></InputIcon>
        <input
          type={showPassword ? "text" : "password"}
          id="auth-login-password"
          name="auth-login-password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          placeholder={t("login.passwordPlaceholder")}
          className="input w-full h-12 !pl-12 !pr-12"
          autoComplete="current-password"
        />
        <button
          type="button"
          onClick={onTogglePassword}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary cursor-pointer"
          aria-label={t("aria.togglePassword")}
        >
          {showPassword ? <EyeSlash weight={weight} className="size-4" /> : <Eye weight={weight} className="size-4" />}
        </button>
      </div>

      {/* Forgot password */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onForgotPassword}
          className="cursor-pointer text-sm text-primary underline decoration-accent decoration-2 underline-offset-2 transition-colors hover:text-primary-hover"
        >
          {t("login.forgotPassword")}
        </button>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="btn-accent w-full h-12 rounded-xl font-semibold disabled:opacity-50 cursor-pointer"
      >
        {loading ? <Spinner /> : t("login.submit")}
      </button>
    </form>
  );
}


export default LoginForm;
