import type { AppCategory } from "@/context/CategoriesContext";

export function normalizeDiscoveryText(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
}

export function categorySearchText(category: AppCategory): string {
  return normalizeDiscoveryText([category.name, category.nameUrdu, category.slug, category.description, ...(category.searchKeywords || [])].join(" "));
}

export function matchingCategories(query: string, categories: AppCategory[]): AppCategory[] {
  const normalized = normalizeDiscoveryText(query);
  if (!normalized) return [];
  const words = normalized.split(/\s+/).filter(Boolean);
  return categories
    .map((category) => {
      const haystack = categorySearchText(category);
      const exact = haystack.includes(normalized) ? 10 : 0;
      const wordScore = words.reduce((score, word) => score + (haystack.includes(word) ? 2 : 0), 0);
      return { category, score: exact + wordScore + (category.isFeatured ? 1 : 0) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || (a.category.sortOrder || 0) - (b.category.sortOrder || 0))
    .map((item) => item.category);
}

export function providerRecommendationScore(provider: any): number {
  const rating = Number(provider.rating || 0);
  const normalizedRating = rating > 5 ? rating / 10 : rating;
  const jobs = Math.min(Number(provider.totalJobs || 0), 200);
  const distance = typeof provider.distanceKm === "number" ? Math.max(0, 20 - provider.distanceKm) : 0;
  return (provider.isAvailable ? 35 : 0) + (provider.verificationStatus === "approved" ? 25 : 0) + normalizedRating * 6 + jobs * 0.08 + distance + (provider.isPremium ? 4 : 0);
}
