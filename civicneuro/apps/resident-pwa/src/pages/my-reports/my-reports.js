/**
 * @file apps/resident-pwa/src/pages/my-reports/my-reports.js
 * Screen A: "My reports" list — landing screen of the Reports tab.
 * Includes Search, Filter chips with stable counts, Report cards,
 * Empty state (Screen B), Error state (Screen C), and Floating mic button (Snap & Say).
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { reportsStore, getAllReports, getReportCounts, replaceReports } from '../../features/reports/reports.store.js';
import { listMyReports } from '../../features/reports/reports.client.js';
import { sessionStore } from '../../session.js';
import { createStatusPill } from '../../components/status-pill/status-pill.js';
import { createEmptyState } from '../../components/empty-state/empty-state.js';
import { createErrorState } from '../../components/error-state/error-state.js';
import { navigate } from '../../router.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'escalated', label: 'Escalated' }
];

function createSearchSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '7');

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', 'm21 21-4.3-4.3');

  svg.appendChild(circle);
  svg.appendChild(line);
  return svg;
}

function createMicSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('d', 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z');

  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M19 10v2a7 7 0 0 1-14 0v-2M12 19v4');

  svg.appendChild(path1);
  svg.appendChild(path2);
  return svg;
}

function createSkeletonCard() {
  const card = createElement('div', { cls: 'mr-skeleton-card' });

  const topRow = createElement('div', { attrs: { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;' } });
  const leftCol = createElement('div', { attrs: { style: 'flex:1;display:flex;flex-direction:column;gap:5px;' } });

  const skelTitle = createElement('div', { cls: 'mr-skel-line', attrs: { style: 'height:13px;width:65%;' } });
  const skelRef = createElement('div', { cls: 'mr-skel-line', attrs: { style: 'height:10px;width:38%;' } });
  leftCol.appendChild(skelTitle);
  leftCol.appendChild(skelRef);

  const skelPill = createElement('div', { cls: 'mr-skel-line', attrs: { style: 'height:20px;width:64px;border-radius:99px;flex:0 0 auto;' } });
  topRow.appendChild(leftCol);
  topRow.appendChild(skelPill);

  const dividerRow = createElement('div', { attrs: { style: 'margin-top:9px;padding-top:9px;border-top:1px solid #DAD5C6;display:flex;justify-content:space-between;align-items:center;' } });
  const skelCat = createElement('div', { cls: 'mr-skel-line', attrs: { style: 'height:10px;width:50%;' } });
  const skelDate = createElement('div', { cls: 'mr-skel-line', attrs: { style: 'height:10px;width:24%;' } });
  dividerRow.appendChild(skelCat);
  dividerRow.appendChild(skelDate);

  card.appendChild(topRow);
  card.appendChild(dividerRow);
  return card;
}

function createReportCard(report) {
  const card = createElement('div', {
    cls: 'm-report-card',
    attrs: {
      role: 'button',
      tabindex: '0',
      'aria-label': `${report.title}, status: ${report.status}`,
      id: `report-card-${report.id}`
    }
  });

  // Top row
  const top = createElement('div', { cls: 'rc-top' });

  const left = createElement('div');
  const title = createElement('div', { cls: 'rc-title', text: report.title || 'Untitled report' });
  const ref = createElement('div', { cls: 'rc-ref', text: report.referenceNumber || '—' });
  left.appendChild(title);
  left.appendChild(ref);

  const pill = createStatusPill(report.status);

  top.appendChild(left);
  top.appendChild(pill);

  // Bottom row
  const bottom = createElement('div', { cls: 'rc-bottom' });

  const catLocText = [report.category, report.location].filter(Boolean).join(' · ') || 'General';
  const catLoc = createElement('span', { cls: 'rc-cat', text: catLocText });
  const date = createElement('span', { cls: 'rc-date', text: report.displayTime || '' });

  bottom.appendChild(catLoc);
  bottom.appendChild(date);

  card.appendChild(top);
  card.appendChild(bottom);

  const onOpen = () => navigate('report-detail', { id: report.id });
  card.onclick = onOpen;
  card.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };

  return card;
}

export class PageMyReports extends BaseElement {
  constructor() {
    super();
    this._filter = 'all';
    this._searchQuery = '';
    this._debounceTimer = null;
    this._refreshTimer = null;
    this._refreshInFlight = false;
    this._refreshAttempts = 0;
    this._aiRefreshExhausted = false;
    this._isLoading = false;
    this._hasError = false;
  }

  connectedCallback() {
    if (sessionStore.get()?.isGuest) {
      navigate('track-report');
      return;
    }
    replaceReports([]);
    this._unsubscribe = reportsStore.subscribe(() => {
      this._renderCards();
      this._updateFilterCounts();
      this._updateAiRefreshPolling();
    });
    this._isLoading = true;
    this._render();
    this._loadReports();
  }

  disconnectedCallback() {
    if (this._unsubscribe) this._unsubscribe();
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    super.disconnectedCallback();
  }

  async _loadReports(showLoading = true) {
    if (this._refreshInFlight) return;
    this._refreshInFlight = true;
    if (showLoading) {
      this._isLoading = true;
      this._hasError = false;
      this._renderCards();
    }
    try {
      await listMyReports();
      this._hasError = false;
    } catch (error) {
      console.error('Could not load resident reports.', error);
      if (showLoading) this._hasError = true;
    } finally {
      this._refreshInFlight = false;
      if (showLoading) this._isLoading = false;
      this._renderCards();
      this._updateFilterCounts();
      this._updateAiRefreshPolling();
    }
  }

  _updateAiRefreshPolling() {
    const hasPendingClassification = getAllReports().some((report) =>
      report.status === 'review' && report.awaitingAiClassification
    );
    if (hasPendingClassification && !this._refreshTimer && !this._aiRefreshExhausted) {
      this._refreshTimer = setInterval(() => {
        if (document.hidden) return;
        this._refreshAttempts += 1;
        if (this._refreshAttempts >= 24) {
          clearInterval(this._refreshTimer);
          this._refreshTimer = null;
          this._aiRefreshExhausted = true;
          return;
        }
        this._loadReports(false);
      }, 5000);
    } else if (!hasPendingClassification && this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
      this._refreshAttempts = 0;
      this._aiRefreshExhausted = false;
    } else if (!hasPendingClassification) {
      this._refreshAttempts = 0;
      this._aiRefreshExhausted = false;
    }
  }

  _render() {
    clearChildren(this);
    this.classList.add('cn-my-reports-page');

    const container = createElement('div', { cls: 'mr-page' });

    // 1. Page title
    const title = createElement('div', {
      cls: 'mr-title',
      text: 'Track'
    });
    container.appendChild(title);

    // 2. Search field
    const searchWrap = createElement('div', { cls: 'm-reports-search' });
    searchWrap.appendChild(createSearchSvg());

    const searchInput = createElement('input', {
      attrs: {
        type: 'text',
        placeholder: 'Search your reports…',
        'aria-label': 'Search your reports',
        id: 'mr-search-input',
        value: this._searchQuery
      }
    });

    searchInput.oninput = (e) => {
      if (this._debounceTimer) clearTimeout(this._debounceTimer);
      const val = e.target.value;
      this._debounceTimer = setTimeout(() => {
        this._searchQuery = val.trim();
        this._renderCards();
      }, 250);
    };

    searchWrap.appendChild(searchInput);
    container.appendChild(searchWrap);

    // 3. Filter chips row
    this._filtersRow = createElement('div', {
      cls: 'm-reports-filters',
      attrs: { role: 'tablist', 'aria-label': 'Filter reports' }
    });
    this._buildFilterChips();
    container.appendChild(this._filtersRow);

    // 4. Report cards list container
    this._cardsContainer = createElement('div', {
      cls: 'mr-cards-list',
      attrs: { id: 'mr-cards-list' }
    });
    container.appendChild(this._cardsContainer);

    // 5. Floating mic button (Snap & Say entry)
    const fab = createElement('button', {
      cls: ['snap-fab', 'mr-fab'],
      attrs: {
        type: 'button',
        'aria-label': 'Report by voice and photo',
        id: 'mr-fab-mic'
      }
    });
    fab.appendChild(createMicSvg());
    fab.onclick = () => navigate('snap-and-say');
    container.appendChild(fab);

    this.appendChild(container);

    this._renderCards();
  }

  _buildFilterChips() {
    if (!this._filtersRow) return;
    clearChildren(this._filtersRow);

    const counts = getReportCounts();

    for (const f of FILTERS) {
      const isSelected = this._filter === f.key;
      const chip = createElement('button', {
        cls: ['m-filter-chip', isSelected ? 'on' : ''],
        attrs: {
          type: 'button',
          role: 'tab',
          'aria-selected': isSelected ? 'true' : 'false',
          id: `mr-chip-${f.key}`
        }
      });

      const labelSpan = createElement('span', { text: f.label });
      const countVal = counts[f.key] !== undefined ? counts[f.key] : 0;
      const countSpan = createElement('span', { cls: 'fc-count', text: String(countVal) });

      chip.appendChild(labelSpan);
      chip.appendChild(countSpan);

      chip.onclick = () => {
        if (this._filter === f.key) return;
        this._filter = f.key;
        this._buildFilterChips();
        this._renderCards();
      };

      this._filtersRow.appendChild(chip);
    }
  }

  _updateFilterCounts() {
    this._buildFilterChips();
  }

  _getFilteredReports() {
    const all = getAllReports();
    let filtered = all;

    // Filter chip rules:
    // All = everything
    // Active = Review + In progress
    // Resolved = Resolved
    // Escalated = Escalated
    // Withdrawn / Queued = show under All only
    if (this._filter === 'active') {
      filtered = filtered.filter(r =>
        r.status === 'review' || r.status === 'in_progress' || r.status === 'open' || r.status === 'under_review'
      );
    } else if (this._filter === 'resolved') {
      filtered = filtered.filter(r => r.status === 'resolved');
    } else if (this._filter === 'escalated') {
      filtered = filtered.filter(r => r.status === 'escalated');
    }

    // Search query: case-insensitive match on title, reference number, and location
    if (this._searchQuery) {
      const q = this._searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.referenceNumber && r.referenceNumber.toLowerCase().includes(q)) ||
        (r.location && r.location.toLowerCase().includes(q)) ||
        (r.category && r.category.toLowerCase().includes(q))
      );
    }

    return filtered;
  }

  _renderCards() {
    if (!this._cardsContainer) return;
    clearChildren(this._cardsContainer);

    if (this._isLoading) {
      for (let i = 0; i < 3; i++) {
        this._cardsContainer.appendChild(createSkeletonCard());
      }
      return;
    }

    if (this._hasError) {
      const err = createErrorState({
        title: "Couldn't load your reports",
        message: 'Something went wrong on our end. Your details are still filled in below — try again.',
        onRetry: () => this._loadReports()
      });
      this._cardsContainer.appendChild(err);
      return;
    }

    const allReports = getAllReports();
    // Screen B: 0 reports total in the app
    if (allReports.length === 0) {
      const emptyState = createEmptyState(
        'No reports yet',
        "When you report an issue it'll show up here so you can track it."
      );
      this._cardsContainer.appendChild(emptyState);
      return;
    }

    const filtered = this._getFilteredReports();

    // No matches for search
    if (filtered.length === 0) {
      const emptyState = createEmptyState(
        'No reports found',
        this._searchQuery
          ? `No reports match “${this._searchQuery}”`
          : 'No reports match the selected filter.'
      );
      this._cardsContainer.appendChild(emptyState);
      return;
    }

    for (const report of filtered) {
      this._cardsContainer.appendChild(createReportCard(report));
    }
  }
}

customElements.define('page-my-reports', PageMyReports);