# Task 283 — aegean-ops: a narrow sudo whitelist for voice-file operations

CONTEXT CHECK: this is Task 283.

**FILES ONLY.** Nothing was installed, no sudo command was run, `/opt` was
only ever read (to size the pending-clip count for INSTALL-OPS.md), and the
real `/usr/local/sbin/aegean-deploy`/`aegean-ops` were never touched. Three
files created under `deploy/`, verified by copying `aegean-ops` into a
throwaway sandbox with the three path constants and OWNER/GROUP sed-swapped
to a temp dir and the current user — the only way to exercise `install
-o partygame -g partygame` logic without being root — and running every
scenario against fake directories.

## 1 — aegean-ops quoted in full, syntax, lint

```bash
#!/usr/bin/env bash
# aegean-ops — a narrow, root-owned whitelist for the two voice-file moves
# that otherwise need a human's sudo password (Task 280/282). Lives at
# /usr/local/sbin/aegean-ops (root:root 755), invoked passwordlessly by
# argyrios via deploy/aegean-ops.sudoers, which grants NOPASSWD for this
# script's path only — the argument-level restrictions below (exactly two
# verbs, a strict hash-shaped filename, a confirm token, no overwrite) are
# what actually keeps this narrow; sudoers itself can't express them.
#
# Verbs:
#   aegean-ops stage-clips --confirm ARGYRIOS-SAID-GO
#       Copies every *.mp3 in DEV_STAGING whose name matches
#       ^[0-9a-f]{16}\.mp3$ into PROD_STAGING (install -o partygame
#       -g partygame -m 644). A name already present in PROD_STAGING is
#       SKIPPED, not overwritten. Every file is reported on the ledger.
#
#   aegean-ops promote-to-bank <hash> [<hash> ...] --confirm ARGYRIOS-SAID-GO
#       Moves each <hash>.mp3 from PROD_STAGING into PROD_BANK the same
#       way. Validates every hash FIRST: if any target already exists, any
#       source is missing, or any source is a symlink, the whole call is
#       refused and NOTHING is copied — this verb never partially lands.
#
# Both verbs: refuse a symlinked source or target; realpath-contain every
# path inside its expected root before touching it; require --confirm
# ARGYRIOS-SAID-GO as the literal last argument. No eval, no globbing of
# argument-derived strings — every path is built by plain string
# concatenation of a fixed root plus a regex-validated basename.
set -euo pipefail

DEV_STAGING="/home/argyrios/Aegean/client/public/voice-staging"
PROD_STAGING="/opt/party-game/client/public/voice-staging"
PROD_BANK="/opt/party-game/client/public/voice"
OWNER="partygame"
GROUP="partygame"
MODE="644"
CONFIRM_TOKEN="ARGYRIOS-SAID-GO"
HASH_NAME_RE='^[0-9a-f]{16}\.mp3$'

die() {
  echo "REFUSED: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<EOF
usage: aegean-ops stage-clips --confirm $CONFIRM_TOKEN
       aegean-ops promote-to-bank <hash> [<hash> ...] --confirm $CONFIRM_TOKEN
EOF
  exit 2
}

# Requires the confirm token as the literal last two arguments of the
# verb's own argument list: --confirm ARGYRIOS-SAID-GO. Does not consume
# them — callers still see the full "$@".
require_confirm() {
  local n=$#
  if [ "$n" -lt 2 ]; then
    die "missing --confirm $CONFIRM_TOKEN (must be the last argument)"
  fi
  local last_idx=$n
  local prev_idx=$((n - 1))
  local last="${!last_idx}"
  local prev="${!prev_idx}"
  if [ "$prev" != "--confirm" ] || [ "$last" != "$CONFIRM_TOKEN" ]; then
    die "missing or wrong --confirm token (must be the last argument)"
  fi
}

# Resolves $path and refuses it unless it sits inside $root (which must
# already exist). Uses realpath -m so a not-yet-created target filename
# still resolves for the check.
assert_contained() {
  local path="$1" root="$2" label="$3"
  local real_root real_path
  real_root=$(realpath -e "$root") || die "$label root does not exist: $root"
  real_path=$(realpath -m "$path")
  case "$real_path" in
    "$real_root"/*) : ;;
    *) die "$label path escapes its root ($root): $path" ;;
  esac
}

cmd_stage_clips() {
  require_confirm "$@"
  if [ "$#" -ne 2 ]; then
    die "stage-clips takes no arguments besides --confirm $CONFIRM_TOKEN"
  fi

  [ -d "$DEV_STAGING" ] || die "source dir missing: $DEV_STAGING"
  [ -d "$PROD_STAGING" ] || die "target dir missing: $PROD_STAGING"

  local found=0 name base target
  while IFS= read -r -d '' name; do
    found=1
    base="$(basename -- "$name")"

    if ! [[ "$base" =~ $HASH_NAME_RE ]]; then
      echo "REJECTED  $base  (name is not 16 lowercase hex chars + .mp3)"
      continue
    fi

    if [ -L "$name" ]; then
      echo "REJECTED  $base  (source is a symlink: $name)"
      continue
    fi
    assert_contained "$name" "$DEV_STAGING" "source"

    target="$PROD_STAGING/$base"
    assert_contained "$target" "$PROD_STAGING" "target"

    if [ -e "$target" ]; then
      echo "SKIPPED   $base  (already present in $PROD_STAGING)"
      continue
    fi

    install -o "$OWNER" -g "$GROUP" -m "$MODE" -- "$name" "$target"
    echo "STAGED    $base  -> $target"
  done < <(find "$DEV_STAGING" -maxdepth 1 \( -type f -o -type l \) -name '*.mp3' -print0 | sort -z)

  if [ "$found" -eq 0 ]; then
    echo "no .mp3 files found in $DEV_STAGING"
  fi
}

cmd_promote_to_bank() {
  require_confirm "$@"
  local n=$# hash_count
  hash_count=$((n - 2))
  if [ "$hash_count" -lt 1 ]; then
    die "promote-to-bank requires at least one hash, plus --confirm $CONFIRM_TOKEN"
  fi
  local hashes=("${@:1:$hash_count}")

  [ -d "$PROD_STAGING" ] || die "source dir missing: $PROD_STAGING"
  [ -d "$PROD_BANK" ] || die "target dir missing: $PROD_BANK"

  local h base source target problems=0
  for h in "${hashes[@]}"; do
    base="${h}.mp3"

    if ! [[ "$base" =~ $HASH_NAME_RE ]]; then
      echo "REJECTED  $h  (not a bare 16 lowercase hex char hash)" >&2
      problems=$((problems + 1))
      continue
    fi

    source="$PROD_STAGING/$base"
    target="$PROD_BANK/$base"
    assert_contained "$source" "$PROD_STAGING" "source"
    assert_contained "$target" "$PROD_BANK" "target"

    if [ ! -e "$source" ]; then
      echo "MISSING   $base  (not found in $PROD_STAGING)" >&2
      problems=$((problems + 1))
      continue
    fi
    if [ -L "$source" ]; then
      echo "REJECTED  $base  (source is a symlink: $source)" >&2
      problems=$((problems + 1))
      continue
    fi
    if [ -e "$target" ]; then
      echo "EXISTS    $base  (already present in $PROD_BANK, refusing)" >&2
      problems=$((problems + 1))
      continue
    fi
  done

  if [ "$problems" -gt 0 ]; then
    die "$problems problem(s) above, nothing copied"
  fi

  for h in "${hashes[@]}"; do
    base="${h}.mp3"
    source="$PROD_STAGING/$base"
    target="$PROD_BANK/$base"
    install -o "$OWNER" -g "$GROUP" -m "$MODE" -- "$source" "$target"
    echo "PROMOTED  $base  -> $target"
  done
}

main() {
  if [ "$#" -lt 1 ]; then
    usage
  fi
  local verb="$1"
  shift
  case "$verb" in
    stage-clips) cmd_stage_clips "$@" ;;
    promote-to-bank) cmd_promote_to_bank "$@" ;;
    *) usage ;;
  esac
}

main "$@"
```

