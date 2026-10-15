#!/usr/bin/env node
import fs from 'fs';

const addition = `
# ── Step 0 additions: resident-pwa v7 flow map extensions ──────────────────

# New pages in apps/resident-pwa/src/pages/
  apps/
    resident-pwa/
      src/
        pages/
          report-submitted/         # [PAGE]
          survey/                   # [PAGE]
          survey-submitted/         # [PAGE]
          trending-issues/          # [PAGE]
          safety-info/              # [PAGE]
          contacts/                 # [PAGE]
          language/                 # [PAGE]
          terms/                    # [PAGE]
          badges-edit/              # [PAGE]
          lifeline-card-create/     # [PAGE]
          lifeline-contacts-picker/ # [PAGE]
          lifeline-calling-status/  # [PAGE]
          beacon-chat/              # [PAGE]
          beacon-find-contacts/     # [PAGE]

        components/
          bottom-sheet/             # [WC]
          confirm-dialog/           # [WC]
          permission-prompt/        # [WC]
          camera-capture/           # [WC]
          live-map/                 # [WC]
          lifeline-card/            # [WC]
          circle-member-row/        # [WC]
          transcript-view/          # [WC]
          empty-state/              # [WC]
          error-state/              # [WC]
          skeleton/                 # [WC]
          progress-bar/             # [WC]

        features/
          surveys/
            surveys.client.js
          polls/
            polls.client.js
          news/
            news.client.js
          account/
            account.client.js
          permissions/
            permissions.js
          i18n/
            language.js
`;

fs.appendFileSync(
  'civicneuro/docs/architecture/target-tree.txt',
  addition,
  'utf8'
);
console.log('target-tree.txt updated');
