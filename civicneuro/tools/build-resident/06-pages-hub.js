/**
 * @file tools/build-resident/06-pages-hub.js
 * Generates Home, Menu, Alerts, Your Area, Polls, News, Surveys, Safety pages.
 */
import fs from 'node:fs';
import path from 'node:path';

function write(relPath, content) {
  const full = path.resolve('civicneuro', relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trim() + '\n', 'utf8');
  console.log('Wrote:', relPath);
}

// 1. home
write('apps/resident-pwa/src/pages/home/home.js', `/**
 * @file apps/resident-pwa/src/pages/home/home.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { sessionStore } from '../../session.js';
import { listMyReports } from '../../features/reports/reports.client.js';
import '../../components/report-card/report-card.js';

export class PageHome extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '16px';

    const session = sessionStore.get();
    const name = session.user?.fullName || 'Resident';

    const welcome = createElement('div', { attrs: { style: 'margin-bottom: 20px;' } });
    const greeting = createElement('h1', { text: \`Sawubona, \${name} 👋\`, attrs: { style: 'font-size: 1.5rem; margin: 0 0 4px;' } });
    const ward = createElement('div', { text: '📍 Ward 110, eThekwini Municipality', attrs: { style: 'font-size: 0.875rem; color: #5e6c84;' } });
    welcome.appendChild(greeting);
    welcome.appendChild(ward);
    this.appendChild(welcome);

    // Quick Action Grid
    const grid = createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '12px';
    grid.style.marginBottom = '24px';

    const actions = [
      { id: 'snap', title: '🎙️ Snap & Say', sub: 'Fast AI Voice Report', route: 'snap-and-say', color: '#0052cc' },
      { id: 'report', title: '📋 Report Issue', sub: 'Fill form manually', route: 'report-new', color: '#0747a6' },
      { id: 'lifeline', title: '🆘 Lifeline', sub: 'Emergency contacts', route: 'lifeline-home', color: '#de350b' },
      { id: 'beacon', title: '📍 Beacon', sub: 'Safe walk sharing', route: 'beacon-home', color: '#00875a' }
    ];

    for (const act of actions) {
      const card = createElement('div');
      card.style.background = '#ffffff';
      card.style.border = '1px solid #dfe1e6';
      card.style.borderRadius = '12px';
      card.style.padding = '16px';
      card.style.cursor = 'pointer';
      card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.04)';

      const t = createElement('div', { text: act.title, attrs: { style: \`font-weight: 700; font-size: 1rem; color: \${act.color}; margin-bottom: 4px;\` } });
      const s = createElement('div', { text: act.sub, attrs: { style: 'font-size: 0.75rem; color: #6b778c;' } });
      card.appendChild(t);
      card.appendChild(s);
      card.onclick = () => navigate(act.route);
      grid.appendChild(card);
    }
    this.appendChild(grid);

    // Community Pulse & Ward Updates Card
    const pulseCard = createElement('div');
    pulseCard.style.background = '#f4f5f7';
    pulseCard.style.borderRadius = '12px';
    pulseCard.style.padding = '16px';
    pulseCard.style.marginBottom = '24px';

    const pulseTitle = createElement('div', { text: '📊 Community Pulse', attrs: { style: 'font-weight: 700; margin-bottom: 8px;' } });
    const pulseText = createElement('div', { text: '85% of reported water outages resolved in Ward 110 this week.', attrs: { style: 'font-size: 0.875rem; color: #172b4d;' } });
    const pulseLink = createElement('button', { cls: 'cn-btn cn-btn--ghost', text: 'View Ward Insights →' });
    pulseLink.style.padding = '4px 0';
    pulseLink.onclick = () => navigate('community-pulse');

    pulseCard.appendChild(pulseTitle);
    pulseCard.appendChild(pulseText);
    pulseCard.appendChild(pulseLink);
    this.appendChild(pulseCard);

    // Recent Reports Section
    const repHeader = createElement('div');
    repHeader.style.display = 'flex';
    repHeader.style.justifyContent = 'space-between';
    repHeader.style.alignItems = 'center';
    repHeader.style.marginBottom = '12px';

    const repTitle = createElement('h3', { text: 'Recent Reports', attrs: { style: 'margin: 0;' } });
    const viewAll = createElement('button', { cls: 'cn-btn cn-btn--ghost', text: 'View all' });
    viewAll.onclick = () => navigate('my-reports');
    repHeader.appendChild(repTitle);
    repHeader.appendChild(viewAll);
    this.appendChild(repHeader);

    try {
      const res = await listMyReports();
      const list = (res.reports || []).slice(0, 2);
      for (const rep of list) {
        const card = createElement('cn-report-card');
        card.data = rep;
        this.appendChild(card);
      }
    } catch (e) {}
  }
}
customElements.define('page-home', PageHome);
`);

