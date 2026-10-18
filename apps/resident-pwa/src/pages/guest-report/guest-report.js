/**
 * @file apps/resident-pwa/src/pages/guest-report/guest-report.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { submitReport } from '../../features/reports/reports.client.js';
import { validateEvidenceFile } from '../../features/reports/evidence-validation.js';
import { navigate } from '../../router.js';
import '../../components/back-button/back-button.js';
import '../../components/captcha-widget/captcha-widget.js';
import '../../components/map-pin-picker/map-pin-picker.js';

function createSelectField(labelText, name, options) {
  const wrapper = createElement('div', { cls: 'cn-guest-field' });
  const id = `cn-guest-${name}`;
  const label = createElement('label', { cls: 'cn-guest-label', text: labelText, attrs: { for: id } });
  const select = createElement('select', { cls: 'cn-guest-select', attrs: { id, name } });

  for (const optionData of options) {
    const option = createElement('option', { text: optionData.label, attrs: { value: optionData.value } });
    select.appendChild(option);
  }

  wrapper.append(label, select);
  return { wrapper, select };
}

export class PageGuestReport extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-guest-report-page');
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'welcome' } }));

    const title = createElement('h1', { cls: 'cn-guest-title', text: 'Report an issue' });
    const sub = createElement('div', { cls: 'cn-guest-note' });
    sub.appendChild(createElement('span', { text: 'Reporting as a guest — no account needed. ' }));
    const signIn = createElement('button', { cls: 'cn-guest-signin', text: 'Sign in' });
    signIn.onclick = () => navigate('sign-in');
    sub.appendChild(signIn);

    const contactMethod = createElement('div', { cls: 'cn-guest-contact-method', attrs: { role: 'group', 'aria-label': 'Send updates via' } });
    const smsButton = createElement('button', { cls: 'cn-guest-method active', text: 'SMS', attrs: { type: 'button', 'aria-pressed': 'true' } });
    const emailButton = createElement('button', { cls: 'cn-guest-method', text: 'Email', attrs: { type: 'button', 'aria-pressed': 'false' } });
    contactMethod.append(smsButton, emailButton);

    const contactInput = createElement('cn-input', {
      attrs: { label: 'Cellphone number (optional)', type: 'tel', autocomplete: 'tel', placeholder: '082 345 6721' }
    });
    const setContactMethod = (method) => {
      const isEmail = method === 'email';
      contactInput.setAttribute('label', isEmail ? 'Email address' : 'Cellphone number');
      contactInput.setAttribute('type', isEmail ? 'email' : 'tel');
      contactInput.setAttribute('autocomplete', isEmail ? 'email' : 'tel');
      contactInput.setAttribute('placeholder', isEmail ? 'name@example.com' : '082 345 6721');
      smsButton.classList.toggle('active', !isEmail);
      emailButton.classList.toggle('active', isEmail);
      smsButton.setAttribute('aria-pressed', String(!isEmail));
      emailButton.setAttribute('aria-pressed', String(isEmail));
    };
    smsButton.onclick = () => setContactMethod('sms');
    emailButton.onclick = () => setContactMethod('email');

    const organisation = createSelectField('Organisation', 'organisation', [
      { value: 'unsure', label: 'Unsure / Not specified' },
      { value: 'ethekwini', label: 'eThekwini Municipality' },
      { value: 'other', label: 'Other' }
    ]);
    const branch = createSelectField('Branch', 'branch', [
      { value: 'auto', label: 'Auto-detected from pin' },
      { value: 'berea', label: 'Berea Depot' }
    ]);
    branch.wrapper.hidden = true;
    organisation.select.addEventListener('change', () => {
      branch.wrapper.hidden = organisation.select.value === 'unsure';
    });

    const category = createSelectField('Type of issue', 'category', [
      { value: 'water-sanitation', label: 'Water & Sanitation' },
      { value: 'roads', label: 'Roads & Stormwater' },
      { value: 'electricity', label: 'Electricity' },
      { value: 'waste', label: 'Waste collection' },
      { value: 'other', label: 'Other' }
    ]);
    const descInput = createElement('cn-input', {
      attrs: { label: 'Description', type: 'textarea', placeholder: 'Describe the issue, location details…', required: 'true' }
    });
    const addressInput = createElement('cn-input', {
      attrs: { label: 'Address (optional if you pin the location)', placeholder: 'Street, area or landmark' }
    });
    const mapPicker = createElement('cn-map-pin-picker');
    const captcha = createElement('cn-captcha-widget');
    const consentInput = createElement('input', {
      attrs: { type: 'checkbox', id: 'cn-guest-contact-consent' }
    });
    const consentLabel = createElement('label', {
      cls: 'cn-guest-consent',
      attrs: { for: 'cn-guest-contact-consent' },
      text: 'I consent to receive updates about this report using the contact details above.'
    });
    consentLabel.prepend(consentInput);
    const photoInput = createElement('input', {
      attrs: { type: 'file', accept: 'image/heic,image/heif,image/jpeg,image/png,image/webp' }
    });
    const videoInput = createElement('input', {
      attrs: { type: 'file', accept: 'video/3gpp,video/mp4,video/quicktime,video/webm' }
    });
    photoInput.addEventListener('change', () => {
      const validationMessage = validateEvidenceFile(photoInput.files[0], 'photo');
      if (!validationMessage) return;
      photoInput.value = '';
      showToast(validationMessage, { type: 'error' });
    });
    videoInput.addEventListener('change', () => {
      const validationMessage = validateEvidenceFile(videoInput.files[0], 'video');
      if (!validationMessage) return;
      videoInput.value = '';
      showToast(validationMessage, { type: 'error' });
    });

    const submitBtn = createElement('button', {
      cls: 'cn-btn cn-btn--primary cn-btn--full cn-guest-submit',
      text: 'Submit report',
      attrs: { type: 'button' }
    });

    submitBtn.onclick = async () => {
      if (!descInput.value) {
        showToast('Please complete required fields', { type: 'error' });
        return;
      }
      const guestContact = contactInput.value.trim();
      if (guestContact && !consentInput.checked) {
        showToast('Please consent to contact updates or leave the contact field empty.', { type: 'error' });
        return;
      }
      const coords = mapPicker.coordinates;
      const address = coords?.address || addressInput.value.trim();
      if (!coords && !address) {
        showToast('Enter an address or choose a map pin before submitting.', { type: 'error' });
        return;
      }
      const evidenceError = validateEvidenceFile(photoInput.files[0], 'photo')
        || validateEvidenceFile(videoInput.files[0], 'video');
      if (evidenceError) {
        showToast(evidenceError, { type: 'error' });
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      try {
        const res = await submitReport({
          title: category.select.options[category.select.selectedIndex].textContent,
          category: category.select.value,
          description: descInput.value,
          latitude: coords?.lat,
          longitude: coords?.lng,
          address,
          organisation: organisation.select.value === 'unsure'
            ? ''
            : organisation.select.options[organisation.select.selectedIndex].textContent,
          branch: branch.select.value === 'auto'
            ? ''
            : branch.select.options[branch.select.selectedIndex].textContent,
          photo: photoInput.files[0] || null,
          video: videoInput.files[0] || null,
          guestContact,
          contactMethod: emailButton.classList.contains('active') ? 'email' : 'sms',
          consentToUpdates: consentInput.checked
        }, true);

        if (res.queued) {
          navigate('offline-queued', {}, { replace: true });
          return;
        }
        navigate('report-submitted', { ref: res.referenceNumber, isGuest: 'true' }, { replace: true });
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit report';
        showToast(err.message || 'Submission failed', { type: 'error' });
      }
    };

    this.appendChild(title);
    this.appendChild(sub);
    const updatesLabel = createElement('div', { cls: 'cn-guest-label', text: 'Send updates via' });
    const updatesRow = createElement('div', { cls: 'cn-guest-updates' });
    updatesRow.append(updatesLabel, contactMethod);
    this.appendChild(updatesRow);
    this.appendChild(contactInput);
    this.appendChild(consentLabel);
    this.appendChild(organisation.wrapper);
    this.appendChild(branch.wrapper);
    this.appendChild(category.wrapper);
    this.appendChild(descInput);
    this.appendChild(addressInput);
    this.appendChild(mapPicker);
    const evidenceFields = createElement('div', { cls: 'cn-guest-evidence' });
    evidenceFields.append(
      createElement('label', { text: 'Photo (optional)' }),
      photoInput,
      createElement('label', { text: 'Video (optional)' }),
      videoInput
    );
    this.appendChild(evidenceFields);
    this.appendChild(captcha);
    this.appendChild(submitBtn);
  }
}
customElements.define('page-guest-report', PageGuestReport);
