import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  it("uses the locked orange token and approved small-size mascot head", () => {
    const { container } = render(<BrandLogo marketCode="SK" showDomain />);

    expect(screen.getByText(".sk")).toBeInTheDocument();
    expect(screen.getByText("AutoNinja.sk")).toHaveClass("sr-only");
    expect(container.querySelector('[data-brand-wordmark="default"]')).toHaveAttribute(
      "src",
      "/brand/autoninja/wordmark.svg",
    );
    expect(container.querySelector('img[src*="mascot-head"]')).toHaveAttribute(
      "src",
      expect.stringContaining("mascot-head.webp"),
    );
  });

  it("keeps the Romanian domain suffix and inverse wordmark treatment", () => {
    const { container } = render(<BrandLogo marketCode="RO" showDomain inverse />);

    expect(container.querySelector('[data-brand-wordmark="inverse"]')).toHaveAttribute(
      "src",
      "/brand/autoninja/wordmark-inverse.svg",
    );
    expect(screen.getByText(".ro")).toHaveClass("text-white");
    expect(screen.getByText("AutoNinja.ro")).toHaveClass("sr-only");
  });
});
