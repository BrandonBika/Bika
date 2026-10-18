import test from 'node:test';
import assert from 'node:assert/strict';
import {
  languageName,
  LOW_TRANSCRIPTION_CONFIDENCE_MESSAGE,
  reportReviewMessage
} from '../src/features/snap-and-say/language-labels.js';

test('shows the expected display name for every supported South African language', () => {
  const labels = {
    en: 'English',
    zu: 'isiZulu',
    xh: 'isiXhosa',
    af: 'Afrikaans',
    nso: 'Sepedi (Northern Sotho)',
    tn: 'Setswana',
    st: 'Sesotho',
    ts: 'Xitsonga',
    ss: 'siSwati',
    ve: 'Tshivenda',
    nr: 'isiNdebele'
  };
  for (const [code, name] of Object.entries(labels)) {
    assert.equal(languageName(code), name);
  }
  assert.equal(languageName('other'), 'Other language');
  assert.equal(languageName('unknown'), 'Language not identified');
  assert.equal(languageName('not-a-language'), 'Language not identified');
});

test('provides a clear review message for low-confidence transcription', () => {
  assert.equal(
    reportReviewMessage('The audio transcription is not clear enough to classify safely; a person will review the report.'),
    LOW_TRANSCRIPTION_CONFIDENCE_MESSAGE
  );
});
