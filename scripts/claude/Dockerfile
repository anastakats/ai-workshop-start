# The container scripts/claude-docker.sh runs `claude -p` in: Claude Code, nothing else.
FROM node:24-slim
ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" && npm cache clean --force
USER node
WORKDIR /home/node
