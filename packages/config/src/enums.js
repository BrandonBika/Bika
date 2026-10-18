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
  ROADS:                  'roads',
  WATER:                  'water',
  ELECTRICITY:            'electricity',
  WASTE:                  'waste',
  PARKS:                  'parks',
  SAFETY:                 'safety',
  HEALTH:                 'health',
  OTHER:                  'other',
  MEDICAL:                'medical',
  FIRE:                   'fire',
  CRIME_SAFETY:           'crime_safety',
  ROAD_ACCIDENT:          'road_accident',
  FLOODING:               'flooding',
  GENDER_BASED_VIOLENCE:   'gender_based_violence',
});

export const ReportCategoryDefinitions = /** @type {const} */ ([
  { value: ReportCategory.ROADS, label: 'Roads', definition: 'Road damage, potholes, obstruction, or other non-collision road infrastructure issues.' },
  { value: ReportCategory.WATER, label: 'Water', definition: 'Water supply, leaks, sanitation, or water infrastructure issues not primarily involving flooding.' },
  { value: ReportCategory.ELECTRICITY, label: 'Electricity', definition: 'Power outages, electrical faults, or damaged electrical infrastructure.' },
  { value: ReportCategory.WASTE, label: 'Waste', definition: 'Missed refuse collection, illegal dumping, or other waste services issues.' },
  { value: ReportCategory.PARKS, label: 'Parks', definition: 'Park facilities, public open spaces, trees, or recreational infrastructure issues.' },
  { value: ReportCategory.SAFETY, label: 'Safety', definition: 'A public safety threat not more specifically described by crime, fire, medical, or gender-based violence.' },
  { value: ReportCategory.HEALTH, label: 'Health', definition: 'Non-urgent public health or community health service issues.' },
  { value: ReportCategory.OTHER, label: 'Other', definition: 'A report that does not fit any other listed category.' },
  { value: ReportCategory.MEDICAL, label: 'Medical emergency', definition: 'A person is injured, seriously ill, unconscious, or needs urgent medical assistance.' },
  { value: ReportCategory.FIRE, label: 'Fire', definition: 'An active fire, smoke, or immediate fire hazard requiring a fire response.' },
  { value: ReportCategory.CRIME_SAFETY, label: 'Crime or safety emergency', definition: 'A crime in progress, violence, break-in, immediate threat, or urgent safety danger.' },
  { value: ReportCategory.ROAD_ACCIDENT, label: 'Road accident', definition: 'A vehicle collision or road incident with danger, injury, or an urgent response need.' },
  { value: ReportCategory.FLOODING, label: 'Flooding', definition: 'Flood water, inundation, or dangerous water accumulation threatening people or property.' },
  { value: ReportCategory.GENDER_BASED_VIOLENCE, label: 'Gender-based violence', definition: 'Gender-based, domestic, or sexual violence, including an immediate threat or ongoing incident.' },
]);

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
  CRIME:    ReportCategory.CRIME_SAFETY,
  FIRE:     ReportCategory.FIRE,
  SICKNESS: ReportCategory.MEDICAL,
  GBV:      ReportCategory.GENDER_BASED_VIOLENCE,
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
