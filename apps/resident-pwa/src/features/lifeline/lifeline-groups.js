export function getLifelineCardValidationError(name, members) {
  const groupName = String(name || '').trim();
  if (!groupName) return 'Enter a group name.';
  if (groupName.length > 100) return 'Group names must be 100 characters or fewer.';
  if (!Array.isArray(members) || members.length < 1) {
    return 'Add at least one person with a name and phone number.';
  }
  if (members.length > 4) return 'A group can have at most 4 people.';
  if (members.some((member) => {
    const memberName = String(member?.name || '').trim();
    const phoneDigits = String(member?.phone || '').replace(/\D/g, '');
    return !memberName || memberName.length > 100 || phoneDigits.length < 3 || phoneDigits.length > 15;
  })) {
    return 'Enter a name and phone number for each person. Phone numbers must contain 3 to 15 digits.';
  }
  return '';
}

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
