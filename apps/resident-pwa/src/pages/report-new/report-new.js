/**
 * @file apps/resident-pwa/src/pages/report-new/report-new.js
 * Report New page — single-page form matching flow-map v7 design.
 * Fields: Organisation, Branch, Type, Description, Media, Location.
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { submitReport } from '../../features/reports/reports.client.js';
import { loadReportOrganisationOptions } from '../../features/reports/organisation-options.js';
import { validateEvidenceFile } from '../../features/reports/evidence-validation.js';
import { navigate } from '../../router.js';
import { sessionStore } from '../../session.js';
import '../../components/back-button/back-button.js';
import '../../components/map-pin-picker/map-pin-picker.js';

const CATEGORIES = [
  { id: '', name: 'Select a type…' },
  { id: 'water_sanitation',  name: 'Water & Sanitation' },
  { id: 'electricity',       name: 'Electricity & Outages' },
  { id: 'roads_traffic',     name: 'Roads, Potholes & Traffic' },
  { id: 'waste_refuse',      name: 'Refuse & Illegal Dumping' },
  { id: 'safety_security',   name: 'Community Safety' },
  { id: 'parks_environment', name: 'Parks & Environment' },
  { id: 'other',             name: 'Other' },
];

/* ── SVG helpers ── */
function svg(paths, extra = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '2');
  el.setAttribute('viewBox', '0 0 24 24');
  if (extra) el.setAttribute('style', extra);
  const pList = Array.isArray(paths) ? paths : [paths];
  for (const item of pList) {
    if (typeof item === 'string') {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', item);
      el.appendChild(p);
    } else if (item.tag === 'circle') {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', item.cx);
      c.setAttribute('cy', item.cy);
      c.setAttribute('r', item.r);
      el.appendChild(c);
    } else if (item.tag === 'rect') {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', item.x || '0');
      r.setAttribute('y', item.y || '0');
      r.setAttribute('width', item.w);
      r.setAttribute('height', item.h);
      r.setAttribute('rx', item.rx || '0');
      el.appendChild(r);
    }
  }
  return el;
}
const ICON_DOWN   = ['m6 9 6 6 6-6'];
const ICON_PIN    = ['M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z', { tag: 'circle', cx: '12', cy: '10', r: '2.5' }];
const ICON_PHOTO  = [{ tag: 'rect', x: '3', y: '3', w: '18', h: '18', rx: '2' }, { tag: 'circle', cx: '8.5', cy: '8.5', r: '1.5' }, 'm21 15-5-5L5 21'];
const ICON_VIDEO  = ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z', { tag: 'circle', cx: '12', cy: '13', r: '4' }];
const ICON_INFO   = [{ tag: 'circle', cx: '12', cy: '12', r: '9' }, 'M12 8v5M12 16h.01'];
const ICON_PERSON = [{ tag: 'circle', cx: '12', cy: '8', r: '4' }, 'M4 21v-1a8 8 0 0 1 16 0v1'];

export class PageReportNew extends BaseElement {
  constructor() {
    super();
    this._location = null;
    this._photoFile = null;
    this._videoFile = null;
  }

  connectedCallback() {
    clearChildren(this);
    this._build();
  }

  _field(labelText, required = false, optText = '') {
    const wrap = createElement('div', { cls: 'rn-field' });
    const labelEl = createElement('label', { cls: 'rn-label' });
    const lt = createElement('span');
    lt.textContent = labelText;
    if (required) {
      const req = createElement('span', { cls: 'rn-req', text: ' *' });
      lt.appendChild(req);
    }
    labelEl.appendChild(lt);
    if (optText) {
      labelEl.appendChild(createElement('span', { cls: 'rn-opt', text: optText }));
    }
    wrap.appendChild(labelEl);
    return { wrap, labelEl };
  }

  _select(options) {
    const outer = createElement('div', { cls: 'rn-dropdown-wrap' });
    const sel = createElement('select', { cls: 'rn-dropdown', attrs: { id: 'rn-category' } });
    for (const o of options) {
      const opt = createElement('option', { attrs: { value: o.id }, text: o.name });
      if (!o.id && o.disabled !== false) opt.setAttribute('disabled', '');
      if (!o.id) opt.setAttribute('selected', '');
      sel.appendChild(opt);
    }
    outer.appendChild(sel);
    outer.appendChild(svg(ICON_DOWN));
    return { outer, sel };
  }

