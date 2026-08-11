import Image from "next/image";
import { cn } from "@/utils/cn";

const PAYMENT_METHODS = [
  {
    name: "Visa",
    src: "/payment-logos/visa.svg",
  },
  {
    name: "Mastercard",
    src: "/payment-logos/mastercard.svg",
  },
  {
    name: "Apple Pay",
    src: "/payment-logos/apple-pay.svg",
  },
  {
    name: "Google Pay",
    src: "/payment-logos/google-pay.svg",
  },
] as const;

export function AcceptedPaymentMethods({
  ariaLabel,
  className,
  itemClassName,
  imageClassName,
}: {
  ariaLabel: string;
  className?: string;
  itemClassName?: string;
  imageClassName?: string;
}) {
  return (
    <ul
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {PAYMENT_METHODS.map((paymentMethod) => (
        <li
          key={paymentMethod.name}
          className={cn(
            "flex h-12 items-center justify-center rounded-xl bg-white px-3 py-2",
            itemClassName,
          )}
        >
          <Image
            src={paymentMethod.src}
            alt={paymentMethod.name}
            width={120}
            height={80}
            className={cn("h-6 w-9 max-w-full object-contain", imageClassName)}
          />
        </li>
      ))}
    </ul>
  );
}
