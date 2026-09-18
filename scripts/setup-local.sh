#!/usr/bin/env bash
set -euo pipefail
pnpm install
pnpm db:migrate
if [ ! -x apps/analytics/.venv/bin/python ]; then python3 -m venv apps/analytics/.venv; fi
apps/analytics/.venv/bin/python -m pip install -r apps/analytics/requirements.lock.txt
printf '%s\n' 'Local setup complete. Run pnpm dev or pnpm build && pnpm start.'
