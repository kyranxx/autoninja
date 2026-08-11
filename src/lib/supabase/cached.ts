/**
 * Cached server-side data fetching functions
 * Uses stable Next.js cache tags for targeted invalidation without enabling
 * global Cache Components/PPR.
 *
 * Uses anonymous Supabase client (no cookies) to allow Next.js caching
 */
import { unstable_cache } from "next/cache";
import {
  ADS_CACHE_TAG,
  FEATURED_CARS_CACHE_TAG,
} from "@/lib/cache/tags";
import { getListingFallbackImage } from "@/lib/cars/fallback-images";
import { getAnonClient } from "./anon";
import type { MarketCode } from "@/config/markets";

// Types for featured cars
interface FeaturedCarData {
  id: string;
  brand?: string;
  model?: string;
  year?: number;
  price_eur?: number;
  mileage_km?: number;
  fuel?: string;
  transmission?: string;
  location_city?: string;
  photos_json?: string[];
  is_top_ad?: boolean;
  is_highlighted?: boolean;
  promotion_tier?: "none" | "premium" | "top";
  brands?: { name: string };
  models?: { name: string };
}

interface FeaturedCar {
  id: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  price: number;
  location: string;
  fuel: string;
  transmission: string;
  image: string | null;
  isTopAd: boolean;
  isHighlighted: boolean;
  promotionTier: "none" | "premium" | "top";
}

async function fetchFeaturedCarsUncached(marketCode: MarketCode): Promise<FeaturedCar[]> {
  const supabase = getAnonClient();

  try {
    const { data, error } = await supabase
      .from("ads")
      .select(
        `
        id,
        brand,
        model,
        year,
        price_eur,
        mileage_km,
        fuel,
        transmission,
        location_city,
        photos_json,
        is_top_ad,
        is_highlighted,
        promotion_tier,
        brands:brand_id (name),
        models:model_id (name)
      `,
      )
      .eq("status", "active")
      .eq("is_hidden", false)
      .eq("market_code", marketCode)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) throw error;

    const formattedCars: FeaturedCar[] = (
      (data || []) as unknown as FeaturedCarData[]
    ).map((ad) => ({
      id: ad.id,
      brand: ad.brands?.name || ad.brand || "Neznáma",
      model: ad.models?.name || ad.model || "Model",
      year: ad.year || 0,
      mileage: ad.mileage_km || 0,
      price: ad.price_eur || 0,
      location: ad.location_city || "",
      fuel: ad.fuel || "petrol",
      transmission: ad.transmission || "manual",
      image: ad.photos_json?.[0] || getListingFallbackImage(ad.id),
      isTopAd: ad.is_top_ad || false,
      isHighlighted: ad.is_highlighted || false,
      promotionTier: ad.promotion_tier || "none",
    }));

    const tierRank = { top: 3, premium: 2, none: 0 } as const;
    return [...formattedCars]
      .sort((left, right) => {
        const leftRank =
          tierRank[left.promotionTier] + Number(left.isTopAd) + Number(left.isHighlighted);
        const rightRank =
          tierRank[right.promotionTier] + Number(right.isTopAd) + Number(right.isHighlighted);
        return rightRank - leftRank;
      })
      .slice(0, 12);
  } catch (error) {
    console.info("Featured cars fallback: returning empty list.", error);
    return [];
  }
}

const fetchFeaturedCars = unstable_cache(fetchFeaturedCarsUncached, ["featured-cars"], {
  revalidate: 60,
  tags: [ADS_CACHE_TAG, FEATURED_CARS_CACHE_TAG],
});

// Shared featured cars cache for SSR surfaces.
export async function getFeaturedCars(marketCode: MarketCode): Promise<FeaturedCar[]> {
  return fetchFeaturedCars(marketCode);
}