// 2. menu
write('apps/resident-pwa/src/pages/menu/menu.js', `/**
 * @file apps/resident-pwa/src/pages/menu/menu.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';
import { signOut } from '../../features/auth/auth.client.js';
import { sessionStore } from '../../session.js';
import '../../components/confirm-dialog/confirm-dialog.js';

export class PageMenu extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const title = createElement('h1', { text: 'Menu' });
    this.appendChild(title);

    const isGuest = sessionStore.get().isGuest;

    const sections = [
      {
        title: 'Community & Ward',
        items: [
          { label: '📍 Your Area & Ward Info', route: 'your-area' },
          { label: '🗳️ Community Polls', route: 'polls' },
          { label: '📋 Ward Surveys', route: 'survey' },
          { label: '📰 Municipal News', route: 'news' },
          { label: '📈 Trending Issues', route: 'trending-issues' },
          { label: '🛡️ Safety Guidelines', route: 'safety-info' }
        ]
      },
      {
        title: 'Account & Settings',
        items: isGuest ? [
          { label: '🔑 Sign In / Register', route: 'welcome' },
          { label: '🌐 Language / Ulimi / Taal', route: 'language' },
          { label: '❓ Help & Safety FAQs', route: 'help-and-safety' },
          { label: '📜 Terms & POPIA Privacy', route: 'privacy-policy' }
        ] : [
          { label: '👤 Profile & Badges', route: 'account' },
          { label: '🌐 Language / Ulimi / Taal', route: 'language' },
          { label: '🔔 Notification Settings', route: 'notification-settings' },
          { label: '📜 Terms of Service', route: 'terms' },
          { label: '🛡️ POPIA Privacy Policy', route: 'privacy-policy' },
          { label: '📦 Export My Data (POPIA)', route: 'data-export' },
          { label: '❓ Help & FAQs', route: 'help-and-safety' }
        ]
      }
    ];

    for (const sec of sections) {
      const secH = createElement('h3', { text: sec.title, attrs: { style: 'margin: 20px 0 8px; color: #5e6c84; font-size: 0.875rem;' } });
      this.appendChild(secH);

      const list = createElement('div');
      list.style.background = '#ffffff';
      list.style.border = '1px solid #dfe1e6';
      list.style.borderRadius = '8px';
      list.style.overflow = 'hidden';

      for (const item of sec.items) {
        const row = createElement('div');
        row.style.padding = '14px 16px';
        row.style.borderBottom = '1px solid #f4f5f7';
        row.style.cursor = 'pointer';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';

        const label = createElement('span', { text: item.label, attrs: { style: 'font-weight: 500;' } });
        const arrow = createElement('span', { text: '→', attrs: { style: 'color: #6b778c;' } });
        row.appendChild(label);
        row.appendChild(arrow);
        row.onclick = () => navigate(item.route);
        list.appendChild(row);
      }
      this.appendChild(list);
    }

    if (!isGuest) {
      const signOutBtn = createElement('button', { cls: 'cn-btn cn-btn--danger cn-btn--full', text: 'Sign Out' });
      signOutBtn.style.marginTop = '24px';
      signOutBtn.onclick = () => {
        const { CnConfirmDialog } = customElements.get('cn-confirm-dialog') ? { CnConfirmDialog: customElements.get('cn-confirm-dialog') } : {};
        CnConfirmDialog.show({
          title: 'Sign Out?',
          message: 'Are you sure you want to sign out of CivicNeuro?',
          confirmText: 'Sign Out',
          danger: true,
          onConfirm: () => {
            signOut();
            navigate('welcome');
          }
        });
      };
      this.appendChild(signOutBtn);
    }
  }
}
customElements.define('page-menu', PageMenu);
`);

// 3. alerts & your-area & polls & poll-detail & community-pulse & trending-issues
write('apps/resident-pwa/src/pages/alerts/alerts.js', `/**
 * Legacy custom-element alias; the router now sends #alerts to #notifications.
 */
import { PageNotifications } from '../notifications/notifications.js';

export class PageAlerts extends PageNotifications {}
customElements.define('page-alerts', PageAlerts);
`);

write('apps/resident-pwa/src/pages/your-area/your-area.js', `/**
 * @file apps/resident-pwa/src/pages/your-area/your-area.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageYourArea extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Your Ward & Municipality' });
    const card = createElement('div');
    card.style.background = '#fff';
    card.style.border = '1px solid #dfe1e6';
    card.style.borderRadius = '12px';
    card.style.padding = '16px';

    const w = createElement('h3', { text: 'Ward 110 — eThekwini' });
    const c = createElement('p', { text: 'Councillor: Cllr. A. Dlamini\\nRefuse Collection: Wednesdays\\nSAPS Sector: Sector 2 Durban North' });

    card.appendChild(w);
    card.appendChild(c);
    this.appendChild(h);
    this.appendChild(card);
  }
}
customElements.define('page-your-area', PageYourArea);
`);

