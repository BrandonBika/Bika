/**
 * @file apps/resident-pwa/src/pages/report-duplicate-check/report-duplicate-check.js
 * Screen D: Duplicate-check interstitial shown when a new report closely
 * matches an existing active cluster in the same area.
 * The resident can join the existing cluster or submit a new report anyway.
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import '../../components/back-button/back-button.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createWarnSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p1 = document.createElementNS(SVG_NS, 'path');
  p1.setAttribute('d', 'M12 9v4M12 17h.01');
  const p2 = document.createElementNS(SVG_NS, 'path');
  p2.setAttribute('d', 'M10.3 3.86 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0Z');
  svg.appendChild(p1);
  svg.appendChild(p2);
  return svg;
}

function createMapPinSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M12 22s7-7.6 7-12.5A7 7 0 0 0 5 9.5C5 14.4 12 22 12 22Z');
  const c = document.createElementNS(SVG_NS, 'circle');
  c.setAttribute('cx', '12');
  c.setAttribute('cy', '9.5');
  c.setAttribute('r', '2.5');
  svg.appendChild(p);
  svg.appendChild(c);
  return svg;
}

export class PageReportDuplicateCheck extends BaseElement {
  init(params) {
    this._params = params || {};
    // Nearby report context passed from report-new flow via params
    this._nearbyTitle = params?.nearbyTitle || 'Pothole cluster';
    this._nearbyRef = params?.nearbyRef || 'CN-2026-04452';
    this._nearbyStatus = params?.nearbyStatus || 'Under review';
    this._nearbyLocation = params?.nearbyLocation || 'Florida Rd';
    this._nearbyCount = params?.count || '3';
    // Pass-through the draft report params so they survive navigation
    this._draftId = params?.draftId || null;
  }

  connectedCallback() {
    clearChildren(this);
    this.classList.add('cn-duplicate-check-page');
    this._render();
  }

  _render() {
    const fallbackParams = {
      skipDupeCheck: 'true',
      ...(this._draftId ? { draftId: this._draftId } : {})
    };
    this.appendChild(createElement('cn-back-button', {
      attrs: {
        fallback: 'report-new',
        'fallback-params': new URLSearchParams(fallbackParams).toString()
      }
    }));
    const container = createElement('div', { cls: 'dc-page' });

    // ---- Icon banner ----
    const iconWrap = createElement('div', { cls: 'dc-icon-wrap' });
    iconWrap.appendChild(createWarnSvg());
    container.appendChild(iconWrap);

    // ---- Title ----
    const title = createElement('div', {
      cls: 'dc-title',
      text: 'Similar report nearby'
    });
    container.appendChild(title);

    // ---- Subtitle ----
    const sub = createElement('div', {
      cls: 'dc-sub',
      text: `${this._nearbyCount} residents have already reported a similar issue in your area.`
    });
    container.appendChild(sub);

    // ---- Cluster preview card ----
    const card = createElement('div', { cls: 'dc-cluster-card' });

    const cardTop = createElement('div', { cls: 'dc-card-top' });
    const cardLeft = createElement('div');

    const clusterTitle = createElement('div', { cls: 'dc-cluster-title', text: this._nearbyTitle });
    const clusterRef = createElement('div', { cls: 'dc-cluster-ref', text: this._nearbyRef });
    cardLeft.appendChild(clusterTitle);
    cardLeft.appendChild(clusterRef);

    // Status pill
    const pill = createElement('span', { cls: 'dc-status-pill' });
    const dot = createElement('span', { cls: 'dc-pill-dot' });
    const pillLabel = createElement('span', { text: this._nearbyStatus });
    pill.appendChild(dot);
    pill.appendChild(pillLabel);

    cardTop.appendChild(cardLeft);
    cardTop.appendChild(pill);
    card.appendChild(cardTop);

    // Location row
    const locRow = createElement('div', { cls: 'dc-card-loc' });
    const locIcon = createElement('span', { cls: 'dc-loc-icon' });
    locIcon.appendChild(createMapPinSvg());
    const locText = createElement('span', { text: this._nearbyLocation });
    locRow.appendChild(locIcon);
    locRow.appendChild(locText);
    card.appendChild(locRow);

    container.appendChild(card);

    // ---- Explainer text ----
    const explainer = createElement('div', {
      cls: 'dc-explainer',
      text: 'Adding your photo or details to the existing report helps the city prioritise faster. You can still submit a separate report if the issue is at a different location or different in nature.'
    });
    container.appendChild(explainer);

    // ---- Action buttons ----
    const btnStack = createElement('div', { cls: 'dc-btn-stack' });

    // Primary: View existing cluster
    const viewBtn = createElement('button', {
      cls: ['dc-btn', 'dc-btn-primary'],
      attrs: {
        type: 'button',
        id: 'dc-btn-view-cluster'
      },
      text: 'View existing report'
    });
    viewBtn.onclick = () => navigate('report-detail', { id: this._nearbyRef });

    // Secondary: submit anyway
    const submitBtn = createElement('button', {
      cls: ['dc-btn', 'dc-btn-ghost'],
      attrs: {
        type: 'button',
        id: 'dc-btn-submit-anyway'
      },
      text: 'Submit mine anyway'
    });
    submitBtn.onclick = () => {
      // Navigate to report-new without the duplicate-check guard
      navigate('report-new', { skipDupeCheck: 'true', ...(this._draftId ? { draftId: this._draftId } : {}) });
    };

    btnStack.appendChild(viewBtn);
    btnStack.appendChild(submitBtn);
    container.appendChild(btnStack);

    this.appendChild(container);
  }
}

customElements.define('page-report-duplicate-check', PageReportDuplicateCheck);
