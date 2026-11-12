# SOW evidence — deliverable 2 (2026-11-12)

Contract: [`CC4ZL3I3IDG5BNBBH4XRRM2CWG6VZHJEND2SAHLCY7ISMUEWIG5TW524`](https://stellar.expert/explorer/testnet/contract/CC4ZL3I3IDG5BNBBH4XRRM2CWG6VZHJEND2SAHLCY7ISMUEWIG5TW524) on Stellar testnet.
Batch: `12-11-2026 KK-EVID03` (farmer `KK-EVID03`). Final state on chain: RECEIVED, 44.75 kg.

| Proof | Call | Result | Transaction |
|---|---|---|---|
| Setup | grant_role Collector → KK (GBOJBV…) | Succeeded | [4c01b2f298…](https://stellar.expert/explorer/testnet/tx/4c01b2f298f5fa32bbc231f68db5f3a7d8ed486b3d1e64bac1e3e2a2fa8e81e1) |
| Setup | grant_role Collector → DM (GAF4ZM…) | Succeeded | [8a062bc4e8…](https://stellar.expert/explorer/testnet/tx/8a062bc4e82efe67b14d2ed546f78e89b303cceb1e39d62b00233c14eea41945) |
| 1. Farmer creates a batch | register_farmer KK-EVID03 | Succeeded | [95ca939ca6…](https://stellar.expert/explorer/testnet/tx/95ca939ca6df0a1fd2e1f7d999208fd9cc6086e799c17c47c68c3cfb160550fa) |
| 1. Farmer creates a batch | record_consent (EUDR) | Succeeded | [ee1972c9a8…](https://stellar.expert/explorer/testnet/tx/ee1972c9a8dfd646f670d386f1c0ab0834d85e7cecf345dc68e89be0fce0e1e9) |
| 1. Farmer creates a batch | set_profile v1 | Succeeded | [e6c478fc51…](https://stellar.expert/explorer/testnet/tx/e6c478fc5111fc438469459c3abe2cb1d237c0542b78a8dee9ce39d0f23762ad) |
| 1. Farmer creates a batch | create_batch "12-11-2026 KK-EVID03" | Succeeded | [cf27a1de11…](https://stellar.expert/explorer/testnet/tx/cf27a1de113e40a04cb5ec035e34895e4f28b8411592cc1b463fa7a6b387e6be) |
| 2. Collector adds an authorized event | record_reception "12-11-2026 KK-EVID03": 44.75 kg + receipt hash | Succeeded | [d4ccd21ffb…](https://stellar.expert/explorer/testnet/tx/d4ccd21ffbc7609293865ef53b337c2962b6366634610fc5968143a02820eef6) |
| 3. Unauthorized attempt rejected on chain | record_reception by a DM Collector on a KK batch → Error(Contract, #4) WRONG_ORGANIZATION | Rejected by the contract | [a329a68005…](https://stellar.expert/explorer/testnet/tx/a329a68005c6ddf530c4c7958de13d9592023df5ebe3606452eb4582f28750d0) |
| 3. Unauthorized attempt rejected on chain | record_reception a second time on "12-11-2026 KK-EVID03" → Error(Contract, #13) RECEPTION_ALREADY_RECORDED | Rejected by the contract | [c1808a7b53…](https://stellar.expert/explorer/testnet/tx/c1808a7b53c834245401f6254eb65f020381a6e3e2eda6a8dbd24f27281009e9) |

Generated with `npm run sow:evidence` (backend). Farmer steps go through the VoiceLedger integration API signed like the VoiceLedger bot; the farmer-agent wallet signs them on chain. The Collector signs with their own wallet and the backend pays the fee (fee-bump). The rejected attempts were sent without simulation so the contract itself rejects them on chain.
