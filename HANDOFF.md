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
- Contract verified on Etherscan ✅

## Deployment Addresses
- FHECounter (Sepolia): 0xD7e71fA7Ce7Cca24C4a92AcE73ac172CE1cE3f57
- AuditDisclosure (Sepolia, verified): 0x47A605D79C70068c024C344BC4Efe1F18b662508
- Etherscan: https://sepolia.etherscan.io/address/0x47A605D79C70068c024C344BC4Efe1F18b662508#code

## Up Next
1. getReport() + getReportsByResearcher() + NatSpec
2. Frontend — React, submit form + status display
3. README + submission write-up

## Stack
Hardhat 2.28.6 · FHEVM · Sepolia · credentials via hardhat vars
