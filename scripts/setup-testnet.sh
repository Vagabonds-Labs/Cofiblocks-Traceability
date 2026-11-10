#!/usr/bin/env bash
# Testnet environment for CofiBlocks Traceability.
#
#   ./scripts/setup-testnet.sh
#
# Creates (or reuses) the identity that deploys the contract and pays the
# users' fees (fee-bump), and funds it with Friendbot. Idempotent.
set -euo pipefail

NETWORK="testnet"
RPC_URL="${STELLAR_RPC_URL_TESTNET:-https://soroban-testnet.stellar.org}"
PASSPHRASE="Test SDF Network ; September 2015"
ADMIN="${STELLAR_ADMIN_IDENTITY:-cofi-admin}"

command -v stellar >/dev/null || {
  echo "the 'stellar' CLI is missing — cargo install --locked stellar-cli"; exit 1;
}
echo "CLI: $(stellar --version | head -1)"

stellar network add "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" 2>/dev/null || true

if ! stellar keys address "$ADMIN" >/dev/null 2>&1; then
  stellar keys generate "$ADMIN" --network "$NETWORK" --fund >/dev/null
fi
# Funding again is idempotent: if it already has a balance, Friendbot fails and we move on.
stellar keys fund "$ADMIN" --network "$NETWORK" >/dev/null 2>&1 || true

cat <<SUMMARY

Testnet admin
  identity     $ADMIN
  address      $(stellar keys address "$ADMIN")

Next steps:
  ./contracts/scripts/deploy.sh testnet
  backend STELLAR_ADMIN_SECRET = \$(stellar keys show $ADMIN)
SUMMARY
