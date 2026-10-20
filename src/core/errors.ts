/** A failure explained to the user: the CLI prints the message and exits with code 1. */
export class AtlasError extends Error {}

/** GitHub cannot answer at all: offline, the rate limit, a rejected token. Asking again does not help. */
export class GitHubUnavailable extends AtlasError {}

/** A repository without a single commit: GitHub has no tree to answer. */
export class EmptyRepository extends AtlasError {}
