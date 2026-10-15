export function mergeLifelineCards(starterCards, savedCards) {
  const savedById = new Map(savedCards.map((card) => [card.id, card]));
  const starterIds = new Set(starterCards.map((card) => card.id));
  const starters = starterCards.map((starter) => ({
    ...starter,
    ...(savedById.get(starter.id) || {}),
    isPreset: true
  }));
  const personalCards = savedCards.filter((card) => !starterIds.has(card.id));
  return [...starters, ...personalCards];
}