write('apps/resident-pwa/src/pages/polls/polls.js', `/**
 * @file apps/resident-pwa/src/pages/polls/polls.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getPolls } from '../../features/polls/polls.client.js';
import { navigate } from '../../router.js';

export class PagePolls extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Community Polls' });
    this.appendChild(h);

    const res = await getPolls();
    for (const poll of (res.polls || [])) {
      const card = createElement('div');
      card.style.background = '#fff';
      card.style.border = '1px solid #dfe1e6';
      card.style.borderRadius = '12px';
      card.style.padding = '16px';
      card.style.marginBottom = '12px';
      card.style.cursor = 'pointer';

      const t = createElement('div', { text: poll.title, attrs: { style: 'font-weight: 700; font-size: 1.125rem;' } });
      const d = createElement('p', { text: poll.description, attrs: { style: 'font-size: 0.875rem; color: #5e6c84;' } });
      const v = createElement('div', { text: \`\${poll.totalVotes} votes cast\`, attrs: { style: 'font-size: 0.75rem; color: #0052cc; font-weight: 600;' } });

      card.appendChild(t);
      card.appendChild(d);
      card.appendChild(v);
      card.onclick = () => navigate('poll-detail', { id: poll.id });
      this.appendChild(card);
    }
  }
}
customElements.define('page-polls', PagePolls);
`);

write('apps/resident-pwa/src/pages/poll-detail/poll-detail.js', `/**
 * @file apps/resident-pwa/src/pages/poll-detail/poll-detail.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { votePoll, getPolls } from '../../features/polls/polls.client.js';

export class PagePollDetail extends BaseElement {
  init(params) {
    this._id = params.id;
  }
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const res = await getPolls();
    const poll = (res.polls || []).find(p => p.id === this._id) || res.polls[0];

    const h = createElement('h1', { text: poll.title });
    const d = createElement('p', { text: poll.description, attrs: { style: 'color: #5e6c84;' } });
    this.appendChild(h);
    this.appendChild(d);

    let selectedOpt = null;
    const optGroup = createElement('div');
    optGroup.style.margin = '20px 0';

    for (const opt of poll.options) {
      const optCard = createElement('div');
      optCard.style.padding = '12px 16px';
      optCard.style.border = '1px solid #dfe1e6';
      optCard.style.borderRadius = '8px';
      optCard.style.marginBottom = '8px';
      optCard.style.cursor = 'pointer';
      optCard.textContent = opt.text;

      optCard.onclick = () => {
        selectedOpt = opt.id;
        Array.from(optGroup.children).forEach(c => c.style.borderColor = '#dfe1e6');
        optCard.style.borderColor = '#0052cc';
        optCard.style.background = '#deebff';
      };
      optGroup.appendChild(optCard);
    }
    this.appendChild(optGroup);

    const voteBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Cast Vote' });
    voteBtn.onclick = async () => {
      if (!selectedOpt) {
        showToast('Please select an option', { type: 'error' });
        return;
      }
      await votePoll(poll.id, selectedOpt);
      showToast('Vote recorded!', { type: 'success' });
      voteBtn.disabled = true;
      voteBtn.textContent = 'Vote Submitted';
    };
    this.appendChild(voteBtn);
  }
}
customElements.define('page-poll-detail', PagePollDetail);
`);

write('apps/resident-pwa/src/pages/community-pulse/community-pulse.js', `/**
 * @file apps/resident-pwa/src/pages/community-pulse/community-pulse.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageCommunityPulse extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Community Pulse' });
    const p = createElement('p', { text: 'Real-time metrics on service delivery and issue resolution in Ward 110.' });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-community-pulse', PageCommunityPulse);
`);

write('apps/resident-pwa/src/pages/trending-issues/trending-issues.js', `/**
 * @file apps/resident-pwa/src/pages/trending-issues/trending-issues.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageTrendingIssues extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Trending Issues' });
    const p = createElement('p', { text: 'Most reported concerns in your municipal zone this week.' });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-trending-issues', PageTrendingIssues);
`);

// 4. news & news-article & survey & survey-submitted & safety-info & help-and-safety
write('apps/resident-pwa/src/pages/news/news.js', `/**
 * @file apps/resident-pwa/src/pages/news/news.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getNews } from '../../features/news/news.client.js';
import { navigate } from '../../router.js';

export class PageNews extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Municipal News & Bulletins' });
    this.appendChild(h);

    const res = await getNews();
    for (const item of (res.news || [])) {
      const card = createElement('div');
      card.style.background = '#fff';
      card.style.border = '1px solid #dfe1e6';
      card.style.borderRadius = '8px';
      card.style.padding = '16px';
      card.style.marginBottom = '12px';
      card.style.cursor = 'pointer';

      const t = createElement('div', { text: item.title, attrs: { style: 'font-weight: 700;' } });
      const s = createElement('p', { text: item.snippet, attrs: { style: 'font-size: 0.875rem; color: #5e6c84;' } });
      card.appendChild(t);
      card.appendChild(s);
      card.onclick = () => navigate('news-article', { id: item.id });
      this.appendChild(card);
    }
  }
}
customElements.define('page-news', PageNews);
`);

