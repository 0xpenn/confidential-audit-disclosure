# Confidential Audit Disclosure — Build Log

## Status: In Progress | Deadline: July 7 2026 23:59 AOE

## Progress by Day

### June 30
- FHEVM Hardhat template cloned, deps audited, credentials set
- FHECounter compiled, tested in mock mode, deployed to Sepolia
- Repo created under 0xpenn, pushed to GitHub

### July 1
- AuditDisclosure.sol written — full state machine with FHE encrypted severity
- Deploy script written, both contracts deploy locally
- 9/9 tests passing in mock mode
- AuditDisclosure deployed to Sepolia
- Contract verified on Etherscan
- Observed: Etherscan bytecode mismatch on first deploy — bytecodeHash "none" strips
  metadata Etherscan needs to match. Adjusted by switching to bytecodeHash "ipfs" and
  redeploying. Verification succeeded on the redeploy.

### July 2 (session 3, ended 12:17pm)
- Added getReport() — single call returns full report metadata, encSeverity excluded
  since a raw ciphertext handle is meaningless without FHE decrypt access
- Added getReportsByResearcher() — tracks submission history per wallet
- Added NatSpec across all functions
- Considered allowTransient() for gas savings on submit, kept FHE.allow() instead —
  owner needs decrypt access across multiple future transactions, not just one
- 10/10 tests passing after additions
- Redeploy + re-verify pending — pick up next session with new contract address

## Deployment Addresses
- FHECounter (Sepolia): 0xD7e71fA7Ce7Cca24C4a92AcE73ac172CE1cE3f57
- AuditDisclosure (Sepolia, PRE-getReport update): 0x47A605D79C70068c024C344BC4Efe1F18b662508
- Note: this address is now stale — contract has getReport()/getReportsByResearcher()
  added since this deploy. Redeploy needed before frontend work.

## Up Next
1. Redeploy updated AuditDisclosure to Sepolia, re-verify on Etherscan
2. Frontend — React, submit form + status display
3. README + submission write-up

## Stack
Hardhat 2.28.6 · FHEVM · Sepolia · credentials via hardhat vars
