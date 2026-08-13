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
  const domainClassName = responsiveInverse
    ? "text-white md:text-text-primary"
    : inverse
      ? "text-white"
      : "text-text-primary";

  return (
    <span className={cn("inline-flex items-center", className)} data-brand-logo>
      <span className="sr-only">
        AutoNinja{showDomain ? (marketCode === "SK" ? ".sk" : ".ro") : ""}
      </span>
      <span className="inline-flex items-baseline font-sans font-extrabold">
        {responsiveInverse ? (
          <>
            <Image
              data-brand-wordmark="inverse"
              src="/brand/autoninja/wordmark-inverse.svg"
              alt=""
              aria-hidden="true"
              width={3982}
              height={944}
              unoptimized
              className="h-[0.94em] w-auto md:hidden"
            />
            <Image
              data-brand-wordmark="default"
              src="/brand/autoninja/wordmark.svg"
              alt=""
              aria-hidden="true"
              width={3982}
              height={944}
              unoptimized
              className="hidden h-[0.94em] w-auto md:block"
            />
          </>
        ) : (
          <Image
            data-brand-wordmark={inverse ? "inverse" : "default"}
            src={
              inverse
                ? "/brand/autoninja/wordmark-inverse.svg"
                : "/brand/autoninja/wordmark.svg"
            }
            alt=""
            aria-hidden="true"
            width={3982}
            height={944}
            unoptimized
            className="h-[0.94em] w-auto"
          />
        )}
        {showDomain ? (
          <span
            aria-hidden="true"
            className={cn("ml-[0.02em] tracking-normal", domainClassName)}
          >
            {marketCode === "SK" ? ".sk" : ".ro"}
          </span>
        ) : null}
      </span>
      <Image
        src="/brand/autoninja/mascot-head.webp"
        alt=""
        width={1536}
        height={1536}
        sizes="48px"
        className={cn(
          "-ml-[0.12em] h-[1.6em] w-[1.6em] shrink-0 object-contain",
          imageClassName,
        )}
      />
    </span>
  );
}
