/**
 * @file apps/resident-pwa/src/pages/load-shedding-schedule/load-shedding-schedule.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import '../../components/back-button/back-button.js';

async function fetchLoadSheddingSchedule() {
  // TODO: Replace this clearly labelled placeholder with a verified schedule data source.
  const placeholderData = {
    isPlaceholder: true,
    stage: 'Stage 2',
    area: 'Ward 12',
    outages: [
      { dayOffset: 1, start: '02:00', end: '04:30' },
      { dayOffset: 2, start: '10:00', end: '12:30' },
      { dayOffset: 3, start: '18:00', end: '20:30' },
      { dayOffset: 4, start: '02:00', end: '04:30' }
    ]
  };
  return placeholderData;
}

function formatOutageDay(dayOffset) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  }).format(date);
}

export class PageLoadSheddingSchedule extends BaseElement {
  connectedCallback() {
    this.classList.add('cn-load-shedding-page');
    this.render();
  }

  async render() {
    clearChildren(this);
    this.appendChild(createElement('cn-back-button', { attrs: { fallback: 'menu' } }));

    const schedule = await fetchLoadSheddingSchedule();
    if (!this.isConnected) return;

    this.append(
      createElement('h1', { cls: 'cn-load-shedding-title', text: 'Load shedding schedule' }),
      createElement('p', {
        cls: 'cn-load-shedding-notice',
        text: schedule.isPlaceholder
          ? 'PLACEHOLDER DATA — example only; this is not a live schedule.'
          : ''
      })
    );

    const summary = createElement('section', {
      cls: 'cn-load-shedding-summary',
      attrs: { 'aria-label': 'Current schedule' }
    });
    summary.append(
      createElement('span', { cls: 'cn-load-shedding-summary__label', text: 'Current stage' }),
      createElement('strong', { cls: 'cn-load-shedding-summary__stage', text: schedule.stage }),
      createElement('span', { cls: 'cn-load-shedding-summary__area', text: schedule.area })
    );
    this.appendChild(summary);

    this.appendChild(createElement('h2', {
      cls: 'cn-load-shedding-section-title',
      text: 'Upcoming outages'
    }));
    const list = createElement('div', { cls: 'cn-load-shedding-list' });
    for (const outage of schedule.outages) {
      const row = createElement('article', { cls: 'cn-load-shedding-slot' });
      row.append(
        createElement('h3', {
          cls: 'cn-load-shedding-slot__day',
          text: formatOutageDay(outage.dayOffset)
        }),
        createElement('p', {
          cls: 'cn-load-shedding-slot__time',
          text: `${outage.start} – ${outage.end}`
        })
      );
      list.appendChild(row);
    }
    this.appendChild(list);
  }
}

customElements.define('page-load-shedding-schedule', PageLoadSheddingSchedule);
