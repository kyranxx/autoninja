export const INTERNAL_MARKET_HEADER = "x-autoninja-market";

export type MarketRouteMapping = {
  internalPath: string;
  publicPath: string;
  match: "exact" | "prefix";
};

export type MarketDefinition<TCode extends string = string> = {
  code: TCode;
  countryCode: string;
  brandName: string;
  domain: string;
  origin: string;
  locale: string;
  languageTag: string;
  currency: string;
  timeZone: string;
  callingCode: string;
  phonePlaceholder: string;
  hosts: readonly string[];
  routeMappings: readonly MarketRouteMapping[];
  presentation: {
    sellerImageAlt: string;
  };
  contact: {
    email: string;
    phoneDisplay: string | null;
    phoneHref: string | null;
    postalAddressLines: readonly string[];
  };
  copy: {
    llmsDescription: string;
    listingDescriptionAction: string;
    authEmail: {
      defaultUserName: string;
      registrationSubject: string;
      registrationIntro: string;
      registrationAction: string;
      registrationLogin: string;
      passwordResetSubject: string;
      passwordResetIntro: string;
      passwordResetAction: string;
      passwordResetIgnore: string;
      supportLabel: string;
    };
  };
  services: {
    googleOneTapDefaultEnabled: boolean;
    googleClientIdEnvVar?: string;
    clarityProjectId?: string;
  };
};

const IDENTITY_ROUTE_MAPPINGS: readonly MarketRouteMapping[] = [];

export const MARKET_DEFINITIONS = [
  {
    code: "SK",
    countryCode: "SK",
    brandName: "AutoNinja",
    domain: "www.autoninja.sk",
    origin: "https://www.autoninja.sk",
    locale: "sk",
    languageTag: "sk-SK",
    currency: "EUR",
    timeZone: "Europe/Bratislava",
    callingCode: "421",
    phonePlaceholder: "+421 XXX XXX XXX",
    hosts: ["autoninja.sk", "www.autoninja.sk"],
    routeMappings: IDENTITY_ROUTE_MAPPINGS,
    presentation: {
      sellerImageAlt: "Predajné priestory s vozidlami",
    },
    contact: {
      email: "info@autoninja.sk",
      phoneDisplay: null,
      phoneHref: null,
      postalAddressLines: [
        "Karpatské námestie 10A",
        "831 06 Bratislava - mestská časť Rača",
        "Slovensko",
      ],
    },
    copy: {
      llmsDescription:
        "AutoNinja is a Slovakia-focused car marketplace for used and new vehicle listings.",
      listingDescriptionAction: "Kúpte na AutoNinja.",
      authEmail: {
        defaultUserName: "Používateľ",
        registrationSubject: "Potvrdenie registrácie",
        registrationIntro: "Potvrďte registráciu na",
        registrationAction: "Dokončite aktiváciu účtu tu",
        registrationLogin: "Prihlásenie po potvrdení",
        passwordResetSubject: "Obnovenie hesla",
        passwordResetIntro: "Obnovenie hesla pre účet",
        passwordResetAction: "Nastavte nové heslo tu",
        passwordResetIgnore:
          "Ak ste o zmenu hesla nežiadali, tento e-mail môžete ignorovať.",
        supportLabel: "Podpora",
      },
    },
    services: {
      googleOneTapDefaultEnabled: true,
      googleClientIdEnvVar: "NEXT_PUBLIC_AUTONINJA_SK_GOOGLE_CLIENT_ID",
      clarityProjectId: process.env.NEXT_PUBLIC_CLARITY_ID_SK,
    },
  },
  {
    code: "RO",
    countryCode: "RO",
    brandName: "AutoNinja",
    domain: "www.autoninja.ro",
    origin: "https://www.autoninja.ro",
    locale: "ro",
    languageTag: "ro-RO",
    currency: "EUR",
    timeZone: "Europe/Bucharest",
    callingCode: "40",
    phonePlaceholder: "+40 XXX XXX XXX",
    hosts: ["autoninja.ro", "www.autoninja.ro", "autoninja.localhost"],
    routeMappings: [
      { internalPath: "/moj-ucet", publicPath: "/contul-meu", match: "prefix" },
      { internalPath: "/vysledky", publicPath: "/masini", match: "prefix" },
      { internalPath: "/predajcovia", publicPath: "/dealeri", match: "exact" },
      { internalPath: "/predajca", publicPath: "/dealeri", match: "prefix" },
      {
        internalPath: "/kalkulacka-leasingu",
        publicPath: "/calculator-leasing",
        match: "prefix",
      },
      { internalPath: "/ceny", publicPath: "/preturi", match: "prefix" },
      { internalPath: "/kontakt", publicPath: "/contact", match: "prefix" },
      { internalPath: "/o-nas", publicPath: "/despre-noi", match: "prefix" },
      {
        internalPath: "/obchodne-podmienky",
        publicPath: "/termeni-si-conditii",
        match: "prefix",
      },
      {
        internalPath: "/ochrana-udajov",
        publicPath: "/politica-de-confidentialitate",
        match: "prefix",
      },
      { internalPath: "/auto", publicPath: "/masina", match: "prefix" },
    ],
    presentation: {
      sellerImageAlt: "Spațiu de vânzare cu vehicule",
    },
    contact: {
      email: "info@autoninja.ro",
      phoneDisplay: null,
      phoneHref: null,
      postalAddressLines: [
        "Apollo Tech s. r. o.",
        "Karpatské námestie 10A",
        "831 06 Bratislava, Slovacia",
      ],
    },
    copy: {
      llmsDescription:
        "AutoNinja is a Romania-focused car marketplace for used and new vehicle listings.",
      listingDescriptionAction: "Cumpără pe AutoNinja.",
      authEmail: {
        defaultUserName: "Utilizator",
        registrationSubject: "Confirmarea înregistrării",
        registrationIntro: "Confirmă înregistrarea pe",
        registrationAction: "Finalizează activarea contului aici",
        registrationLogin: "Autentificare după confirmare",
        passwordResetSubject: "Resetarea parolei",
        passwordResetIntro: "Resetarea parolei pentru contul",
        passwordResetAction: "Setează parola nouă aici",
        passwordResetIgnore:
          "Dacă nu ai solicitat schimbarea parolei, poți ignora acest e-mail.",
        supportLabel: "Asistență",
      },
    },
    services: {
      googleOneTapDefaultEnabled: true,
      googleClientIdEnvVar: "NEXT_PUBLIC_AUTONINJA_RO_GOOGLE_CLIENT_ID",
      clarityProjectId:
        process.env.NEXT_PUBLIC_CLARITY_ID_RO ??
        process.env.NEXT_PUBLIC_CLARITY_ID,
    },
  },
] as const satisfies readonly MarketDefinition[];

