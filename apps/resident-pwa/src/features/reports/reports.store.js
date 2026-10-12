/**
 * @file apps/resident-pwa/src/features/reports/reports.store.js
 * Reactive reports store managing report lifecycle, conversation threads,
 * status changes, satisfaction ratings, and search/filter counts.
 */
import { createStore } from '@civicneuro/state';

const SEED_REPORTS = [
  {
    id: 'CN-2026-04452',
    referenceNumber: 'CN-2026-04452',
    title: 'Pothole cluster',
    category: 'Roads',
    location: 'Florida Rd',
    status: 'review', // Review pill
    displayTime: 'Mon, 07:40',
    lastUpdatedAt: '2026-09-07T07:40:00Z',
    description: 'Large pothole in the left lane, about 40cm wide. Two cars have already swerved to avoid it this morning.',
    organisation: { id: 'org-roads', name: 'eThekwini Roads Dept' },
    unreadCount: 1,
    satisfaction: null,
    timeline: [
      { step: 'submitted', label: 'Submitted', at: 'Mon, 07:40', status: 'done' },
      { step: 'received', label: 'Received', at: 'Mon, 07:41', status: 'done' },
      { step: 'under_review', label: 'Under review', at: 'Mon, 09:15', status: 'current' },
      { step: 'in_progress', label: 'In progress', at: '', status: 'upcoming' },
      { step: 'resolved', label: 'Resolved', at: '', status: 'upcoming' }
    ],
    messages: [
      {
        id: 'm1',
        sender: 'resident',
        text: 'Large pothole in the left lane, about 40cm wide. Two cars have already swerved to avoid it this morning.',
        time: '07:40',
        day: 'Monday'
      },
      {
        id: 'm2',
        sender: 'org',
        orgName: 'eThekwini Roads Dept',
        text: "Thanks for reporting this, Kagiso. We've logged it as CN-2026-04452 and it's now with our roads team for review.",
        time: '07:41',
        day: 'Monday'
      },
      {
        id: 'm3',
        sender: 'resident',
        text: "Is there a rough timeline? It's getting worse with the rain.",
        time: '08:50',
        day: 'Monday'
      },
      {
        id: 'm4',
        sender: 'org',
        orgName: 'eThekwini Roads Dept',
        text: 'Thanks for the details — a crew has been assigned and will inspect within 48 hours.',
        time: 'Mon, 10:22',
        day: 'Monday'
      }
    ]
  },
  {
    id: 'CN-2026-04431',
    referenceNumber: 'CN-2026-04431',
    title: 'Burst water pipe',
    category: 'Water & Sanitation',
    location: 'Downtown',
    status: 'in_progress',
    displayTime: 'Sat, 14:02',
    lastUpdatedAt: '2026-09-05T14:02:00Z',
    description: 'Water gushing from municipal main under pavement, flooding pedestrian walkway.',
    organisation: { id: 'org-water', name: 'eThekwini Water & Sanitation' },
    unreadCount: 0,
    satisfaction: null,
    timeline: [
      { step: 'submitted', label: 'Submitted', at: 'Sat, 14:02', status: 'done' },
      { step: 'received', label: 'Received', at: 'Sat, 14:05', status: 'done' },
      { step: 'under_review', label: 'Under review', at: 'Sat, 14:30', status: 'done' },
      { step: 'in_progress', label: 'In progress', at: 'Sat, 15:10', status: 'current' },
      { step: 'resolved', label: 'Resolved', at: '', status: 'upcoming' }
    ],
    messages: [
      {
        id: 'm1',
        sender: 'resident',
        text: 'Water gushing from municipal main under pavement, flooding pedestrian walkway.',
        time: '14:02',
        day: 'Saturday'
      },
      {
        id: 'm2',
        sender: 'org',
        orgName: 'eThekwini Water & Sanitation',
        text: 'Water maintenance team dispatched to isolate the main pipe.',
        time: '14:05',
        day: 'Saturday'
      }
    ]
  },
  {
    id: 'CN-2026-04398',
    referenceNumber: 'CN-2026-04398',
    title: 'Streetlight out',
    category: 'Electricity',
    location: 'Ridge Rd',
    status: 'in_progress',
    displayTime: 'Thu, 19:30',
    lastUpdatedAt: '2026-09-03T19:30:00Z',
    description: 'Three consecutive streetlights dark between 42 and 58 Ridge Rd.',
    organisation: { id: 'org-elec', name: 'eThekwini Electricity' },
    unreadCount: 0,
    satisfaction: null,
    timeline: [
      { step: 'submitted', label: 'Submitted', at: 'Thu, 19:30', status: 'done' },
      { step: 'received', label: 'Received', at: 'Thu, 19:32', status: 'done' },
      { step: 'under_review', label: 'Under review', at: 'Thu, 20:00', status: 'done' },
      { step: 'in_progress', label: 'In progress', at: 'Fri, 08:30', status: 'current' },
      { step: 'resolved', label: 'Resolved', at: '', status: 'upcoming' }
    ],
    messages: [
      {
        id: 'm1',
        sender: 'resident',
        text: 'Three consecutive streetlights dark between 42 and 58 Ridge Rd.',
        time: '19:30',
        day: 'Thursday'
      },
      {
        id: 'm2',
        sender: 'org',
        orgName: 'eThekwini Electricity',
        text: 'Technician dispatched to replace the photocell sensors on circuit.',
        time: '19:32',
        day: 'Thursday'
      }
    ]
  },
  {
    id: 'CN-2026-04360',
    referenceNumber: 'CN-2026-04360',
    title: 'Illegal dumping',
    category: 'Sanitation',
    location: 'Bellair Rd',
    status: 'escalated',
    displayTime: 'Tue, 08:15',
    lastUpdatedAt: '2026-09-01T08:15:00Z',
    description: 'Builders rubble and hazardous waste dumped on open corner plot.',
    organisation: { id: 'org-san', name: 'eThekwini Cleansing & Solid Waste' },
    unreadCount: 0,
    satisfaction: null,
    timeline: [
      { step: 'submitted', label: 'Submitted', at: 'Tue, 08:15', status: 'done' },
      { step: 'received', label: 'Received', at: 'Tue, 08:18', status: 'done' },
      { step: 'under_review', label: 'Under review', at: 'Tue, 09:00', status: 'done' },
      { step: 'escalated', label: 'Escalated', at: 'Wed, 11:00', status: 'current' },
      { step: 'resolved', label: 'Resolved', at: '', status: 'upcoming' }
    ],
    messages: [
      {
        id: 'm1',
        sender: 'resident',
        text: 'Builders rubble and hazardous waste dumped on open corner plot.',
        time: '08:15',
        day: 'Tuesday'
      },
      {
        id: 'm2',
        sender: 'org',
        orgName: 'eThekwini Cleansing & Solid Waste',
        text: 'Escalated to Area Enforcement Supervisor due to hazardous materials.',
        time: '08:18',
        day: 'Tuesday'
      }
    ]
  },
  {
    id: 'CN-2026-04289',
    referenceNumber: 'CN-2026-04289',
    title: 'Blocked stormwater drain',
    category: 'Water & Sanitation',
    location: 'Musgrave Rd',
    status: 'resolved',
    displayTime: '22 Aug',
    lastUpdatedAt: '2026-08-22T16:40:00Z',
    description: 'Heavy silt and refuse blocking curb inlet causing water to dam across the lane.',
    organisation: { id: 'org-water', name: 'eThekwini Water & Sanitation' },
    unreadCount: 0,
    satisfaction: null, // Shows Close-the-loop dialog on detail page!
    timeline: [
      { step: 'submitted', label: 'Submitted', at: '20 Aug, 09:10', status: 'done' },
      { step: 'received', label: 'Received', at: '20 Aug, 09:12', status: 'done' },
      { step: 'under_review', label: 'Under review', at: '21 Aug, 10:00', status: 'done' },
      { step: 'in_progress', label: 'In progress', at: '21 Aug, 14:15', status: 'done' },
      { step: 'resolved', label: 'Resolved', at: '22 Aug, 16:40', status: 'done' }
    ],
    messages: [
      {
        id: 'm1',
        sender: 'resident',
        text: 'Heavy silt and refuse blocking curb inlet causing water to dam across the lane.',
        time: '20 Aug',
        day: 'August 20'
      },
      {
        id: 'm2',
        sender: 'org',
        orgName: 'eThekwini Water & Sanitation',
        text: 'Culvert jetting completed and grid re-seated.',
        time: '22 Aug',
        day: 'August 22'
      }
    ]
  },
  {
    id: 'CN-2026-04201',
    referenceNumber: 'CN-2026-04201',
    title: 'Fallen tree branch',
    category: 'Parks & Roads',
    location: 'Innes Rd',
    status: 'resolved',
    displayTime: '14 Aug',
    lastUpdatedAt: '2026-08-14T11:20:00Z',
    description: 'Large acacia branch cracked during wind storm, obstructing left vehicle lane.',
    organisation: { id: 'org-parks', name: 'eThekwini Parks, Recreation & Culture' },
    unreadCount: 0,
    satisfaction: true,
    timeline: [
      { step: 'submitted', label: 'Submitted', at: '13 Aug, 14:20', status: 'done' },
      { step: 'received', label: 'Received', at: '13 Aug, 14:22', status: 'done' },
      { step: 'under_review', label: 'Under review', at: '13 Aug, 15:00', status: 'done' },
      { step: 'in_progress', label: 'In progress', at: '14 Aug, 08:30', status: 'done' },
      { step: 'resolved', label: 'Resolved', at: '14 Aug, 11:20', status: 'done' }
    ],
    messages: [
      {
        id: 'm1',
        sender: 'resident',
        text: 'Large acacia branch cracked during wind storm, obstructing left vehicle lane.',
        time: '13 Aug',
        day: 'August 13'
      },
      {
        id: 'm2',
        sender: 'org',
        orgName: 'eThekwini Parks, Recreation & Culture',
        text: 'Branch cleared and chipped by tree pruning team.',
        time: '14 Aug',
        day: 'August 14'
      }
    ]
  }
];

