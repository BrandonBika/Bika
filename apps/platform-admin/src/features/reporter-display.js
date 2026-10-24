export function resolveReporterDisplay(input = {}) {
  const { report, profile, guestContact } = input ?? {};
  switch (report?.reporter_type) {
    case 'resident':
      return {
        kind: 'resident',
        name: profile?.full_name || 'Resident',
        phone: profile?.phone ?? null,
        email: profile?.email ?? null
      };
    case 'guest': {
      const hasConsent = guestContact?.consent_to_updates === true
        && guestContact?.consent_revoked_at === null;
      if (!hasConsent) {
        return { kind: 'guest', name: 'Guest', phone: null, email: null };
      }

      const phone = guestContact.phone ?? null;
      const email = guestContact.email ?? null;
      if (guestContact.contact_preference === 'phone') {
        return { kind: 'guest', name: 'Guest', phone, email: null };
      }
      if (guestContact.contact_preference === 'email') {
        return { kind: 'guest', name: 'Guest', phone: null, email };
      }
      return { kind: 'guest', name: 'Guest', phone, email };
    }
    default:
      return { kind: 'anonymous', name: 'Anonymous', phone: null, email: null };
  }
}
