#!/bin/sh
# Check duplicates using PMD CPD
# Usage: scripts/check_duplicates.sh [min_tokens] [dir]

MIN=${1:-60}
DIR=${2:-src/}

if ! command -v pmd >/dev/null 2>&1; then
  echo "pmd CLI not found in PATH. Install PMD and ensure 'pmd' is available."
  exit 2
fi

echo "Running PMD CPD: minimum tokens=${MIN}, dir=${DIR}"
pmd cpd --minimum-tokens "${MIN}" --language cpp --dir "${DIR}" --format text
RC=$?
if [ ${RC} -ne 0 ]; then
  echo "PMD CPD detected duplicates or encountered an error (exit ${RC})."
  exit ${RC}
fi

echo "No duplicates detected."
exit 0
