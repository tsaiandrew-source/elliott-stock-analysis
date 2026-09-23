# Digest news-source registry

The canonical discovery list is [`news-sources.json`](news-sources.json). It tells the digest producer which publications, official feeds, company newsrooms, and executive-authored sources to scan. Citations for a particular edition remain attached to that digest in `digests.json`.

## Add a source

Add one object to `sources` with:

- a unique lowercase `id`;
- the display `name`;
- `kind`: `primary`, `primary-data`, `primary-pattern`, `wire`, `news`, or `market-context`;
- `priority`: `1` for required/high-signal, `2` for standard, or `3` for supplemental;
- `enabled: true`;
- a safe HTTPS `homeUrl`;
- one or more exact `domains`;
- relevant `topics`;
- optional `notes` describing limits or special scan timing.

Example:

```json
{
  "id": "example-publication",
  "name": "Example Publication",
  "kind": "news",
  "priority": 2,
  "enabled": true,
  "homeUrl": "https://example.com/markets",
  "domains": ["example.com"],
  "topics": ["markets", "technology"],
  "notes": "Optional handling guidance."
}
```

To pause a source without deleting its history, change `enabled` to `false`. Adding a source expands discovery only: it does not make every story trustworthy or require it to appear in a digest.

## Editorial rule

Primary evidence establishes what happened. Independent reporting establishes market reaction and provides context. Forums, social reposts, and unattributed aggregators may be discovery leads, but never sole evidence for a material claim.
