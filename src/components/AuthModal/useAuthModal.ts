
import { useCallback, useEffect, useReducer, useRef, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_MODAL_CONFIG } from "@/config/config";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { oauthProviderUrlMatchesExpectedCallback, resolveOAuthCallbackUrl } from "@/lib/auth/oauth-redirect";
import { createCsrfHeaders } from "@/lib/security/client-csrf";
import {
  createRegisterClientSchema,
  loginSchema,
  passwordResetRequestSchema,
} from "@/lib/validation/forms";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AuthView, AuthField, PasswordStrength, AuthState, AuthModalController } from "./types";


type AuthAction =
  | { type: "setField"; field: AuthField; value: string }
  | { type: "setView"; view: AuthView }
  | { type: "resetAll"; view: AuthView }
  | { type: "setLoading"; value: boolean }
  | { type: "setResendLoading"; value: boolean }
  | { type: "setResendCooldown"; value: number }
  | { type: "tickResendCooldown" }
  | { type: "toggleShowPassword" }
  | { type: "toggleShowConfirmPassword" }
  | { type: "setAgreedToTerms"; value: boolean }
  | { type: "setDealerIntent"; value: boolean };

type AuthResponsePayload = {
  alreadyRegistered?: boolean;
  error?: string;
  ok?: boolean;
} | null;

function createInitialState(initialView: AuthView): AuthState {
  return {
    view: initialView,
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    loading: false,
    resendLoading: false,
    resendCooldown: 0,
    showPassword: false,
    showConfirmPassword: false,
    agreedToTerms: false,
    wantsDealerAccount: false,
    viewTransitioning: false,
  };
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "setField":
      return { ...state, [action.field]: action.value };
    case "setView":
      return {
        ...state,
        view: action.view,
        password: "",
        confirmPassword: "",
        showPassword: false,
        showConfirmPassword: false,
        viewTransitioning: false,
      };
    case "resetAll":
      return createInitialState(action.view);
    case "setLoading":
      return { ...state, loading: action.value };
    case "setResendLoading":
      return { ...state, resendLoading: action.value };
    case "setResendCooldown":
      return { ...state, resendCooldown: action.value };
    case "tickResendCooldown":
      return {
        ...state,
        resendCooldown: state.resendCooldown > 0 ? state.resendCooldown - 1 : 0,
      };
    case "toggleShowPassword":
      return { ...state, showPassword: !state.showPassword };
    case "toggleShowConfirmPassword":
      return { ...state, showConfirmPassword: !state.showConfirmPassword };
    case "setAgreedToTerms":
      return { ...state, agreedToTerms: action.value };
    case "setDealerIntent":
      return { ...state, wantsDealerAccount: action.value };
    default:
      return state;
  }
}

function shouldAutoFocusAuthField() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }

  return !(
    window.matchMedia(AUTH_MODAL_CONFIG.coarsePointerMediaQuery).matches
    || window.matchMedia(AUTH_MODAL_CONFIG.noHoverMediaQuery).matches
  );
}

