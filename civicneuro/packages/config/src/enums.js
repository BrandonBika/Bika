/**
 * @file packages/config/src/enums.js
 * @description Shared enumeration values. Single source of truth.
 */

export const ReportStatus = /** @type {const} */ ({
  OPEN:        'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED:    'resolved',
  CLOSED:      'closed',
  ESCALATED:   'escalated',
  WITHDRAWN:   'withdrawn',
});

export const ReportCategory = /** @type {const} */ ({
  ROADS:       'roads',
  WATER:       'water',
  ELECTRICITY: 'electricity',
  WASTE:       'waste',
  PARKS:       'parks',
  SAFETY:      'safety',
  HEALTH:      'health',
  OTHER:       'other',
});

export const UserRole = /** @type {const} */ ({
  RESIDENT:          'resident',
  ORG_ADMIN:         'org_admin',
  ORG_EMPLOYEE:      'org_employee',
  PLATFORM_ADMIN:    'platform_admin',
  PLATFORM_EMPLOYEE: 'platform_employee',
});

export const ContactChannel = /** @type {const} */ ({
  SMS:   'sms',
  EMAIL: 'email',
  NONE:  'none',
});

export const LifelinePreset = /** @type {const} */ ({
  CRIME:    'crime',
  FIRE:     'fire',
  SICKNESS: 'sickness',
  GBV:      'gbv',
});

export const BeaconSessionEndReason = /** @type {const} */ ({
  ARRIVAL: 'arrival',
  TIMER:   'timer',
  MANUAL:  'manual',
});

export const MediaType = /** @type {const} */ ({
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
});
