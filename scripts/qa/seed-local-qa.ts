import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { assertLocalQaTarget } from "./local-target";

const qaUrl = process.env.QA_SUPABASE_URL ?? "";
const qaServiceRoleKey = process.env.QA_SUPABASE_SERVICE_ROLE_KEY ?? "";
const qaPassword =
  process.env.QA_ACCOUNT_PASSWORD ?? "AutoNinja-QA-Local-2026!";

assertLocalQaTarget(qaUrl, qaServiceRoleKey);

if (qaPassword.length < 10) {
  throw new Error("QA_ACCOUNT_PASSWORD must contain at least 10 characters.");
}

const supabase = createClient(qaUrl, qaServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SELLER_EMAIL = "qa.seller@autoninja.local";
const BUYER_EMAIL = "qa.buyer@autoninja.local";

const IDS = {
  activeAd: "10000000-0000-4000-8000-000000000001",
  draftAd: "10000000-0000-4000-8000-000000000002",
  soldAd: "10000000-0000-4000-8000-000000000003",
  savedAd: "20000000-0000-4000-8000-000000000001",
  savedSearch: "30000000-0000-4000-8000-000000000001",
  conversation: "40000000-0000-4000-8000-000000000001",
  buyerMessage: "50000000-0000-4000-8000-000000000001",
  sellerMessage: "50000000-0000-4000-8000-000000000002",
} as const;

async function failOnError<T>(
  label: string,
  operation: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await operation;
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

async function findUserByEmail(client: SupabaseClient, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) {
      throw new Error(`List QA users: ${result.error.message}`);
    }

    const match = result.data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (result.data.users.length < 100) return null;
  }

  throw new Error("QA user lookup exceeded 1,000 local users.");
}

async function ensureUser(email: string, fullName: string): Promise<User> {
  const existing = await findUserByEmail(supabase, email);
  if (existing) {
    const result = await supabase.auth.admin.updateUserById(existing.id, {
      password: qaPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, qa_fixture: true },
    });
    if (result.error)
      throw new Error(`Update ${email}: ${result.error.message}`);
    return result.data.user;
  }

  const result = await supabase.auth.admin.createUser({
    email,
    password: qaPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, qa_fixture: true },
  });
  if (result.error) throw new Error(`Create ${email}: ${result.error.message}`);
  return result.data.user;
}