`bash -n deploy/aegean-ops`: **clean, exit 0** — twice, before and after the
symlink-handling fix described in §2.

`shellcheck`: **unavailable on this machine** — `command -v shellcheck` and
`apt list --installed | grep shellcheck` both empty. Not installed, not run.

## 2 — sandbox proof (fake dirs, no real `/opt` touched)

Method: copied `deploy/aegean-ops` into
`/tmp/.../scratchpad/sandbox283/aegean-ops-sandbox`, `sed`-replacing only
`DEV_STAGING`/`PROD_STAGING`/`PROD_BANK` to three temp subdirectories and
`OWNER`/`GROUP` to `argyrios`/`argyrios` (the shipped script needs root to
chown to `partygame`; the sandbox copy needs to run as plain argyrios). No
other line differs. This caught one real bug along the way: `find -type f`
(no `-L`) never matches a symlink at all, so a first version of the loop
silently skipped a planted symlink instead of rejecting it — fixed by
matching `\( -type f -o -type l \)` and letting the explicit `-L` check
inside the loop reject it, with an inline ledger line rather than the
original hard `die` (which would have aborted the whole batch on one bad
symlink, unlike the “skip and keep going” shape every other stage-clips
outcome uses).

Setup: `dev-staging` held `20af51bc41d29cae.mp3` (valid, new),
`aaaaaaaaaaaaaaaa.mp3` (valid name, mirrored into `prod-staging` already),
`not-a-hash-name.mp3` (bad name), and `dddddddddddddddd.mp3` (a symlink to
a file outside the staging tree).