export function useAuthModalController({
  isOpen,
  onClose,
  initialView,
  t,
  lockDocumentScroll = true,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialView: AuthView;
  t: (key: string, values?: Record<string, string | number>) => string;
  lockDocumentScroll?: boolean;
}): AuthModalController {
  const [state, dispatch] = useReducer(authReducer, initialView, createInitialState);
  const router = useRouter();
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const registerClientSchema = useMemo(
    () =>
      createRegisterClientSchema({
        fullNameRequired: t("errors.fillRequired"),
        fullNameTooLong: t("errors.fillRequired"),
        invalidEmail: t("errors.fillRequired"),
        passwordMinLength: t("errors.passwordMinLength"),
        passwordsMismatch: t("errors.passwordsMismatch"),
        mustAgreeTerms: t("errors.mustAgreeTerms"),
      }),
    [t],
  );
  const loginEmailRef = useRef<HTMLInputElement>(null);
  const registerNameRef = useRef<HTMLInputElement>(null);
  const resetEmailRef = useRef<HTMLInputElement>(null);

  const getSupabaseClient = useCallback(async (): Promise<SupabaseClient | null> => {
    if (typeof window === "undefined") {
      return null;
    }

    if (supabaseRef.current) {
      return supabaseRef.current;
    }

    const { createClient } = await import("@/lib/supabase/client");
    const client = createClient();
    supabaseRef.current = client;
    return client;
  }, []);

  const closeModal = useCallback(() => {
    dispatch({ type: "resetAll", view: initialView });
    onClose();
  }, [initialView, onClose]);

  const changeView = (nextView: AuthView) => {
    dispatch({ type: "setView", view: nextView });
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };

    document.addEventListener("keydown", handleEscape);
    if (lockDocumentScroll) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      if (lockDocumentScroll) {
        document.body.style.overflow = "";
      }
    };
  }, [isOpen, closeModal, lockDocumentScroll]);

  useEffect(() => {
    if (!isOpen || !shouldAutoFocusAuthField()) return;

    if (state.view === "login") {
      loginEmailRef.current?.focus();
      return;
    }
    if (state.view === "register") {
      registerNameRef.current?.focus();
      return;
    }
    if (state.view === "reset") {
      resetEmailRef.current?.focus();
    }
  }, [isOpen, state.view]);

  useEffect(() => {
    if (state.resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      dispatch({ type: "tickResendCooldown" });
    }, AUTH_MODAL_CONFIG.resendCooldownTickMs);
    return () => window.clearInterval(timer);
  }, [state.resendCooldown]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state.loading) return;

    if (!loginSchema.safeParse({
      email: state.email,
      password: state.password,
    }).success) {
      toast.error(t("errors.fillEmailPassword"));
      return;
    }

    dispatch({ type: "setLoading", value: true });
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        toast.error(t("errors.loginFailed"));
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: state.email.trim(),
        password: state.password,
      });

      if (error) {
        if (error.message === "Invalid login credentials") {
          toast.error(t("errors.invalidCredentials"));
        } else if (error.message.includes("Email not confirmed")) {
          toast.error(t("errors.emailNotConfirmed"));
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success(t("success.login"));
      closeModal();
      router.refresh();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof Error) toast.error(error.message);
      else toast.error(t("errors.loginFailed"));
    } finally {
      dispatch({ type: "setLoading", value: false });
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();

    const parsedRegister = registerClientSchema.safeParse({
      email: state.email,
      password: state.password,
      confirmPassword: state.confirmPassword,
      fullName: state.fullName,
      agreedToTerms: state.agreedToTerms,
      dealerInterest: state.wantsDealerAccount,
    });

    if (!parsedRegister.success) {
      toast.error(parsedRegister.error.issues[0]?.message || t("errors.fillRequired"));
      return;
    }

    dispatch({ type: "setLoading", value: true });
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: createCsrfHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          email: parsedRegister.data.email,
          password: parsedRegister.data.password,
          fullName: parsedRegister.data.fullName,
          dealerInterest: parsedRegister.data.dealerInterest,
        }),
      });

      const payload = (await response.json().catch(() => null)) as AuthResponsePayload;

      if (!response.ok) {
        toast.error(payload?.error || t("errors.registerFailed"));
        return;
      }

      if (payload?.alreadyRegistered) {
        toast.error(t("errors.alreadyRegistered"));
        changeView("login");
        return;
      }

      toast.success(t("success.register"));
      changeView("verify");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof Error) toast.error(error.message);
      else toast.error(t("errors.registerFailed"));
    } finally {
      dispatch({ type: "setLoading", value: false });
    }
  };

  const handleResendConfirmation = async () => {
    if (!state.email) {
      toast.error(t("errors.missingEmail"));
      return;
    }

    if (state.resendCooldown > 0 || state.resendLoading) return;

    dispatch({ type: "setResendLoading", value: true });
    try {
      const response = await fetch("/api/auth/register/resend", {
        method: "POST",
        headers: createCsrfHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          email: state.email.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as AuthResponsePayload;

      if (!response.ok) {
        toast.error(payload?.error || t("errors.resendFailed"));
        return;
      }

      toast.success(t("success.resend"));
      dispatch({
        type: "setResendCooldown",
        value: AUTH_MODAL_CONFIG.resendCooldownSeconds,
      });
    } catch (error) {
      if (error instanceof Error) toast.error(error.message);
      else toast.error(t("errors.resendFailed"));
    } finally {
      dispatch({ type: "setResendLoading", value: false });
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!passwordResetRequestSchema.safeParse({ email: state.email }).success) {
      toast.error(t("errors.resetEmailMissing"));
      return;
    }

    dispatch({ type: "setLoading", value: true });
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: createCsrfHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          email: state.email.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as AuthResponsePayload;

      if (!response.ok) {
        toast.error(payload?.error || t("errors.resetFailed"));
        return;
      }

      toast.success(t("success.reset"));
      changeView("login");
    } catch (error) {
      if (error instanceof Error) toast.error(error.message);
      else toast.error(t("errors.resetFailed"));
    } finally {
      dispatch({ type: "setLoading", value: false });
    }
  };

  const handleGoogleLogin = async () => {
    dispatch({ type: "setLoading", value: true });
    const redirectTo = resolveOAuthCallbackUrl();
    const supabase = await getSupabaseClient();

    if (!supabase) {
      toast.error(t("errors.oauthUrlMissing"));
      dispatch({ type: "setLoading", value: false });
      return;
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      toast.error(error.message);
      dispatch({ type: "setLoading", value: false });
      return;
    }

    if (!data?.url) {
      toast.error(t("errors.oauthUrlMissing"));
      dispatch({ type: "setLoading", value: false });
      return;
    }

    if (!oauthProviderUrlMatchesExpectedCallback(data.url, redirectTo)) {
      toast.error(t("errors.oauthRedirectMismatch", { redirectTo }));
      dispatch({ type: "setLoading", value: false });
      return;
    }

    window.location.assign(data.url);
  };

  const analyzePassword = (pw: string) => {
    const minLen = pw.length >= MIN_PASSWORD_LENGTH;
    const hasLetterAndNumber = /[A-Za-z]/.test(pw) && /\d/.test(pw);
    const strength: PasswordStrength = !pw
      ? null
      : pw.length >= 10 && hasLetterAndNumber
        ? "strong"
        : pw.length >= 8 && hasLetterAndNumber
          ? "medium"
          : "weak";
    return { hasMinLength: minLen, hasLetterAndNumber, strength };
  };

  const { hasMinLength, hasLetterAndNumber, strength: passwordStrength } = analyzePassword(state.password);
  const passwordsMatch =
    state.confirmPassword.length > 0 && state.password === state.confirmPassword;
  const canSubmitRegister =
    !!state.email &&
    !!state.fullName &&
    !!state.password &&
    !!state.confirmPassword &&
    hasMinLength &&
    passwordsMatch &&
    state.agreedToTerms;

  return {
    state,
    passwordStrength,
    hasMinLength,
    hasLetterAndNumber,
    passwordsMatch,
    canSubmitRegister,
    loginEmailRef,
    registerNameRef,
    resetEmailRef,
    closeModal,
    changeView,
    handleLogin,
    handleRegister,
    handleResetPassword,
    handleResendConfirmation,
    handleGoogleLogin,
    setField: (field, value) => dispatch({ type: "setField", field, value }),
    toggleShowPassword: () => dispatch({ type: "toggleShowPassword" }),
    toggleShowConfirmPassword: () => dispatch({ type: "toggleShowConfirmPassword" }),
    setAgreedToTerms: (checked) => dispatch({ type: "setAgreedToTerms", value: checked }),
    setDealerIntent: (checked) => dispatch({ type: "setDealerIntent", value: checked }),
  };
}
