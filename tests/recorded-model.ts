#!/usr/bin/env node
// A model for SKILL_ATLAS_CLAUDE that answers from FIXTURE_CLUSTERS in tests/helpers.ts: the prompt on
// stdin, the answer on stdout, as scripts/claude-docker.sh does; for the demos, without Docker or Central.
import { text } from 'node:stream/consumers';
import { recordedModel } from './helpers.ts';

process.stdout.write(await recordedModel()(await text(process.stdin)));
