/** @file packages/config/src/index.js */
export { ReportStatus, ReportCategory, ReportCategoryDefinitions, UserRole, ContactChannel, LifelinePreset, BeaconSessionEndReason, MediaType } from './enums.js';
export { Limits } from './limits.js';
export { SA_PHONE, EMAIL, REFERENCE_NUMBER, UNSAFE_SCHEME, isValidSAPhone, isValidEmail } from './regex.js';
