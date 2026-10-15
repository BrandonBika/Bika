#!/usr/bin/env node
/**
 * Step 0: Extend resident-pwa structure for flow map v7
 * Creates new pages, components, and feature files as empty scaffolds.
 */
import fs from 'fs';
import path from 'path';

const BASE = 'civicneuro/apps/resident-pwa/src';

// New pages (each gets: <name>.html, <name>.js, <name>.css)
const newPages = [
  'report-submitted',
  'survey',
  'survey-submitted',
  'trending-issues',
  'safety-info',
  'contacts',
  'language',
  'terms',
  'badges-edit',
  'lifeline-card-create',
  'lifeline-contacts-picker',
  'lifeline-calling-status',
  'beacon-chat',
  'beacon-find-contacts',
];

// New components (each gets: <name>.js, <name>.css)
const newComponents = [
  'bottom-sheet',
  'confirm-dialog',
  'permission-prompt',
  'camera-capture',
  'live-map',
  'lifeline-card',
  'circle-member-row',
  'transcript-view',
  'empty-state',
  'error-state',
  'skeleton',
  'progress-bar',
];

// New feature files (full relative path from BASE)
const newFeatureFiles = [
  'features/surveys/surveys.client.js',
  'features/polls/polls.client.js',
  'features/news/news.client.js',
  'features/account/account.client.js',
  'features/permissions/permissions.js',
  'features/i18n/language.js',
];

let created = 0;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function touch(filePath) {
  ensureDir(path.dirname(filePath));
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf8');
    created++;
    console.log('  CREATE', filePath);
  } else {
    console.log('  SKIP (exists)', filePath);
  }
}

console.log('\n=== Step 0: Extending resident-pwa structure ===\n');

console.log('-- New pages --');
for (const page of newPages) {
  const dir = path.join(BASE, 'pages', page);
  touch(path.join(dir, `${page}.html`));
  touch(path.join(dir, `${page}.js`));
  touch(path.join(dir, `${page}.css`));
}

console.log('\n-- New components --');
for (const comp of newComponents) {
  const dir = path.join(BASE, 'components', comp);
  touch(path.join(dir, `${comp}.js`));
  touch(path.join(dir, `${comp}.css`));
}

console.log('\n-- New feature files --');
for (const feat of newFeatureFiles) {
  touch(path.join(BASE, feat));
}

console.log(`\nDone. Created ${created} new files.`);
