/**
 * @file packages/functions-client/src/invoke.js
 * Invokes Edge Functions with Mock Adapter support and in-memory auth tokens.
 */
import { FunctionError } from './errors.js';
import { withRetry } from './retry.js';

let mockEnabled = true;
let authTokenGetter = () => null;
let supabaseUrl = '';
let supabaseAnonKey = '';

export function configureFunctionsClient(opts) {
  if (opts.useMock !== undefined) mockEnabled = opts.useMock;
  if (opts.getAuthToken) authTokenGetter = opts.getAuthToken;
  if (opts.supabaseUrl !== undefined) supabaseUrl = opts.supabaseUrl.replace(/\/+$/, '');
  if (opts.supabaseAnonKey !== undefined) supabaseAnonKey = opts.supabaseAnonKey;
}

// In-memory mock database for realistic resident app interaction
const mockDb = {
  reports: [
    {
      id: 'rep-001',
      referenceNumber: 'CN-2026-0042',
      title: 'Pothole on Main Road',
      description: 'Deep pothole causing vehicle damage near the intersection.',
      category: 'roads',
      status: 'in_progress',
      latitude: -29.8587,
      longitude: 31.0218,
      address: '124 Main Rd, Durban Central',
      createdAt: '2026-10-01T10:00:00Z',
      updates: [
        { id: 'u1', text: 'Report received and assigned to Roads Dep.', timestamp: '2026-10-01T10:15:00Z', author: 'System' },
        { id: 'u2', text: 'Road repair team scheduled for 2026-10-10.', timestamp: '2026-10-03T14:30:00Z', author: 'eThekwini Roads' }
      ]
    },
    {
      id: 'rep-002',
      referenceNumber: 'CN-2026-0089',
      title: 'Streetlight out on 7th Ave',
      description: 'Multiple streetlights dark creating unsafe conditions.',
      category: 'electricity',
      status: 'open',
      latitude: -29.8601,
      longitude: 31.0250,
      address: '7th Avenue, Morningside',
      createdAt: '2026-10-05T18:20:00Z',
      updates: [
        { id: 'u3', text: 'Report received.', timestamp: '2026-10-05T18:25:00Z', author: 'System' }
      ]
    }
  ],
  polls: [
    {
      id: 'poll-1',
      title: 'Community Park Upgrade Priority',
      description: 'Vote on which facility upgrade should be prioritized for the 2027 municipal budget.',
      options: [
        { id: 'opt-1', text: 'Children playground equipment', votes: 142 },
        { id: 'opt-2', text: 'Solar lighting & security perimeter', votes: 318 },
        { id: 'opt-3', text: 'Outdoor gym & jogging track', votes: 95 }
      ],
      totalVotes: 555,
      hasVoted: false
    }
  ],
  surveys: [
    {
      id: 'surv-1',
      title: 'Water Supply Reliability Survey',
      description: 'Help the ward committee assess water outage frequencies.',
      questions: [
        { id: 'q1', type: 'choice', text: 'How often do you experience water pressure drops?', options: ['Daily', 'Weekly', 'Rarely', 'Never'] },
        { id: 'q2', type: 'text', text: 'Any specific areas or times affected?' }
      ]
    }
  ],
  news: [
    {
      id: 'news-1',
      title: 'Planned Water Maintenance: Durban North Ward 110',
      snippet: 'eThekwini Water and Sanitation maintenance scheduled for Oct 15th from 08:00 to 17:00.',
      body: 'Please store sufficient water for consumption. Water tankers will be stationed at Kensington Square and Broadway.',
      publishedAt: '2026-10-08T08:00:00Z',
      category: 'maintenance'
    },
    {
      id: 'news-2',
      title: 'Community Safety Meeting: CPF Update',
      snippet: 'Monthly sector CPF meeting scheduled for Tuesday 19:00 at City Hall.',
      body: 'All residents and neighbourhood watch coordinators are encouraged to attend.',
      publishedAt: '2026-10-07T14:00:00Z',
      category: 'safety'
    }
  ],
  lifelineCards: [
    { id: 'l1', name: 'Crime', icon: 'police', color: '#E6F1FB', isPreset: true, members: [{ id: 'l1-m1', name: 'SAPS', phone: '10111', isPreset: true }] },
    { id: 'l2', name: 'Fire', icon: 'fire', color: '#FBE4D3', isPreset: true, members: [{ id: 'l2-m1', name: 'Fire Dept', phone: '0313610000', isPreset: true }] },
    { id: 'l3', name: 'Sickness', icon: 'ambulance', color: '#E1F5EE', isPreset: true, members: [{ id: 'l3-m1', name: 'Ambulance', phone: '10177', isPreset: true }] },
    { id: 'l4', name: 'GBV', icon: 'gbv', color: '#EEE8F8', isPreset: true, members: [{ id: 'l4-m1', name: 'GBV Command Centre', phone: '0800428428', isPreset: true }] }
  ],
  circleMembers: [
    { id: 'c1', name: 'Sipho Ndlovu', phone: '+27821112233', status: 'accepted', isSharing: false },
    { id: 'c2', name: 'Thandi Khumalo', phone: '+27834445566', status: 'accepted', isSharing: true, lastLocation: { lat: -29.855, lng: 31.02, updatedAt: '2026-10-09T01:50:00Z' } }
  ],
  beaconRequests: []
};

