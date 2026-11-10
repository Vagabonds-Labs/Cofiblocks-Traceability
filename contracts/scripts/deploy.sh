#!/usr/bin/env bash
# Deploys the CofiBlocks traceability contract to Stellar.
#
#   ./contracts/scripts/deploy.sh testnet
#   ./contracts/scripts/deploy.sh mainnet
#
# Writes `contracts/deployments/<network>.json`, which the backend reads to get
# the contract address. The contract admin is the deploying identity: its
# secret key goes in the backend's `STELLAR_ADMIN_SECRET`.
set -euo pipefail

NETWORK="${1:-testnet}"
ADMIN="${STELLAR_ADMIN_IDENTITY:-cofi-admin}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/deployments"
WASM_DIR="$ROOT/target/wasm32v1-none/release"

case "$NETWORK" in
  testnet)
    PASSPHRASE="Test SDF Network ; September 2015"
    RPC_URL="${STELLAR_RPC_URL_TESTNET:-https://soroban-testnet.stellar.org}"
    ;;
  mainnet)
    PASSPHRASE="Public Global Stellar Network ; September 2015"
    RPC_URL="${STELLAR_RPC_URL_MAINNET:-https://mainnet.sorobanrpc.com}"
    ;;
  *)
    echo "unknown network: $NETWORK (use testnet or mainnet)"; exit 1;;
esac

NET_ARGS=(--network-passphrase "$PASSPHRASE" --rpc-url "$RPC_URL")
ADMIN_ADDRESS="$(stellar keys address "$ADMIN")"

echo "network    $NETWORK"
echo "admin      $ADMIN ($ADMIN_ADDRESS)"
echo ""

echo "→ build"
(cd "$ROOT" && stellar contract build >/dev/null)

echo "→ traceability"
WASM_HASH="$(stellar contract upload \
  --wasm "$WASM_DIR/traceability.wasm" \
  --source-account "$ADMIN" "${NET_ARGS[@]}" 2>/dev/null)"
CONTRACT_ID="$(stellar contract deploy \
  --wasm-hash "$WASM_HASH" \
  --source-account "$ADMIN" "${NET_ARGS[@]}" \
  -- --admin "$ADMIN_ADDRESS" 2>/dev/null)"
echo "   $CONTRACT_ID"

mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/${NETWORK}.json"
cat > "$OUT" <<JSON
{
  "network": "$NETWORK",
  "networkPassphrase": "$PASSPHRASE",
  "rpcUrl": "$RPC_URL",
  "Traceability": {
    "contract": "Traceability",
    "address": "$CONTRACT_ID",
    "wasmHash": "$WASM_HASH",
    "admin": "$ADMIN_ADDRESS"
  }
}
JSON

echo ""
echo "✅ $OUT"
cat "$OUT"