  _build() {
    const backBar = createElement('div', { cls: 'rn-back-bar' });
    backBar.appendChild(createElement('cn-back-button', { attrs: { fallback: 'home' } }));
    backBar.appendChild(createElement('span', { cls: 'rn-back-label', text: 'Reports' }));

    /* Title */
    const titleEl = createElement('h1', { cls: 'rn-title', text: 'Report an issue' });
    const subEl   = createElement('p',  { cls: 'rn-sub',   text: 'Fill in a form · about 2 min' });

    /* Form wrapper */
    const form = createElement('form', { cls: 'rn-form', attrs: { id: 'rn-form', novalidate: '' } });
    form.addEventListener('submit', e => e.preventDefault());

    /* ── Org field ── */
    const orgField = this._field('Organisation');
    const { outer: orgOuter, sel: orgSel } = this._select([
      { id: '', name: 'Unsure / Not specified', disabled: false },
    ]);
    orgSel.id = 'rn-org';
    orgField.wrap.appendChild(orgOuter);

    /* ── Branch field ── */
    const branchField = this._field('Branch', false, '(auto-detected from pin)');
    const { outer: branchOuter, sel: branchSel } = this._select([
      { id: '', name: 'Auto-detected from pin' },
    ]);
    branchSel.id = 'rn-branch';
    branchField.wrap.appendChild(branchOuter);

    /* ── Type / Category ── */
    const catField = this._field('Type of issue');
    const { outer: catOuter, sel: catSel } = this._select(CATEGORIES);
    catField.wrap.appendChild(catOuter);

    /* ── Description ── */
    const descField = this._field('Description', true);
    const descTA = createElement('textarea', {
      cls: 'rn-input rn-textarea',
      attrs: { id: 'rn-description', placeholder: 'Describe the issue, location details…', rows: '4' }
    });
    descField.wrap.appendChild(descTA);

    /* ── Media (Photo / Video) ── */
    const mediaField = this._field('Reference / proof', false, '(optional)');
    const proofRow = createElement('div', { cls: 'rn-proof-row' });

    const photoBox = createElement('div', { cls: 'rn-proof-box', attrs: { role: 'button', id: 'rn-photo-box', tabindex: '0' } });
    photoBox.appendChild(svg(ICON_PHOTO));
    const photoLabel = createElement('span', { cls: 'p-label', text: 'Photo' });
    photoBox.appendChild(photoLabel);
    const photoInput = createElement('input', { attrs: { type: 'file', accept: 'image/heic,image/heif,image/jpeg,image/jpg,image/png,image/webp', style: 'display:none', id: 'rn-photo-input' } });
    photoBox.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => {
      const selectedFile = photoInput.files[0] || null;
      const validationMessage = validateEvidenceFile(selectedFile, 'photo');
      if (validationMessage) {
        showToast(validationMessage, { type: 'error' });
        photoInput.value = '';
      }
      this._photoFile = validationMessage ? null : selectedFile;
      photoBox.classList.toggle('has-file', !!this._photoFile);
      photoLabel.textContent = this._photoFile ? this._photoFile.name.slice(0, 12) + '…' : 'Photo';
    });

    const videoBox = createElement('div', { cls: 'rn-proof-box', attrs: { role: 'button', id: 'rn-video-box', tabindex: '0' } });
    videoBox.appendChild(svg(ICON_VIDEO));
    const videoLabel = createElement('span', { cls: 'p-label', text: 'Video' });
    videoBox.appendChild(videoLabel);
    const videoInput = createElement('input', { attrs: { type: 'file', accept: 'video/3gpp,video/mp4,video/quicktime,video/webm', style: 'display:none', id: 'rn-video-input' } });
    videoBox.addEventListener('click', () => videoInput.click());
    videoInput.addEventListener('change', () => {
      const selectedFile = videoInput.files[0] || null;
      const validationMessage = validateEvidenceFile(selectedFile, 'video');
      if (validationMessage) {
        showToast(validationMessage, { type: 'error' });
        videoInput.value = '';
      }
      this._videoFile = validationMessage ? null : selectedFile;
      videoBox.classList.toggle('has-file', !!this._videoFile);
      videoLabel.textContent = this._videoFile ? this._videoFile.name.slice(0, 12) + '…' : 'Video';
    });

    proofRow.appendChild(photoBox);
    proofRow.appendChild(photoInput);
    proofRow.appendChild(videoBox);
    proofRow.appendChild(videoInput);
    mediaField.wrap.appendChild(proofRow);

