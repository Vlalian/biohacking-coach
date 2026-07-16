#!/bin/bash

INPUT=$(cat)
if command -v jq >/dev/null 2>&1; then
  COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
else
  # jq unavailable (e.g. stock Windows Git Bash): match against the raw hook
  # input instead. Slightly over-broad — a dangerous pattern anywhere in the
  # tool input blocks — which is the safe direction for a guardrail.
  COMMAND="$INPUT"
fi

# "git push" removed 2026-07-16 at Mads's request — plain pushes are allowed;
# force pushes remain blocked via the "push --force" pattern below.
DANGEROUS_PATTERNS=(
  "git reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
  "push --force"
  "reset --hard"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
