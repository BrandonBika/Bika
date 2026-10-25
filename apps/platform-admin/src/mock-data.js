export const mockData = {
  posts: [
    { id: 'p-1', author: 'Durban Metro', time: 'Today, 09:20', type: 'Alert', body: 'Water interruption reported in the central ward.', metric: '128 views', status: 'Published' },
    { id: 'p-2', author: 'Coastal District', time: 'Yesterday, 14:10', type: 'News', body: 'Community clean-up planned for Saturday.', metric: '64 views', status: 'Draft' }
  ],
  surveys: [
    { id: 's-1', title: 'Ward service priorities', questions: 4, status: 'Active', responses: 42, created: '2026-10-20', results: [42, 27, 16] },
    { id: 's-2', title: 'Community safety check-in', questions: 3, status: 'Draft', responses: 0, created: '2026-10-22', results: [0, 0, 0] }
  ],
  pilotOrganisations: [
    { name: 'Demo Municipality', branches: 3, urgency: 'High', emailDelivery: true, status: 'Pilot' },
    { name: 'Demo District Office', branches: 2, urgency: 'Medium', emailDelivery: false, status: 'Pilot' }
  ],
  activity: [
    { time: '2026-10-25 08:40', actor: 'Platform Admin', action: 'organisation.approved', target: 'Durban Metro' },
    { time: '2026-10-24 16:12', actor: 'Platform Employee', action: 'report.viewed', target: 'CN-2026-000142' },
    { time: '2026-10-24 12:03', actor: 'Platform Admin', action: 'staff.invited', target: 'support@example.test' }
  ],
  conversations: [],
  staff: [
    { name: 'Platform Employee', email: 'employee@example.test', role: 'Platform Employee', status: 'Active' },
    { name: 'Pending invitation', email: 'support@example.test', role: 'Support', status: 'Pending invite' }
  ],
  settings: {
    platformName: 'Bika',
    supportContact: 'support@example.test',
    categories: 'Water, Roads, Waste, Safety',
    twoFactor: true,
    sessionTimeout: 30
  }
};
