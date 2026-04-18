import type { HadeSDKConfig } from "./types";

const DEFAULT_GEO = { lat: 39.7392, lng: -104.9903 };

function inferTimeOfDay(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 13) return "midday";
  if (hour >= 13 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 19) return "early_evening";
  if (hour >= 19 && hour < 22) return "evening";
  return "late_night";
}

function inferDayType(date: Date): string {
  const day = date.getDay();
  const hour = date.getHours();
  if ((day === 5 || day === 6) && hour >= 18) return "weekend_prime";
  if (day === 0 || day === 6) return "weekend";
  if (hour >= 18) return "weekday_evening";
  return "weekday";
}

export function withHadeDefaults(config: HadeSDKConfig = {}): Required<HadeSDKConfig> {
  return {
    apiUrl: config.apiUrl ?? "/api",
    fallbackGeo: config.fallbackGeo ?? DEFAULT_GEO,
    fetcher: config.fetcher ?? fetch,
    getGeo:
      config.getGeo ??
      (async () => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
          return DEFAULT_GEO;
        }

        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(DEFAULT_GEO),
            { timeout: 1500, maximumAge: 60_000 },
          );
        });
      }),
    getTimeContext:
      config.getTimeContext ??
      (() => {
        const now = new Date();
        return {
          timeOfDay: inferTimeOfDay(now),
          dayType: inferDayType(now),
        };
      }),
  };
}
