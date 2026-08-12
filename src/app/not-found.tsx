import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function NotFound() {
  const t = await getTranslations("notFoundPage");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-7xl font-black leading-none text-primary sm:text-8xl">404</h1>
        <p className="mt-4 text-sm text-text-secondary sm:text-base">
          {t("description")}
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover">
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
