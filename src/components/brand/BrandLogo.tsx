import Image from "next/image";
import { cn } from "@/utils/cn";
import type { MarketCode } from "@/config/markets";

type BrandLogoProps = {
  marketCode: MarketCode;
  className?: string;
  imageClassName?: string;
  inverse?: boolean;
  responsiveInverse?: boolean;
  showDomain?: boolean;
};

export function BrandLogo({
  marketCode,
  className,
  imageClassName,
  inverse = false,
  responsiveInverse = false,
  showDomain = false,
}: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      <span className="font-sans font-black tracking-[-0.055em]">
        <span
          className={cn(
            responsiveInverse
              ? "text-white md:text-text-primary"
              : inverse
                ? "text-white"
                : "text-text-primary",
          )}
        >
          Auto
        </span>
        <span
          className={cn(
            responsiveInverse
              ? "text-brand-accent-on-dark md:text-brand-accent-on-light"
              : inverse
                ? "text-brand-accent-on-dark"
                : "text-brand-accent-on-light",
          )}
        >
          Ninja
        </span>
        {showDomain ? (
          <span className={cn("tracking-normal", inverse ? "text-white" : "text-text-primary")}>
            {marketCode === "SK" ? ".sk" : ".ro"}
          </span>
        ) : null}
      </span>
      <Image
        src="/brand/autoninja/mascot-kimono-black-final-optimized.webp"
        alt=""
        width={108}
        height={195}
        sizes="72px"
        className={cn(
          "-ml-[0.36em] h-[2.15em] w-[1.45em] shrink-0 translate-y-[0.16em] object-contain object-left",
          imageClassName,
        )}
      />
    </span>
  );
}
