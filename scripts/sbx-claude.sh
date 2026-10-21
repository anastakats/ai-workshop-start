#!/bin/sh
# sbx-claude.sh <name>: a worktree and a sandbox, the model through Central
NAME="$1"
[ -d "../$NAME" ] || git worktree add "../$NAME"
 
CENTRAL="$(command -v central || command -v jbcentral)"
PORT="$(jq -r '.proxy_port // 19516' ~/.jetbrains-central/config.json)"
KEY="$("$CENTRAL" proxy start --ensure-updated --return-key)"
 
exec sbx run --name "$NAME" \
  -e "ANTHROPIC_API_KEY=$KEY" \
  -e "ANTHROPIC_BASE_URL=http://host.docker.internal:${PORT}/wire/${KEY}/claude-code/anthropic" \
  claude "../$NAME" .git