async function handleMock(endpoint, payload) {
  await new Promise((r) => setTimeout(r, 120)); // realistic network latency
  switch (endpoint) {
    case 'auth-sign-in':
    case 'auth-register':
    case 'auth-verify-email':
    case 'auth-forgot-password':
    case 'auth-reset-password':
      throw new FunctionError(
        'LIVE_AUTH_REQUIRED',
        'Authentication requires the configured Supabase project. Mock credentials are not accepted.',
        501
      );

    case 'report-submit':
    case 'report-guest-submit': {
      const newRep = {
        id: `rep-${Date.now()}`,
        referenceNumber: `CN-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        title: payload.title || 'Resident Civic Report',
        description: payload.description,
        category: payload.category,
        status: 'open',
        latitude: payload.latitude,
        longitude: payload.longitude,
        address: payload.address || 'Address provided',
        createdAt: new Date().toISOString(),
        updates: [{ id: 'u-init', text: 'Report submitted successfully.', timestamp: new Date().toISOString(), author: 'System' }]
      };
      mockDb.reports.unshift(newRep);
      return newRep;
    }

    case 'report-list-mine':
      return { reports: mockDb.reports };

    case 'report-track':
    case 'report-get': {
      const rep = mockDb.reports.find(r => r.referenceNumber === payload.referenceNumber || r.id === payload.id);
      if (!rep) throw new FunctionError('NOT_FOUND', 'Report not found with the provided reference number', 404);
      return rep;
    }

    case 'polls-list':
      return { polls: mockDb.polls };

    case 'polls-vote': {
      const poll = mockDb.polls.find(p => p.id === payload.pollId);
      if (poll) {
        const opt = poll.options.find(o => o.id === payload.optionId);
        if (opt) opt.votes++;
        poll.totalVotes++;
        poll.hasVoted = true;
      }
      return { success: true, poll };
    }

    case 'surveys-list':
      return { surveys: mockDb.surveys };

    case 'surveys-submit':
      return { success: true, reference: 'SURV-SUB-9988' };

    case 'news-list':
      return { news: mockDb.news };

    case 'lifeline-cards':
      return { cards: mockDb.lifelineCards };

    case 'lifeline-card-save': {
      const card = payload.card || {};
      const members = Array.isArray(card.members) ? card.members : [];
      if (members.length > 4) {
        throw new FunctionError('LIFELINE_MEMBER_LIMIT', 'A Lifeline group can have at most 4 members', 400);
      }
      if (!card.name?.trim() || members.length === 0) {
        throw new FunctionError('INVALID_LIFELINE_GROUP', 'A group name and at least one member are required', 400);
      }

      const index = mockDb.lifelineCards.findIndex((existing) => existing.id === card.id);
      const saved = {
        ...(index >= 0 ? mockDb.lifelineCards[index] : {}),
        ...card,
        id: card.id || `lifeline-${Date.now()}`,
        name: card.name.trim(),
        members: members.map((member) => ({ ...member }))
      };
      if (index >= 0) mockDb.lifelineCards[index] = saved;
      else mockDb.lifelineCards.push(saved);
      return { card: saved };
    }

    case 'lifeline-group-call': {
      const card = mockDb.lifelineCards.find((group) => group.id === payload.groupId);
      if (!card) throw new FunctionError('LIFELINE_GROUP_NOT_FOUND', 'Lifeline group not found', 404);
      return {
        callId: `lifeline-call-${Date.now()}`,
        groupId: card.id,
        groupName: card.name,
        members: card.members.map((member) => ({ ...member, status: 'ringing' }))
      };
    }

    case 'beacon-members':
      return { members: mockDb.circleMembers };

    case 'beacon-requests':
      return { requests: mockDb.beaconRequests };

    case 'beacon-send-request': {
      const contact = payload.contact || {};
      if (!contact.phone) {
        throw new FunctionError('INVALID_CONTACT', 'A phone number is required to send a Beacon request', 400);
      }
      const existing = mockDb.beaconRequests.find((request) => request.phone === contact.phone);
      if (existing) return { request: existing, duplicate: true };
      const request = {
        id: `beacon-request-${Date.now()}`,
        name: contact.name || 'Resident',
        phone: contact.phone,
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      mockDb.beaconRequests.push(request);
      return { request, duplicate: false };
    }

    case 'beacon-route': {
      if (payload.operation === 'search') {
        const query = String(payload.query || '').trim();
        if (query.length < 2) return { places: [] };
        const origin = payload.origin || { lat: -29.8587, lng: 31.0218 };
        return {
          places: [
            { id: 'mock-place-1', name: `${query} · nearby`, lat: origin.lat + 0.008, lng: origin.lng + 0.006 },
            { id: 'mock-place-2', name: `${query} · city centre`, lat: origin.lat - 0.006, lng: origin.lng + 0.009 }
          ],
          mock: true
        };
      }
      if (payload.operation === 'route') {
        const { origin, destination } = payload;
        if (!origin || !destination) {
          throw new FunctionError('INVALID_ROUTE', 'A starting point and destination are required', 400);
        }
        const coordinates = Array.from({ length: 21 }, (_, index) => {
          const progress = index / 20;
          const bend = Math.sin(progress * Math.PI) * 0.001;
          return [
            origin.lat + (destination.lat - origin.lat) * progress + bend,
            origin.lng + (destination.lng - origin.lng) * progress
          ];
        });
        const distanceMeters = Math.round(
          Math.hypot((destination.lat - origin.lat) * 111320, (destination.lng - origin.lng) * 80000) * 1.2
        );
        return {
          coordinates,
          distanceMeters,
          durationSeconds: Math.round((distanceMeters / 4500) * 3600),
          mock: true
        };
      }
      throw new FunctionError('INVALID_ROUTE_OPERATION', 'Choose a place search or route request', 400);
    }

    case 'snap-transcribe':
      return { text: 'Water pipe leak flooding the driveway near 14 Acacia Road.' };

    case 'snap-analyze':
      return {
        category: 'water_sanitation',
        description: payload.text || 'Water pipe leak flooding the driveway',
        urgency: 'high',
        keywords: ['water', 'pipe', 'leak', 'flooding'],
        followUpQuestion: 'Is the water clean drinking water or sewage?',
        isEmergency: false
      };

    default:
      return { success: true };
  }
}

export async function invokeFunction(endpoint, payload = {}) {
  if (mockEnabled) {
    return handleMock(endpoint, payload);
  }

  return withRetry(async () => {
    const token = authTokenGetter();
    let requestBody = payload;
    let isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    if (!isFormData && typeof FormData !== 'undefined' && typeof Blob !== 'undefined' &&
        payload && typeof payload === 'object') {
      const hasFiles = Object.values(payload).some((value) => value instanceof Blob);
      if (hasFiles) {
        requestBody = new FormData();
        for (const [key, value] of Object.entries(payload)) {
          if (value === undefined || value === null) continue;
          if (value instanceof Blob) {
            const filename = typeof File !== 'undefined' && value instanceof File
              ? value.name
              : `${key}.bin`;
            requestBody.append(key, value, filename);
          } else if (typeof value === 'object') {
            requestBody.append(key, JSON.stringify(value));
          } else {
            requestBody.append(key, String(value));
          }
        }
        isFormData = true;
      }
    }
    const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
    if (supabaseAnonKey) {
      headers.apikey = supabaseAnonKey;
      headers.Authorization = `Bearer ${token || supabaseAnonKey}`;
    } else if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const functionUrl = supabaseUrl
      ? `${supabaseUrl}/functions/v1/${endpoint}`
      : `/functions/v1/${endpoint}`;
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers,
      body: isFormData ? requestBody : JSON.stringify(requestBody)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new FunctionError(data.code || 'UNKNOWN_ERROR', data.message || 'Server error', res.status, data.details);
    }
    return data;
  });
}
