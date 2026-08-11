import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketCode } from "@/config/markets";
import { MarketProvider } from "@/context/MarketContext";
import Footer from "./Footer";

const { useLocaleMock, usePathnameMock } = vi.hoisted(() => ({
  useLocaleMock: vi.fn(() => "sk"),
  usePathnameMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock("next-intl", () => ({
  useLocale: () => useLocaleMock(),
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values?.year ? `${key} ${values.year}` : key,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
    children: ReactNode;
  }) => (
    <a
      href={href}
      data-prefetch={prefetch === undefined ? undefined : String(prefetch)}
      {...props}
    >
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

function renderFooter(marketCode: MarketCode = "SK") {
  return render(
    <MarketProvider marketCode={marketCode}>
      <Footer currentYear={2026} />
    </MarketProvider>,
  );
}

describe("Footer", () => {
  it("uses the visible brand text as the footer home link accessible name", () => {
    useLocaleMock.mockReturnValue("sk");
    usePathnameMock.mockReturnValue("/cookies");

    renderFooter();

    const links = screen.getAllByRole("link", { name: "AutoNinja.sk" });

    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/");
    }
  });

  it("uses the Romanian domain label on Romanian market pages", () => {
    useLocaleMock.mockReturnValue("ro");
    usePathnameMock.mockReturnValue("/cookies");

    renderFooter("RO");

    const links = screen.getAllByRole("link", { name: "AutoNinja.ro" });

    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/");
    }
  });

  it("does not prefetch footer links from the global footer", () => {
    useLocaleMock.mockReturnValue("sk");
    usePathnameMock.mockReturnValue("/cookies");

    renderFooter();

    for (const href of [
      "/",
      "/vysledky",
      "/predajcovia",
      "/ceny",
      "/kontakt",
      "/moj-ucet?tab=create",
      "/dealer",
      "/moj-ucet",
      "/o-nas",
      "/obchodne-podmienky",
      "/ochrana-udajov",
      "/cookies",
      "/site-map",
    ]) {
      const links = screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("href") === href);

      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link).toHaveAttribute("data-prefetch", "false");
      }
    }
  });

  it("uses the compact footer at every breakpoint on the account dashboard", () => {
    useLocaleMock.mockReturnValue("sk");
    usePathnameMock.mockReturnValue("/moj-ucet");

    renderFooter();

    expect(screen.getByRole("contentinfo")).toHaveAttribute(
      "data-mobile-variant",
      "compact",
    );
    expect(document.querySelectorAll("details")).toHaveLength(0);
    expect(document.querySelector("[data-account-footer-compact]")).not.toBeNull();
    expect(document.querySelector("[data-full-footer-desktop]")).toBeNull();
    expect(screen.getAllByRole("link", { name: "AutoNinja.sk" })).toHaveLength(1);
  });

  it("does not show inactive social profiles or payment methods on general pages", () => {
    useLocaleMock.mockReturnValue("sk");
    usePathnameMock.mockReturnValue("/cookies");

    renderFooter();

    expect(screen.queryByLabelText("Facebook")).toBeNull();
    expect(screen.queryByRole("list", { name: "acceptedPaymentMethods" })).toBeNull();
  });

  it("shows localized payment methods on the pricing page", () => {
    useLocaleMock.mockReturnValue("sk");
    usePathnameMock.mockReturnValue("/ceny");

    renderFooter();

    expect(screen.getByRole("list", { name: "acceptedPaymentMethods" })).toBeVisible();
  });
});