write('apps/resident-pwa/src/pages/news-article/news-article.js', `/**
 * @file apps/resident-pwa/src/pages/news-article/news-article.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getNews } from '../../features/news/news.client.js';

export class PageNewsArticle extends BaseElement {
  init(params) {
    this._id = params.id;
  }
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const res = await getNews();
    const item = (res.news || []).find(n => n.id === this._id) || res.news[0];

    const h = createElement('h1', { text: item.title });
    const p = createElement('p', { text: item.body || item.snippet, attrs: { style: 'line-height: 1.6;' } });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-news-article', PageNewsArticle);
`);

write('apps/resident-pwa/src/pages/survey/survey.js', `/**
 * @file apps/resident-pwa/src/pages/survey/survey.js
 */
import { BaseElement, showToast } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { getSurveys, submitSurvey } from '../../features/surveys/surveys.client.js';
import { navigate } from '../../router.js';

export class PageSurvey extends BaseElement {
  async connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const res = await getSurveys();
    const surv = (res.surveys || [])[0];

    const h = createElement('h1', { text: surv.title });
    const d = createElement('p', { text: surv.description, attrs: { style: 'color: #5e6c84;' } });
    this.appendChild(h);
    this.appendChild(d);

    const submitBtn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Submit Survey Answers' });
    submitBtn.style.marginTop = '24px';
    submitBtn.onclick = async () => {
      await submitSurvey(surv.id, [{ q1: 'Daily' }]);
      showToast('Survey submitted!', { type: 'success' });
      navigate('survey-submitted');
    };
    this.appendChild(submitBtn);
  }
}
customElements.define('page-survey', PageSurvey);
`);

write('apps/resident-pwa/src/pages/survey-submitted/survey-submitted.js', `/**
 * @file apps/resident-pwa/src/pages/survey-submitted/survey-submitted.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';
import { navigate } from '../../router.js';

export class PageSurveySubmitted extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '32px 20px';
    this.style.textAlign = 'center';

    const icon = createElement('div', { text: '🎉', attrs: { style: 'font-size: 3rem;' } });
    const h = createElement('h1', { text: 'Survey Completed' });
    const p = createElement('p', { text: 'Thank you for contributing to your community planning.' });
    const btn = createElement('button', { cls: 'cn-btn cn-btn--primary cn-btn--full', text: 'Back to Home' });
    btn.onclick = () => navigate('home');

    this.appendChild(icon);
    this.appendChild(h);
    this.appendChild(p);
    this.appendChild(btn);
  }
}
customElements.define('page-survey-submitted', PageSurveySubmitted);
`);

write('apps/resident-pwa/src/pages/safety-info/safety-info.js', `/**
 * @file apps/resident-pwa/src/pages/safety-info/safety-info.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageSafetyInfo extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Community Safety' });
    const p = createElement('p', { text: 'Safety tips, emergency hotlines, and CPF sector information.' });
    this.appendChild(h);
    this.appendChild(p);
  }
}
customElements.define('page-safety-info', PageSafetyInfo);
`);

write('apps/resident-pwa/src/pages/help-and-safety/help-and-safety.js', `/**
 * @file apps/resident-pwa/src/pages/help-and-safety/help-and-safety.js
 */
import { BaseElement } from '@civicneuro/ui';
import { clearChildren, createElement } from '@civicneuro/security-web';

export class PageHelpAndSafety extends BaseElement {
  connectedCallback() {
    clearChildren(this);
    this.style.padding = '20px';

    const h = createElement('h1', { text: 'Help & FAQs' });
    const faqs = [
      { q: 'How is my personal info protected under POPIA?', a: 'CivicNeuro redacts PII, never sells data, stores tokens in memory, and allows one-click data exports.' },
      { q: 'How do I escalate an unresolved issue?', a: 'Open your report in "My Reports" and click "Manual Escalation".' }
    ];

    this.appendChild(h);
    for (const f of faqs) {
      const b = createElement('div');
      b.style.marginBottom = '16px';
      const q = createElement('h3', { text: f.q });
      const a = createElement('p', { text: f.a, attrs: { style: 'color: #5e6c84;' } });
      b.appendChild(q);
      b.appendChild(a);
      this.appendChild(b);
    }
  }
}
customElements.define('page-help-and-safety', PageHelpAndSafety);
`);

console.log('Hub pages generated successfully.');