    /* ── Location ── */
    const locField = this._field('Location', true);
    const locRow = createElement('div', { cls: 'rn-loc-row' });
    const locInput = createElement('input', {
      cls: 'rn-loc-input',
      attrs: { type: 'text', id: 'rn-location', placeholder: 'Address or area…', autocomplete: 'street-address' }
    });
    locInput.addEventListener('input', () => {
      const address = locInput.value.trim();
      if (Number.isFinite(this._location?.lat) && Number.isFinite(this._location?.lng)) {
        this._location = { ...this._location, address: address || 'Pinned location' };
      } else {
        this._location = address ? { address } : null;
      }
    });
    const locPin = createElement('button', {
      cls: 'rn-loc-pin',
      attrs: { type: 'button', id: 'rn-map-pin', 'aria-label': 'Drop pin on map' }
    });
    locPin.appendChild(svg(ICON_PIN));
    const mapPicker = createElement('cn-map-pin-picker', { attrs: { mode: 'modal' } });
    mapPicker.addEventListener('location-selected', ({ detail }) => {
      this._location = detail;
      locInput.value = detail.address;
    });
    locPin.addEventListener('click', () => {
      mapPicker.address = locInput.value;
      mapPicker.open(locPin);
    });
    locRow.appendChild(locInput);
    locRow.appendChild(locPin);
    locField.wrap.appendChild(locRow);
    locField.wrap.appendChild(mapPicker);
    locField.wrap.appendChild(createElement('div', { cls: 'rn-loc-hint', text: 'Drop a pin on the map, or type an address above' }));

    /* ── Submit ── */
    const submitBtn = createElement('button', {
      cls: 'rn-submit',
      attrs: { type: 'submit', id: 'rn-submit-btn' },
      text: 'Submit report'
    });

    submitBtn.addEventListener('click', async () => {
      const desc = descTA.value.trim();
      if (!desc) {
        showToast('Please add a description', { type: 'error' });
        descTA.focus();
        return;
      }
      if (!locInput.value.trim() && !this._location) {
        showToast('Please add a location', { type: 'error' });
        locInput.focus();
        return;
      }
      try {
        const evidenceError = validateEvidenceFile(this._photoFile, 'photo')
          || validateEvidenceFile(this._videoFile, 'video');
        if (evidenceError) {
          showToast(evidenceError, { type: 'error' });
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';
        const isGuest = sessionStore.get()?.isGuest;
        const res = await submitReport({
          category:    catSel.value || 'other',
          description: desc,
          address:     locInput.value.trim() || this._location?.address || '',
          latitude:    this._location?.lat,
          longitude:   this._location?.lng,
          organisation: orgSel.value ? orgSel.options[orgSel.selectedIndex].textContent : '',
          user_selected_organization_id: orgSel.value || '',
          branch: branchSel.value ? branchSel.options[branchSel.selectedIndex].textContent : '',
          photo: this._photoFile,
          video: this._videoFile
        }, isGuest);
        if (res.queued) {
          navigate('offline-queued', {}, { replace: true });
          return;
        }
        showToast('Report submitted!', { type: 'success' });
        navigate('report-submitted', { ref: res?.referenceNumber || '', isGuest: String(!!isGuest) }, { replace: true });
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit report';
        showToast(err?.message || 'Submission failed — please try again', { type: 'error' });
      }
    });

    /* ── Contacts link ── */
    const contactsLink = createElement('div', { cls: 'rn-contacts-link', attrs: { role: 'button', tabindex: '0' } });
    contactsLink.appendChild(svg(ICON_PERSON));
    contactsLink.appendChild(createElement('span', { text: 'View directory of organisations & contacts' }));
    contactsLink.addEventListener('click', () => navigate('contacts'));

    /* Assemble */
    form.appendChild(orgField.wrap);
    form.appendChild(branchField.wrap);
    form.appendChild(catField.wrap);
    form.appendChild(descField.wrap);
    form.appendChild(mediaField.wrap);
    form.appendChild(locField.wrap);
    form.appendChild(submitBtn);
    form.appendChild(contactsLink);

    this.appendChild(backBar);
    this.appendChild(titleEl);
    this.appendChild(subEl);
    this.appendChild(form);
    void this._loadOrganisationOptions(orgSel);
  }

  async _loadOrganisationOptions(select) {
    const options = await loadReportOrganisationOptions();
    for (const organisation of options.slice(1)) {
      select.appendChild(createElement('option', {
        attrs: { value: organisation.id },
        text: organisation.name
      }));
    }
  }
}

customElements.define('page-report-new', PageReportNew);