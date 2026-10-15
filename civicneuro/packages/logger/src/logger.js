/**
 * @file packages/logger/src/logger.js
 * @description Redacting logger. Never logs PII.
 * All log calls go through redactDeep before outputting.
 * In production, structured JSON; in development, coloured console.
 */

import { redactDeep, redactString } from '../../security-web/src/redact.js';

/** @typedef {'debug'|'info'|'warn'|'error'} LogLevel */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

/** Current minimum log level — set by config */
let _minLevel = /** @type {LogLevel} */ ('info');

/** Whether to emit JSON (production) or formatted (development) */
let _json = false;

/**
 * @param {LogLevel} level
 * @param {string} message
 * @param {unknown} [context]
 */
function emit(level, message, context) {
  if (LEVELS[level] < LEVELS[_minLevel]) return;

  const safeMsg = redactString(String(message));
  const safeCtx = context !== undefined ? redactDeep(context) : undefined;

  if (_json) {
    const entry = {
      level,
      time: new Date().toISOString(),
      msg: safeMsg,
      ...(safeCtx !== undefined ? { ctx: safeCtx } : {}),
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
    return;
  }

  const prefix = `[${level.toUpperCase()}]`;
  if (safeCtx !== undefined) {
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      prefix, safeMsg, safeCtx
    );
  } else {
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      prefix, safeMsg
    );
  }
}

export const logger = {
  /** @param {string} msg @param {unknown} [ctx] */
  debug: (msg, ctx) => emit('debug', msg, ctx),
  /** @param {string} msg @param {unknown} [ctx] */
  info:  (msg, ctx) => emit('info',  msg, ctx),
  /** @param {string} msg @param {unknown} [ctx] */
  warn:  (msg, ctx) => emit('warn',  msg, ctx),
  /** @param {string} msg @param {unknown} [ctx] */
  error: (msg, ctx) => emit('error', msg, ctx),

  /** @param {{ level?: LogLevel, json?: boolean }} opts */
  configure({ level = 'info', json = false } = {}) {
    _minLevel = level;
    _json = json;
  },
};
