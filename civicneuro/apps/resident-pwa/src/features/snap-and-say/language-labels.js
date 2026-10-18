const LANGUAGE_NAMES = new Map([
  ['en', 'English'],
  ['zu', 'isiZulu'],
  ['xh', 'isiXhosa'],
  ['af', 'Afrikaans'],
  ['nso', 'Sepedi (Northern Sotho)'],
  ['tn', 'Setswana'],
  ['st', 'Sesotho'],
  ['ts', 'Xitsonga'],
  ['ss', 'siSwati'],
  ['ve', 'Tshivenda'],
  ['nr', 'isiNdebele'],
  ['other', 'Other language'],
  ['unknown', 'Language not identified']
]);

export const LOW_TRANSCRIPTION_CONFIDENCE_MESSAGE =
  'The audio transcription is not clear enough to classify safely; a person will review the report.';

export function languageName(languageCode) {
  return LANGUAGE_NAMES.get(String(languageCode || '').trim().toLowerCase()) || LANGUAGE_NAMES.get('unknown');
}

export function reportReviewMessage(reason) {
  if (/transcription is not clear enough/i.test(String(reason || ''))) {
    return LOW_TRANSCRIPTION_CONFIDENCE_MESSAGE;
  }
  return String(reason || 'A person will review the report.');
}
