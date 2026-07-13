# Legacy cache isolation incident — 2026-07-13

## Summary

The rejected Task 9 implementation was commit `3b65eac3befb6ee7b3aa460bc1ff940027830a3e`. It created a temporary `node_modules` symlink that reused the original legacy checkout dependency tree. During that rejected run, the ignored build-cache files `node_modules/.tmp/tsconfig.app.tsbuildinfo` and `node_modules/.tmp/tsconfig.node.tsbuildinfo` may have been refreshed.

The original tracked HEAD remained `eebf00b7ddfbbe6f01ff598e57f1e17197068a37`, and the tracked tree remained `3e527de876cfeccfd3154ddc492830d71c4cfd9a`. No tracked legacy source change was observed. Impact is limited to ignored TypeScript build-cache metadata.

Rejected fixtures, if any, are unusable. Task 10 must regenerate the observable legacy traces only after the replacement Task 9 extractor passes a fresh high-risk review.

## Remediation

The replacement extractor uses physical dependency and cache isolation: a detached temporary legacy worktree receives its own physical `node_modules`, npm cache, build cache, home, and temporary directory. It fingerprints both declared ignored paths before the first child process and again after cleanup using no-follow `lstat`, file type, size, `mtimeMs`, and streamed SHA-256 for regular files.

Git, Node, npm CLI, and `sandbox-exec` are invoked only through trusted absolute paths and an exact allowlisted child environment. Each run creates distinct physical empty `npm-user-config` and `npm-global-config` files beneath its validated isolated root, revalidates both files and their parents immediately before npm, and leaves npm argv unchanged. The frozen manifest records only the stable isolated-empty-file policy, never either random path. The complete patched legacy suite must pass before the separate extraction-only test runs with macOS network access denied. Raw output is bound exactly to the ordered copied seeds before trace normalization. Publication uses a same-parent exclusive lock, unique staging and backup paths, immediate no-follow revalidation, atomic rename, rollback, and worktree removal plus prune on every exit path.

## Supported threat boundary

The supported boundary is a non-privileged local authoring run on the declared macOS host. The extractor rejects symlinks, path replacement detected during immediate revalidation, inherited process configuration, concurrent cooperative extractor runs, and network access during extraction. It does not claim protection from a privileged process or a hostile same-user process that wins a race between the final no-follow/revalidation check and the operating-system filesystem call. Fixture authoring must run without such an adversary.

## Tracked identity verification

The following commands verify the tracked legacy identity and clean tracked/untracked status used for this incident record:

```bash
git -C /Users/ansonhui/Documents/GitHub/ramen-style-today rev-parse HEAD
git -C /Users/ansonhui/Documents/GitHub/ramen-style-today rev-parse 'HEAD^{tree}'
git -C /Users/ansonhui/Documents/GitHub/ramen-style-today status --porcelain
```

Expected HEAD is `eebf00b7ddfbbe6f01ff598e57f1e17197068a37`, expected tree is `3e527de876cfeccfd3154ddc492830d71c4cfd9a`, and status output is empty.

## Ledger handling

This Task 9 remediation does not change `docs/migration/ledger.json` or `docs/migration/ledger.md`. Task 14 records the incident only after exact-SHA acceptance.