export const reportsStore = createStore({
  reports: JSON.parse(JSON.stringify(SEED_REPORTS)),
  isLoading: false,
  error: null
});

/**
 * Get all reports from store
 */
export function getAllReports() {
  return reportsStore.get().reports;
}

export function replaceReports(reports) {
  reportsStore.update((state) => ({
    ...state,
    reports: [...reports],
    isLoading: false,
    error: null
  }));
}

/**
 * Find report by ID or referenceNumber
 */
export function getReportById(idOrRef) {
  if (!idOrRef) return null;
  const list = reportsStore.get().reports;
  return list.find(r => r.id === idOrRef || r.referenceNumber === idOrRef) || null;
}

/**
 * Filter counts for All, Active, Resolved, Escalated
 * In the mockup:
 * All: 6
 * Active: 3 (Review + In progress)
 * Resolved: 2
 * Escalated: 1
 * Withdrawn & Queued: visible only under All
 */
export function getReportCounts() {
  const list = reportsStore.get().reports;
  return {
    all: list.length,
    active: list.filter(r => r.status === 'review' || r.status === 'in_progress' || r.status === 'open' || r.status === 'under_review').length,
    resolved: list.filter(r => r.status === 'resolved').length,
    escalated: list.filter(r => r.status === 'escalated').length
  };
}