**stage-clips, one real run, all four cases at once — ledger quoted verbatim:**
```
STAGED    20af51bc41d29cae.mp3  -> .../prod-staging/20af51bc41d29cae.mp3
SKIPPED   aaaaaaaaaaaaaaaa.mp3  (already present in .../prod-staging)
REJECTED  dddddddddddddddd.mp3  (source is a symlink: .../dev-staging/dddddddddddddddd.mp3)
REJECTED  not-a-hash-name.mp3  (name is not 16 lowercase hex chars + .mp3)
```
exit 0. `prod-staging` afterward held exactly the two real files — the
symlink and the bad name never landed.

**promote-to-bank, refuses on existing target AND on missing source in one
call — ledger quoted verbatim:**
```
EXISTS    aaaaaaaaaaaaaaaa.mp3  (already present in .../prod-bank, refusing)
MISSING   ffffffffffffffff.mp3  (not found in .../prod-staging)
REFUSED: 2 problem(s) above, nothing copied
```
exit 1. `prod-bank` afterward held only the file it started with
(`aaaaaaaaaaaaaaaa.mp3`, pre-seeded) — nothing was copied. A follow-up
`promote-to-bank 20af51bc41d29cae --confirm ARGYRIOS-SAID-GO` on the file
`stage-clips` had just staged succeeded (`PROMOTED 20af51bc41d29cae.mp3 ->
.../prod-bank/...`, exit 0), confirming the happy path also works, and a
path-traversal-shaped hash (`../../../etc/passwd`) was rejected by the
regex before any `realpath` call: `REJECTED  ../../../etc/passwd  (not a
bare 16 lowercase hex char hash)`.

## 3 — missing/wrong `--confirm`, quoted

```
$ aegean-ops-sandbox stage-clips
REFUSED: missing --confirm ARGYRIOS-SAID-GO (must be the last argument)
exit=1

$ aegean-ops-sandbox stage-clips --confirm nope
REFUSED: missing or wrong --confirm token (must be the last argument)
exit=1

$ aegean-ops-sandbox promote-to-bank 20af51bc41d29cae
REFUSED: missing --confirm ARGYRIOS-SAID-GO (must be the last argument)
exit=1
```
`prod-staging`/`prod-bank` were listed after each and were byte-identical
to before — nothing copied in any of the three.

## 4 — inverse

```
$ git status --porcelain
?? deploy/INSTALL-OPS.md
?? deploy/aegean-ops
?? deploy/aegean-ops.sudoers
```
Plus this report (`tasks/283-aegean-ops.md`) — four new files total, the
three asked for and the report, nothing else. `git diff --stat` against
tracked files is empty (all four are new, untracked).

**Zero sudo commands executed anywhere in this task**: every command run
against real paths was a plain read (`ls`, `id`, `whoami`) against
`/opt/party-game/client/public/{voice,voice-staging}` — readable to
argyrios without sudo — to size the "before" counts for INSTALL-OPS.md
(prod staging 105, prod bank 130, at the time of this task). No `install`,
`patch`, or `sudo` command ran against `/usr/local/sbin`, `/etc/sudoers.d`,
or anything under `/opt`. All `install`/symlink/path-escape exercises ran
only inside `/tmp/.../scratchpad/sandbox283` against the sandbox copy.
`history | grep -i sudo` in this session: no matches.
