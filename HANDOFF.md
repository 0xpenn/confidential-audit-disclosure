# Redact — Confidential Audit Disclosure — Build Log

## Status: In Progress | Deadline: July 7 2026 23:59 AOE

## Progress by Day

### June 30
- FHEVM Hardhat template cloned, deps audited, credentials set
- FHECounter compiled, tested in mock mode, deployed to Sepolia
- Repo created under 0xpenn, pushed to GitHub

### July 1
- AuditDisclosure.sol written — full state machine with FHE encrypted severity
- 9/9 tests passing in mock mode
- Deployed + verified on Sepolia Etherscan
- Etherscan bytecode mismatch fixed via bytecodeHash "ipfs" config change

### July 2
- Added getReport(), getReportsByResearcher(), full NatSpec
- 10/10 tests passing after additions
- Final redeploy + re-verify complete
- Full README written — architecture, FHE rationale, build process, security notes

### July 3
- Frontend design direction locked: dark UI, redaction-bar as hero visual,
  amber/teal/red/blue status system, monospace for on-chain data
- Product name settled: "Redact"
- Vite + React + TypeScript scaffold created
- ethers + @zama-fhe/relayer-sdk installed

### July 3 night → July 4
- Wrote contract.ts (imports real compiled ABI from Hardhat artifacts, not
  hand-typed), fhe.ts (encryption wrapper), full App.tsx (landing page +
  wallet connect + submit form + report list + owner controls), App.css
- Resolved a chain of Vite/dependency issues:
  - @zama-fhe/relayer-sdk has no root export, must import from "/web" subpath
  - This Vite version uses Rolldown internally (not classic esbuild/rollup) —
    vite-plugin-wasm / vite-plugin-top-level-await are incompatible with it.
    Removed both, set build target to "esnext" instead — natively supports
    top-level await + WASM without plugins
  - Fixed "global is not defined" crash via `define: { global: 'globalThis' }`
    in vite.config.ts — SDK references a Node-only global browsers don't have
- Landing page confirmed rendering correctly: badge, headline, description,
  both CTAs, footer meta
- Fixed layout bug — page was capped at 720px centered instead of full-width;
  restructured CSS to 1100px max-width with proper centered hero column
- Added "How it works" 3-step section below the hero, inspired by reviewing
  a comparable Zama-track project (Cifra) for structural ideas — kept our
  own redaction-bar visual identity rather than copying their gold-orb motif
- Wallet connect confirmed working end-to-end (Launch app → wallet popup →
  transitions into app view)
- App view confirmed rendering: wallet badge, submit card, severity picker,
  report reference input, reports section
- Hit submit flow error: "Relayer didn't response correctly. Bad JSON" —
  traced to `net::ERR_EMPTY_RESPONSE` from relayer.testnet.zama.cloud,
  confirmed as Zama's testnet relayer infrastructure being down/unstable,
  not a bug in our code. Confirmed @zama-fhe/relayer-sdk@0.2.0 is genuinely
  the latest published version — no upgrade path to try
- Rewrote fhe.ts to use Zama's current explicit documented config (ACL
  contract, KMS contract, input verifier, gateway chain ID) instead of the
  packaged SepoliaConfig shorthand, in case that shorthand predates recent
  protocol infrastructure changes (Zama mainnet launched Dec 30 2025,
  "Testnet v2" rollout referenced in community threads)
- Deployed to Vercel under 0xpen-s-projects/redact — initial deploy came
  back behind a login wall (Deployment Protection enabled in Vercel
  settings), needs disabling before the URL is actually public
- `npm run build` failed with exit code 2 — root cause found: unused
  `formatEther` import (TS6133) and untyped `window.ethereum` (TS2339,
  TypeScript doesn't know wallet extensions inject this global). Fixed by
  removing the unused import and adding a global.d.ts declaring
  `interface Window { ethereum?: any }`
- Rebuild pending confirmation after these fixes

## Deployment Addresses
- FHECounter (Sepolia): 0xD7e71fA7Ce7Cca24C4a92AcE73ac172CE1cE3f57
- AuditDisclosure (Sepolia, verified, CURRENT): 0x052EA0f42d522199bBd1BdD2E588f1c40c981102
- Etherscan: https://sepolia.etherscan.io/address/0x052EA0f42d522199bBd1BdD2E588f1c40c981102#code
- Vercel: redact (0xpen-s-projects) — public URL pending Deployment
  Protection being disabled

### July 4 (late night)
- `npm run build` confirmed passing clean after TS fixes
- Vercel Deployment Protection disabled, redeployed with `vercel --prod`

## Up Next
1. Retest submit flow — check if relayer has recovered and whether the
   explicit config change made any difference
2. If relayer still down: document as known Sepolia infrastructure
   limitation in README, proceed to record demo video showing UI/flow
   regardless of one blocked live transaction
3. Record demo video (under 3 minutes)
4. Final README polish — frontend section, screenshots

## Stack
Hardhat 2.28.6 · FHEVM · Sepolia · Vite (Rolldown) · React + TypeScript ·
ethers.js v6.17 · @zama-fhe/relayer-sdk v0.2.0 · Vercel
