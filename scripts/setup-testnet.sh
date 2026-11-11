#!/usr/bin/env bash
# Testnet environment for CofiBlocks Traceability.
#
#   ./scripts/setup-testnet.sh
#
# Creates (or reuses) the three backend identities and funds them with
# Friendbot. Idempotent.
#
#   cofi-admin         deploys the contract, assigns roles and pays the users'
#                      fees (fee-bump)
#   cofi-farmer-agent  signs every farmer action (farmers have no wallet)
#   cofi-faucet        sends testnet XLM to new staff wallets
set -euo pipefail

NETWORK="testnet"
RPC_URL="${STELLAR_RPC_URL_TESTNET:-https://soroban-testnet.stellar.org}"
PASSPHRASE="Test SDF Network ; September 2015"
ADMIN="${STELLAR_ADMIN_IDENTITY:-cofi-admin}"
AGENT="${STELLAR_FARMER_AGENT_IDENTITY:-cofi-farmer-agent}"
FAUCET="${STELLAR_FAUCET_IDENTITY:-cofi-faucet}"

command -v stellar >/dev/null || {
  echo "the 'stellar' CLI is missing — cargo install --locked stellar-cli"; exit 1;
}
echo "CLI: $(stellar --version | head -1)"

stellar network add "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" 2>/dev/null || true

for identity in "$ADMIN" "$AGENT" "$FAUCET"; do
  if ! stellar keys address "$identity" >/dev/null 2>&1; then
    stellar keys generate "$identity" --network "$NETWORK" --fund >/dev/null
  fi
  # Funding again is idempotent: if it already has a balance, Friendbot fails and we move on.
  stellar keys fund "$identity" --network "$NETWORK" >/dev/null 2>&1 || true
done

cat <<SUMMARY

Testnet identities
  admin          $ADMIN   $(stellar keys address "$ADMIN")
  farmer agent   $AGENT   $(stellar keys address "$AGENT")
  faucet         $FAUCET   $(stellar keys address "$FAUCET")

Next steps:
  ./contracts/scripts/deploy.sh testnet
  backend .env:
    STELLAR_ADMIN_SECRET        = \$(stellar keys show $ADMIN)
    STELLAR_FARMER_AGENT_SECRET = \$(stellar keys show $AGENT)
    STELLAR_FAUCET_SECRET       = \$(stellar keys show $FAUCET)
SUMMARY