/**
 * Add a message to a report's thread
 */
export function addReportMessage(reportId, text, sender = 'resident') {
  if (!text || !text.trim()) return null;
  const rep = getReportById(reportId);
  if (!rep) return null;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayStr = now.toLocaleDateString([], { weekday: 'long' });

  const newMsg = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sender,
    orgName: sender === 'org' ? rep.organisation?.name || 'Organisation' : undefined,
    text: text.trim(),
    time: timeStr,
    day: dayStr
  };

  reportsStore.update(s => ({
    ...s,
    reports: s.reports.map(r => {
      if (r.id === rep.id) {
        return {
          ...r,
          messages: [...(r.messages || []), newMsg],
          lastUpdatedAt: now.toISOString(),
          displayTime: timeStr
        };
      }
      return r;
    })
  }));

  return newMsg;
}

/**
 * Add information to report (Screen G submission)
 */
export function addInformationToReport(reportId, details, evidence = []) {
  const rep = getReportById(reportId);
  if (!rep) return null;

  const text = details ? details.trim() : (evidence.length ? `[Attached evidence: ${evidence.join(', ')}]` : '');
  const msg = addReportMessage(reportId, text, 'resident');

  return msg;
}

/**
 * Escalate report (Screen E Escalate action)
 */
export function escalateReportById(reportId, reason = 'Escalated by resident') {
  const rep = getReportById(reportId);
  if (!rep) return null;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  reportsStore.update(s => ({
    ...s,
    reports: s.reports.map(r => {
      if (r.id === rep.id) {
        // Insert escalated timeline step after current or at current
        const newTimeline = [...(r.timeline || [])];
        const hasEscalatedStep = newTimeline.some(step => step.step === 'escalated');
        if (!hasEscalatedStep) {
          const idx = newTimeline.findIndex(step => step.status === 'current');
          const insertIdx = idx >= 0 ? idx + 1 : newTimeline.length - 1;
          newTimeline.splice(insertIdx, 0, {
            step: 'escalated',
            label: 'Escalated',
            at: `Today, ${timeStr}`,
            status: 'current'
          });
        }
        return {
          ...r,
          status: 'escalated',
          timeline: newTimeline,
          lastUpdatedAt: now.toISOString()
        };
      }
      return r;
    })
  }));

  return getReportById(reportId);
}