async function main() {
  const seller = await ensureUser(SELLER_EMAIL, "QA Seller");
  const buyer = await ensureUser(BUYER_EMAIL, "QA Buyer");

  await failOnError(
    "Upsert QA profiles",
    supabase.from("profiles").upsert(
      [
        {
          id: seller.id,
          email: SELLER_EMAIL,
          full_name: "QA Seller",
          is_verified: true,
        },
        {
          id: buyer.id,
          email: BUYER_EMAIL,
          full_name: "QA Buyer",
          is_verified: true,
        },
      ],
      { onConflict: "id" },
    ),
  );

  const now = new Date();
  const day = 24 * 60 * 60 * 1_000;
  const commonAd = {
    seller_id: seller.id,
    fuel: "petrol",
    transmission: "automatic",
    photos_json: [],
    equipment_json: ["air_conditioning", "cruise_control"],
    location_city: "Trnava",
    location_district: "Trnava",
    market_code: "SK",
  };

  await failOnError(
    "Upsert QA ads",
    supabase.from("ads").upsert(
      [
        {
          ...commonAd,
          id: IDS.activeAd,
          brand: "Škoda",
          model: "Octavia Combi 1.5 TSI Style",
          year: 2024,
          price_eur: 28_990,
          mileage_km: 18_400,
          body_style: "combi",
          power_kw: 110,
          engine_volume_cm3: 1498,
          color: "Modrá",
          description:
            "Local QA active listing used for saved-car and messaging checks.",
          status: "active",
          published_at: new Date(now.getTime() - 7 * day).toISOString(),
          expires_at: new Date(now.getTime() + 23 * day).toISOString(),
          views_count: 128,
          is_vat_deductible: true,
          promotion_tier: "top",
          promotion_started_at: new Date(now.getTime() - day).toISOString(),
          promotion_expires_at: new Date(now.getTime() + 6 * day).toISOString(),
        },
        {
          ...commonAd,
          id: IDS.draftAd,
          brand: "Volkswagen",
          model: "Transporter T6.1 Long Edition With A Deliberately Long Name",
          year: 2021,
          price_eur: 39_500,
          mileage_km: 156_200,
          fuel: "diesel",
          body_style: "commercial",
          power_kw: 110,
          engine_volume_cm3: 1968,
          color: "Biela",
          description:
            "Local QA draft listing for account-card actions and long-title wrapping.",
          status: "draft",
          views_count: 0,
          promotion_tier: "none",
        },
        {
          ...commonAd,
          id: IDS.soldAd,
          brand: "BMW",
          model: "320d xDrive",
          year: 2018,
          price_eur: 19_900,
          mileage_km: 211_000,
          fuel: "diesel",
          body_style: "sedan",
          power_kw: 140,
          engine_volume_cm3: 1995,
          color: "Čierna",
          description: "Local QA sold listing for inactive-state presentation.",
          status: "sold",
          published_at: new Date(now.getTime() - 40 * day).toISOString(),
          sold_at: new Date(now.getTime() - 2 * day).toISOString(),
          views_count: 493,
          promotion_tier: "none",
        },
      ],
      { onConflict: "id" },
    ),
  );

  await failOnError(
    "Upsert saved ad",
    supabase
      .from("saved_ads")
      .upsert(
        { id: IDS.savedAd, user_id: buyer.id, ad_id: IDS.activeAd },
        { onConflict: "user_id,ad_id" },
      ),
  );

  await failOnError(
    "Upsert saved search",
    supabase.from("saved_searches").upsert(
      {
        id: IDS.savedSearch,
        user_id: buyer.id,
        label: "QA family estates under 35,000 EUR",
        query_string: "?body_style=combi&price_to=35000",
        query_fingerprint: "qa-local-family-estates-under-35000",
        filters_json: { body_style: ["combi"], price_to: 35000 },
        notify_email: true,
        paused: false,
        market_code: "SK",
      },
      { onConflict: "user_id,query_fingerprint" },
    ),
  );

  const firstMessageAt = new Date(
    now.getTime() - 60 * 60 * 1_000,
  ).toISOString();
  const replyAt = new Date(now.getTime() - 45 * 60 * 1_000).toISOString();

  await failOnError(
    "Upsert QA conversation",
    supabase.from("inquiry_conversations").upsert(
      {
        id: IDS.conversation,
        ad_id: IDS.activeAd,
        buyer_id: buyer.id,
        seller_id: seller.id,
        created_at: firstMessageAt,
        last_message_at: replyAt,
      },
      { onConflict: "ad_id,buyer_id,seller_id" },
    ),
  );

  await failOnError(
    "Upsert QA messages",
    supabase.from("inquiries").upsert(
      [
        {
          id: IDS.buyerMessage,
          conversation_id: IDS.conversation,
          ad_id: IDS.activeAd,
          sender_id: buyer.id,
          recipient_id: seller.id,
          message: "Dobrý deň, je QA vozidlo stále dostupné?",
          is_read: true,
          created_at: firstMessageAt,
        },
        {
          id: IDS.sellerMessage,
          conversation_id: IDS.conversation,
          ad_id: IDS.activeAd,
          sender_id: seller.id,
          recipient_id: buyer.id,
          message: "Áno, je dostupné. Toto je lokálna QA odpoveď.",
          is_read: false,
          created_at: replyAt,
        },
      ],
      { onConflict: "id" },
    ),
  );

  console.log("Local authenticated QA fixtures are ready.");
  console.log(`Seller: ${SELLER_EMAIL}`);
  console.log(`Buyer:  ${BUYER_EMAIL}`);
  console.log(
    "Password: QA_ACCOUNT_PASSWORD (or the documented local default)",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
