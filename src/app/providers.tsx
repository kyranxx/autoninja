"use client";

import type { ReactNode } from "react";
import type { AbstractIntlMessages } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import CookieBanner from "@/components/CookieBanner";
import GoogleOneTap from "@/components/GoogleOneTap";
import WebVitalsReporter from "@/components/monitoring/WebVitalsReporter";
import { AuthProvider } from "@/context/AuthContext";
import { IconWeightProvider } from "@/context/IconWeightContext";
import IconWeightSwitcher from "@/components/ui/IconWeightSwitcher";
import { MarketProvider } from "@/context/MarketContext";
import type { MarketCode } from "@/config/markets";

const showIconWeightSwitcher =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_SHOW_ICON_WEIGHT_SWITCHER === "true";

interface AppProvidersProps {
  children: ReactNode;
  googleOneTapClientId: string | null;
  googleOneTapEnabled: boolean;
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  marketCode: MarketCode;
}

export default function AppProviders({
  children,
  googleOneTapClientId,
  googleOneTapEnabled,
  locale,
  messages,
  timeZone,
  marketCode,
}: AppProvidersProps) {
  const pathname = usePathname();
  const showDevIconControls = showIconWeightSwitcher && pathname !== "/";

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
    >
      <MarketProvider marketCode={marketCode}>
        <IconWeightProvider>
          <AuthProvider>
            {children}
            {showDevIconControls ? <IconWeightSwitcher /> : null}
            <WebVitalsReporter />
            <GoogleOneTap
              clientId={googleOneTapClientId}
              enabled={googleOneTapEnabled}
              marketCode={marketCode}
            />
            <CookieBanner />
            <Toaster
              position="top-right"
              closeButton
              expand={false}
              visibleToasts={3}
              gap={10}
              toastOptions={{
                duration: 5000,
                className: "font-sans sonner-toast-card",
              }}
            />
          </AuthProvider>
        </IconWeightProvider>
      </MarketProvider>
    </NextIntlClientProvider>
  );
}
