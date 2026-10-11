/**
 * @file apps/resident-pwa/src/pages/guest-report/guest-report.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { submitReport } from '../../features/reports/reports.client.js';
import { navigate } from '../../router.js';
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
      attrs: { label: 'Cellphone number', type: 'tel', autocomplete: 'tel', placeholder: '082 345 6721', required: 'true' }
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
    const mapPicker = createElement('cn-map-pin-picker');
    const captcha = createElement('cn-captcha-widget');

    const submitBtn = createElement('button', {
      cls: 'cn-btn cn-btn--primary cn-btn--full cn-guest-submit',
      text: 'Submit report',
      attrs: { type: 'button' }
    });

    submitBtn.onclick = async () => {
      if (!contactInput.value || !descInput.value) {
        showToast('Please complete required fields', { type: 'error' });
        return;
      }
      const coords = mapPicker.coordinates;
      if (!coords) {
        showToast('Choose your current location before submitting the report.', { type: 'error' });
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      try {
        const res = await submitReport({
          title: category.select.options[category.select.selectedIndex].textContent,
          category: category.select.value,
          description: descInput.value,
          latitude: coords.lat,
          longitude: coords.lng,
          address: coords.address,
          organisation: organisation.select.value,
          branch: branch.select.value,
          guestContact: contactInput.value,
          contactMethod: emailButton.classList.contains('active') ? 'email' : 'sms',
          captchaToken: captcha.token
        }, true);

        navigate('report-submitted', { ref: res.referenceNumber, isGuest: 'true' });
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
    this.appendChild(organisation.wrapper);
    this.appendChild(branch.wrapper);
    this.appendChild(category.wrapper);
    this.appendChild(descInput);
    this.appendChild(mapPicker);
    this.appendChild(captcha);
    this.appendChild(submitBtn);
  }
}
customElements.define('page-guest-report', PageGuestReport);