export type MarketCode = (typeof MARKET_DEFINITIONS)[number]["code"];
export type MarketConfig = (typeof MARKET_DEFINITIONS)[number];

export const MARKET_CODES = MARKET_DEFINITIONS.map(
  (market) => market.code,
) as MarketCode[];

export const DEFAULT_MARKET_CODE: MarketCode = "SK";

export const MARKET_CONFIGS = Object.fromEntries(
  MARKET_DEFINITIONS.map((market) => [market.code, market]),
) as Record<MarketCode, MarketConfig>;

const MARKET_REGISTRY = createMarketRegistry(MARKET_DEFINITIONS);

export function isMarketCode(value: unknown): value is MarketCode {
  return typeof value === "string" && MARKET_CODES.includes(value as MarketCode);
}

export function getMarketConfig(marketCode: MarketCode): MarketConfig {
  return MARKET_CONFIGS[marketCode];
}

export function resolveMarketCodeFromLocale(
  locale: string | null | undefined,
  fallbackMarketCode: MarketCode = DEFAULT_MARKET_CODE,
): MarketCode {
  return MARKET_REGISTRY.resolveLocale(locale)?.code ?? fallbackMarketCode;
}

export function getMarketConfigForLocale(
  locale: string | null | undefined,
  fallbackMarketCode: MarketCode = DEFAULT_MARKET_CODE,
): MarketConfig {
  return getMarketConfig(resolveMarketCodeFromLocale(locale, fallbackMarketCode));
}

export function normalizeMarketHost(host: string | null | undefined): string | null {
  const rawHost = host?.split(",", 1)[0]?.trim().toLowerCase();
  if (!rawHost) {
    return null;
  }

  const withoutProtocol = rawHost.replace(/^https?:\/\//, "");
  const withoutPath = withoutProtocol.split("/", 1)[0] ?? "";
  const withoutPort = withoutPath.replace(/:\d+$/, "");

  return withoutPort || null;
}

export function resolveMarketCodeFromHost(
  host: string | null | undefined,
): MarketCode {
  return resolveKnownMarketCodeFromHost(host) ?? DEFAULT_MARKET_CODE;
}

export function resolveKnownMarketCodeFromHost(
  host: string | null | undefined,
): MarketCode | null {
  const normalizedHost = normalizeMarketHost(host);
  if (!normalizedHost) {
    return null;
  }

  return MARKET_REGISTRY.resolveHost(normalizedHost)?.code ?? null;
}

export function getAlgoliaMarketFilter(marketCode: MarketCode): string {
  return `market_code:${marketCode}`;
}

export type MarketRegistry<TMarket extends MarketDefinition> = {
  readonly definitions: readonly TMarket[];
  resolveHost(host: string | null | undefined): TMarket | null;
  resolveLocale(locale: string | null | undefined): TMarket | null;
};

/**
 * Pure registry factory used by extension tests and external market packages.
 * Adding a market is data-only: resolvers do not need new country branches.
 */
export function createMarketRegistry<const TMarket extends MarketDefinition>(
  definitions: readonly TMarket[],
): MarketRegistry<TMarket> {
  const byHost = new Map<string, TMarket>();
  const byLocale = new Map<string, TMarket>();
  const byCode = new Set<string>();

  for (const market of definitions) {
    const normalizedCode = market.code.trim().toUpperCase();
    const normalizedLocale = market.locale.trim().toLowerCase();
    if (!normalizedCode || byCode.has(normalizedCode)) {
      throw new Error(`Duplicate or empty market code: ${market.code}`);
    }
    if (!normalizedLocale || byLocale.has(normalizedLocale)) {
      throw new Error(`Duplicate or empty market locale: ${market.locale}`);
    }
    if (new URL(market.origin).host.toLowerCase() !== market.domain.toLowerCase()) {
      throw new Error(
        `Market ${market.code} origin host must match its canonical domain`,
      );
    }

    byCode.add(normalizedCode);
    byLocale.set(normalizedLocale, market);
    for (const host of market.hosts) {
      const normalizedHost = normalizeMarketHost(host);
      if (!normalizedHost || byHost.has(normalizedHost)) {
        throw new Error(`Duplicate or invalid market host: ${host}`);
      }
      byHost.set(normalizedHost, market);
    }
  }

  return {
    definitions,
    resolveHost(host) {
      const normalized = normalizeMarketHost(host);
      return normalized ? byHost.get(normalized) ?? null : null;
    },
    resolveLocale(locale) {
      const normalized = locale?.trim().toLowerCase().split(/[-_]/, 1)[0];
      return normalized ? byLocale.get(normalized) ?? null : null;
    },
  };
}
