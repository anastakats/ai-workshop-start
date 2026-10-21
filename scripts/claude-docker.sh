#!/bin/sh
# claude-docker.sh: `claude -p` in an isolated Docker container, the model through JetBrains Central.
# The prompt on stdin, the answer on stdout; SKILL_ATLAS_MODEL, the model, haiku by default.
# The container: no files of the host, no tools for the model, nothing kept; only the network, to Central.
set -eu
IMAGE=skill-atlas-claude

CENTRAL="$(command -v central || command -v jbcentral)" || {
  echo 'JetBrains Central is not installed: no central or jbcentral on PATH' >&2
  exit 1
}
# Its port: proxy_port in its config, 19516 without one.
PORT="$(node -e 'try { console.log(require(process.argv[1]).proxy_port ?? 19516) } catch { console.log(19516) }' "$HOME/.jetbrains-central/config.json")"
KEY="$("$CENTRAL" proxy start --ensure-updated --return-key)"

# The image, once: scripts/claude/Dockerfile.
docker image inspect "$IMAGE" > /dev/null 2>&1 || docker build -q -t "$IMAGE" "$(dirname "$0")/claude" >&2

exec docker run --rm -i \
  --add-host=host.docker.internal:host-gateway \
  --read-only --tmpfs /tmp --tmpfs /home/node \
  --cap-drop ALL --security-opt no-new-privileges \
  -e "ANTHROPIC_API_KEY=$KEY" \
  -e "ANTHROPIC_BASE_URL=http://host.docker.internal:${PORT}/wire/${KEY}/claude-code/anthropic" \
  "$IMAGE" \
  claude -p --bare --model "${SKILL_ATLAS_MODEL:-haiku}" --tools '' --no-session-persistence
