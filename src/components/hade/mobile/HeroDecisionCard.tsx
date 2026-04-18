"use client";

interface HeroDecisionCardProps {
  title: string;
  category: string;
  neighborhood?: string;
  reasons: string[];
}

const CATEGORY_EMOJI: Record<string, string> = {
  restaurant: "🍽️",
  bar: "🍸",
  bar_and_grill: "🍸",
  cocktail_bar: "🍸",
  wine_bar: "🍷",
  cafe: "☕",
  coffee: "☕",
  coffee_shop: "☕",
  gastropub: "🍺",
  brewery: "🍺",
  pub: "🍺",
  deli: "🥪",
  bakery: "🥐",
  pizza: "🍕",
  club: "🎵",
  night_club: "🎵",
  lounge: "🛋️",
  food_truck: "🚚",
  ice_cream: "🍦",
};

function formatCategory(raw: string): string {
  return raw.replace(/_/g, " ");
}

export function HeroDecisionCard({
  title,
  category,
  neighborhood,
  reasons,
}: HeroDecisionCardProps) {
  const key = category.toLowerCase();
  const emoji = CATEGORY_EMOJI[key] ?? "📍";
  const label = formatCategory(category);
  const contextParts = [`${emoji} ${label}`];
  if (neighborhood && !/[\d,]/.test(neighborhood)) contextParts.push(neighborhood);

  return (
    <section className="flex flex-col rounded-3xl bg-surface p-6 shadow-soft">
      <h1 className="text-2xl font-semibold leading-tight text-ink">
        {title}
      </h1>

      <p className="mt-1.5 text-sm text-ink/60">
        {contextParts.join(" · ")}
      </p>

      <ul className="mt-5 space-y-1.5">
        {reasons.map((reason) => (
          <li key={reason} className="flex gap-2 text-base leading-snug text-ink">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
