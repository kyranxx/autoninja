import { isMarketCode, type MarketCode } from "@/config/markets";

export interface CarData {
  id: string;
  market_code?: MarketCode;
  dealer_id?: string | null;
  brand: string;
  model: string;
  generation?: string;
  year: number;
  price_eur: number;
  mileage_km: number;
  fuel: string;
  transmission: string;
  body_style: string;
  power_kw: number;
  engine_volume_cm3: number;
  drive_type?: string;
  color?: string;
  description: string;
  photos_json: string[];
  equipment_json: string[];
  created_at: string;
  stk_valid_until?: string;
  ek_valid_until?: string;
  is_top_ad: boolean;
  views_count: number;
  is_bought_in_sk: boolean;
  has_service_book: boolean;
  full_service_history: boolean;
  not_crashed: boolean;
  garage_kept: boolean;
  originality_check: boolean;
  is_vat_deductible: boolean;
  location_city?: string;
  seller: {
    id: string;
    name: string;
    phone: string;
    is_verified: boolean;
    member_since: string;
    ads_count: number;
  };
}

export interface SimilarCar {
  id: string;
  brand: string;
  model: string;
  year: number;
  price_eur: number;
  mileage_km: number;
  fuel: string;
  transmission: string;
  photos_json: string[];
  location_city?: string;
}

interface CarQuerySeller {
  id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  is_verified?: boolean | null;
  created_at?: string | null;
}

type CarQuerySellerValue = CarQuerySeller | CarQuerySeller[] | null | undefined;

export interface CarQueryRow
  extends Omit<Partial<CarData>, "seller" | "market_code"> {
  market_code?: string | null;
  seller?: CarQuerySellerValue;
}

function normalizeSeller(seller: CarQuerySellerValue): CarData["seller"] {
  const resolved = Array.isArray(seller) ? seller[0] : seller;

  return {
    id: resolved?.id || "",
    name: resolved?.full_name || "Neznámy predajca",
    phone: resolved?.phone || "",
    is_verified: Boolean(resolved?.is_verified),
    member_since: resolved?.created_at || new Date(0).toISOString(),
    ads_count: 0,
  };
}

export function mapCarQueryRowToCarData(row: CarQueryRow): CarData {
  return {
    id: row.id || "",
    market_code: isMarketCode(row.market_code) ? row.market_code : undefined,
    dealer_id: typeof row.dealer_id === "string" ? row.dealer_id : null,
    brand: row.brand || "",
    model: row.model || "",
    generation: row.generation,
    year: row.year || 0,
    price_eur: row.price_eur || 0,
    mileage_km: row.mileage_km || 0,
    fuel: row.fuel || "",
    transmission: row.transmission || "",
    body_style: row.body_style || "",
    power_kw: row.power_kw || 0,
    engine_volume_cm3: row.engine_volume_cm3 || 0,
    drive_type: row.drive_type,
    color: row.color,
    description: row.description || "",
    photos_json: row.photos_json || [],
    equipment_json: row.equipment_json || [],
    created_at: row.created_at || new Date(0).toISOString(),
    stk_valid_until: row.stk_valid_until,
    ek_valid_until: row.ek_valid_until,
    is_top_ad: Boolean(row.is_top_ad),
    views_count: row.views_count || 0,
    is_bought_in_sk: Boolean(row.is_bought_in_sk),
    has_service_book: Boolean(row.has_service_book),
    full_service_history: Boolean(row.full_service_history),
    not_crashed: Boolean(row.not_crashed),
    garage_kept: Boolean(row.garage_kept),
    originality_check: Boolean(row.originality_check),
    is_vat_deductible: Boolean(row.is_vat_deductible),
    location_city: row.location_city,
    seller: normalizeSeller(row.seller),
  };
}
