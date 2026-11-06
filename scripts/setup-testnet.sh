#!/usr/bin/env bash
# Entorno de testnet para CofiBlocks Traceability.
#
#   ./scripts/setup-testnet.sh
#
# Crea (o reutiliza) la identidad que despliega el contrato y paga los fees de
# los usuarios (fee-bump), y la fondea con friendbot. Idempotente.
set -euo pipefail

NETWORK="testnet"
RPC_URL="${STELLAR_RPC_URL_TESTNET:-https://soroban-testnet.stellar.org}"
PASSPHRASE="Test SDF Network ; September 2015"
ADMIN="${STELLAR_ADMIN_IDENTITY:-cofi-admin}"

command -v stellar >/dev/null || {
  echo "falta el CLI 'stellar' — cargo install --locked stellar-cli"; exit 1;
}
echo "CLI: $(stellar --version | head -1)"

stellar network add "$NETWORK" \
  --rpc-url "$RPC_URL" \
  --network-passphrase "$PASSPHRASE" 2>/dev/null || true

if ! stellar keys address "$ADMIN" >/dev/null 2>&1; then
  stellar keys generate "$ADMIN" --network "$NETWORK" --fund >/dev/null
fi
# Fondear de nuevo es idempotente: si ya tiene saldo, friendbot falla y seguimos.
stellar keys fund "$ADMIN" --network "$NETWORK" >/dev/null 2>&1 || true

cat <<SUMMARY

Admin de testnet
  identidad    $ADMIN
  dirección    $(stellar keys address "$ADMIN")

Siguientes pasos:
  ./contracts/scripts/deploy.sh testnet
  STELLAR_ADMIN_SECRET del backend = \$(stellar keys show $ADMIN)
SUMMARY
