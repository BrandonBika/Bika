/**
 * @file packages/config/src/limits.js
 * @description Client-side enforced limits. Server re-validates everything.
 */

export const Limits = /** @type {const} */ ({
  /** Max image size in bytes before compression (10 MB) */
  IMAGE_MAX_BYTES_RAW:    10 * 1024 * 1024,
  /** Max image size after compression (2 MB) */
  IMAGE_MAX_BYTES:         2 * 1024 * 1024,
  /** Max video duration in seconds */
  VIDEO_MAX_SECONDS:       60,
  /** Max video size after compression (20 MB) */
  VIDEO_MAX_BYTES:        20 * 1024 * 1024,
  /** Max audio recording in seconds (Snap & Say) */
  AUDIO_MAX_SECONDS:       90,
  /** Max audio size (4 MB) */
  AUDIO_MAX_BYTES:         4 * 1024 * 1024,
  /** Max images per report */
  REPORT_MAX_MEDIA:         5,
  /** Max description length */
  REPORT_DESC_MAX:       2000,
  /** Min description length */
  REPORT_DESC_MIN:         10,
  /** Beacon session max duration in seconds (4 hours) */
  BEACON_SESSION_MAX_S: 4 * 3600,
  /** Lifeline countdown window in milliseconds */
  LIFELINE_COUNTDOWN_MS:  3000,
  /** Snap & Say max follow-up questions */
  SNAP_MAX_FOLLOWUP:        1,
  /** Reference number display length */
  REFERENCE_LENGTH:        12,
  /** Offline queue max pending items */
  QUEUE_MAX_PENDING:       50,
  /** Signed URL TTL default (seconds) — server controls real value */
  SIGNED_URL_TTL_DEFAULT:  300,
  /** Beacon exact-match search min length */
  BEACON_SEARCH_MIN_LEN:    3,
  /** KML max vertices */
  KML_MAX_VERTICES:      5000,
});
