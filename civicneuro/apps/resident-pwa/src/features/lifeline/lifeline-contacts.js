export async function selectLifelineContacts() {
  if (!globalThis.navigator?.contacts?.select) {
    throw new Error('This browser cannot open its contact picker. Choose “Type a number” and enter the contact manually.');
  }

  const selected = await globalThis.navigator.contacts.select(['name', 'tel'], { multiple: true });
  return selected
    .map((contact) => ({
      name: String((Array.isArray(contact.name) ? contact.name[0] : contact.name) || '').trim(),
      phone: String((Array.isArray(contact.tel) ? contact.tel[0] : contact.tel) || '').trim()
    }))
    .filter((contact) => (
      contact.name
      && contact.name.length <= 100
      && contact.phone.replace(/\D/g, '').length >= 3
      && contact.phone.replace(/\D/g, '').length <= 15
    ));
}
