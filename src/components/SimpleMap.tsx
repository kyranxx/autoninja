"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLocale, useTranslations } from "next-intl";
import { BRAND_THEME } from "@/lib/theme/brand";

interface SimpleMapProps {
  lat: number;
  lng: number;
  radiusKm: number;
  cityName?: string;
}

export default function SimpleMap({
  lat,
  lng,
  radiusKm,
  cityName,
}: SimpleMapProps) {
  const locale = useLocale();
  const t = useTranslations("common");
  const mapLabel = locale.toLowerCase().startsWith("ro")
    ? cityName
      ? `Hartă pentru localitatea ${cityName}`
      : "Hartă pentru localitatea anunțului"
    : cityName
      ? `Mapa lokality ${cityName}`
      : "Mapa lokality inzerátu";
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapRef.current, {
        center: [lat, lng],
        zoom: 10,
        zoomControl: true,
        attributionControl: true,
        keyboard: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
        detectRetina: true,
      }).addTo(mapInstanceRef.current);
    }

    const map = mapInstanceRef.current;

    map.setView([lat, lng], getZoomForRadius(radiusKm));
    requestAnimationFrame(() => {
      map.invalidateSize();
    });

    if (circleRef.current) {
      circleRef.current.remove();
    }

    if (radiusKm > 0) {
      circleRef.current = L.circle([lat, lng], {
        radius: radiusKm * 1000,
        color: BRAND_THEME.primary,
        fillColor: BRAND_THEME.primary,
        fillOpacity: 0.15,
        weight: 2,
      }).addTo(map);
    }

  }, [lat, lng, radiusKm]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-border shadow-sm">
      <div
        ref={mapRef}
        aria-label={mapLabel}
        className="h-48 w-full sm:h-56"
      />
      {cityName && (
        <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded text-xs font-medium text-primary shadow">
          {cityName} • {radiusKm > 0 ? `${radiusKm} km` : t("wholeSlovakia")}
        </div>
      )}
    </div>
  );
}

// Helper to determine zoom level based on radius
function getZoomForRadius(radiusKm: number): number {
  if (radiusKm <= 10) return 12;
  if (radiusKm <= 25) return 11;
  if (radiusKm <= 50) return 10;
  if (radiusKm <= 100) return 9;
  if (radiusKm <= 200) return 8;
  return 7; // Whole Slovakia
}