/**
 * Withdraw report (Screen H confirm action)
 */
export function withdrawReportById(reportId, reason = 'Resident requested withdrawal') {
  const rep = getReportById(reportId);
  if (!rep) return null;

  const now = new Date();

  reportsStore.update(s => ({
    ...s,
    reports: s.reports.map(r => {
      if (r.id === rep.id) {
        return {
          ...r,
          status: 'withdrawn',
          withdrawalReason: reason,
          lastUpdatedAt: now.toISOString()
        };
      }
      return r;
    })
  }));

  return getReportById(reportId);
}

/**
 * Record satisfaction on Resolved report (Screen I Close-the-loop)
 */
export function setReportSatisfaction(reportId, satisfied) {
  const rep = getReportById(reportId);
  if (!rep) return null;

  reportsStore.update(s => ({
    ...s,
    reports: s.reports.map(r => {
      if (r.id === rep.id) {
        return {
          ...r,
          satisfaction: Boolean(satisfied)
        };
      }
      return r;
    })
  }));

  return getReportById(reportId);
}

/**
 * Reopen report from dispute (Screen J)
 */
export function reopenReportById(reportId, reason) {
  const rep = getReportById(reportId);
  if (!rep) return null;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  reportsStore.update(s => ({
    ...s,
    reports: s.reports.map(r => {
      if (r.id === rep.id) {
        const newTimeline = [...(r.timeline || [])];
        newTimeline.push({
          step: 'escalated',
          label: 'Reopened & Escalated',
          at: `Today, ${timeStr}`,
          status: 'current'
        });
        return {
          ...r,
          status: 'escalated',
          satisfaction: false,
          timeline: newTimeline,
          lastUpdatedAt: now.toISOString()
        };
      }
      return r;
    })
  }));

  if (reason && reason.trim()) {
    addReportMessage(reportId, `[Dispute / Reopened]: ${reason.trim()}`, 'resident');
  }

  return getReportById(reportId);
}

/**
 * Mark all messages read on report
 */
export function markReportAsRead(reportId) {
  const rep = getReportById(reportId);
  if (!rep || rep.unreadCount === 0) return;

  reportsStore.update(s => ({
    ...s,
    reports: s.reports.map(r => {
      if (r.id === rep.id) {
        return { ...r, unreadCount: 0 };
      }
      return r;
    })
  }));
}

/**
 * Add a queued offline report
 */
export function addQueuedReport(rep) {
  const now = new Date();
  const queuedReport = {
    id: `queued-${Date.now()}`,
    referenceNumber: 'QUEUED',
    title: rep.title || 'Civic report',
    category: rep.category || 'General',
    location: rep.address || rep.location || 'Local area',
    status: 'queued',
    displayTime: 'Just now',
    lastUpdatedAt: now.toISOString(),
    description: rep.description || '',
    organisation: { id: 'pending', name: 'Pending dispatch' },
    unreadCount: 0,
    satisfaction: null,
    timeline: [
      { step: 'submitted', label: 'Queued on device', at: 'Now', status: 'current' }
    ],
    messages: [
      { id: 'm1', sender: 'resident', text: rep.description || '', time: 'Now', day: 'Today' }
    ]
  };

  reportsStore.update(s => ({
    ...s,
    reports: [queuedReport, ...s.reports]
  }));

  return queuedReport;
}
