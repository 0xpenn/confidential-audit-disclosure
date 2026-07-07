# Redact — Confidential Audit Disclosure

A confidential vulnerability disclosure system built on FHEVM. Researchers submit severity scores that stay encrypted on-chain — visible only to the protocol owner — until an outcome is reached or a 7-day deadline forces a trustless public reveal.

Built for Zama's Developer Program Mainnet Season 3, Builder Track.

**Live contract (Sepolia, verified):** `0x052EA0f42d522199bBd1BdD2E588f1c40c981102`
[View on Etherscan](https://sepolia.etherscan.io/address/0x052EA0f42d522199bBd1BdD2E588f1c40c981102#code)

**Frontend (live):** Vite + React + TypeScript — submit encrypted findings, track reports, owner approve/reject controls. See [Frontend](#frontend) below.

---

## The problem

Public on-chain vulnerability disclosure creates a front-running race. The moment a severity score or exploit detail is visible on-chain, anyone — including the attacker the researcher is trying to warn about — can see it before the protocol patches. Traditional bug bounty platforms solve this with off-chain, centralized trust: you tell HackerOne or Immunefi, and you trust them to keep it private until resolution.

This project asks: can that trust be replaced with encryption, on-chain, without a centralized platform in the middle?

## Why FHE specifically

Regular on-chain storage is either fully public or fully hidden behind an off-chain database — there's no in-between. FHEVM's `euint8` type lets the severity score live on-chain as ciphertext: verifiably submitted, immutably timestamped, but unreadable to anyone without explicit decrypt permission. The owner gets that permission via `FHE.allow()`. Nobody else — not competitors, not exploiters scanning mempool activity, not even a curious validator — can read the score until the contract itself decides to reveal it.

This is the core bet of the project: FHE turns "trust the platform to keep this private" into "trust the math."

## Architecture — state machine

Every report moves through exactly one path, never backward:

```
1. Researcher submits: encrypted severity (euint8, 1–4) + description hash
2. Owner reviews: decrypts severity privately via FHE.allow()
3. Three possible outcomes:
   a. Owner approves + pays → researcher may optionally disclose publicly
   b. Owner rejects + MUST submit a plaintext rejection reason
      (public, permanent — accountability even though the finding stayed encrypted)
   c. Owner does nothing → after 7 days, report auto-reveals publicly
      (hard cutoff, no pause, no extension)
4. If rejected, researcher can flag the rejection as disputed
   (public counter only — no arbitration)
```

The 7-day auto-reveal is the mechanism that keeps the owner honest. Silence isn't a valid strategy — an ignored report becomes public exactly like one that got no response elsewhere. The mandatory rejection reason means an owner can't quietly bury a finding either; rejecting requires a public, permanent paper trail.

## Contract

`AuditDisclosure.sol` — deployed and verified on Sepolia:
`0x052EA0f42d522199bBd1BdD2E588f1c40c981102`

### Core functions

- `submit(externalEuint8, bytes inputProof, bytes32 descriptionHash)` — researcher submits encrypted severity + off-chain report hash
- `approve(uint256 reportId)` — owner approves and pays in ETH, forwarded directly to researcher
- `reject(uint256 reportId, string reason)` — owner rejects; empty reason reverts
- `reveal(uint256 reportId)` — callable by anyone once the 7-day deadline passes
- `dispute(uint256 reportId)` — researcher flags a bad-faith rejection
- `getReport(uint256 reportId)` — full report metadata in one call
- `getReportsByResearcher(address)` — submission history for a given wallet

### Security design notes

- Ownership is fixed at deploy — no transfer function. Simplifies trust assumptions for this MVP.
- `approve()` accepts any `msg.value`, including zero — owner sets bounty size per finding.
- Checks-effects-interactions is followed in `approve()` — status is updated before the ETH transfer, closing the reentrancy window a naive implementation would leave open.
- `reveal()` is deliberately front-runnable by design — anyone can trigger it the instant the deadline passes. No party can block or delay the hard cutoff.

## Tech stack

**Contract:**
- **FHEVM** (Zama) — confidential Solidity extension for encrypted on-chain types
- **Hardhat 2.28.6** — compile, test, deploy
- **Sepolia** — testnet deployment
- **hardhat-deploy** — deploy script management
- **Chai / Mocha** — 10/10 tests passing in FHEVM mock mode

**Frontend:**
- **Vite 8** (Rolldown-based bundler, not classic esbuild) + **React 19** + **TypeScript 6**
- **ethers.js v6.17** — contract interaction, wallet connect
- **@zama-fhe/relayer-sdk v0.2.0** — client-side FHE encryption (WASM-loaded, talks to Zama's testnet relayer)
- **Design:** dark UI (`#0A0B0D`), redaction-bar visual language — `▓▓▓ ENCRYPTED ▓▓▓` resolves to a number on reveal. JetBrains Mono for on-chain data, Inter for prose.

## Frontend

The app at `frontend/` is the research-facing interface for Redact. Landing page introduces the concept; the app view handles wallet connection, encrypted submission, report browsing, and owner controls.

### What it does

- **Landing page** — badge, headline, "How it works" 3-step breakdown, CTA to launch the app, link to the verified contract on Etherscan.
- **Wallet connect** — detects Rabby/MetaMask/Backpack via `window.ethereum`, transitions to the app view.
- **Submit a finding** — severity picker (1–4), report reference input (free text, IPFS CID, or link), encrypts client-side via the relayer SDK, submits to the contract.
- **Report list** — reads all reports from the chain, shows status with the amber/teal/red/blue color system. Expand a report to see full metadata.
- **Owner controls** — if the connected wallet is the contract owner, expand a pending report to approve (with ETH amount) or reject (with mandatory reason).
- **Reveal** — if the 7-day deadline has passed, anyone can trigger the public reveal.
- **Dispute** — the original researcher can flag a bad-faith rejection.

### Running the frontend

```bash
cd frontend
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
```

### Vite/Rolldown notes

This project uses Vite 8, which ships with Rolldown as its bundler (not esbuild or classic Rollup). Two consequences:

1. **No WASM/top-level-await plugins.** `vite-plugin-wasm` and `vite-plugin-top-level-await` try to `require('esbuild')` or `require('rollup')` — neither exists in a Rolldown-based setup. Instead, `build.target: 'esnext'` in `vite.config.ts` natively supports both.
2. **`global` polyfill via `define`.** The Zama relayer SDK references `global` (a Node.js-ism). Browsers don't have it. `define: { global: 'globalThis' }` in the Vite config patches this without pulling in a full Node polyfill.

### Relayer URL override

The SDK's shipped `SepoliaConfig` hardcodes `relayer.testnet.zama.cloud`, which went dead during the Testnet v2 rollout (Dec 2025). The new domain is `relayer.testnet.zama.org`. The frontend spreads `SepoliaConfig` and overrides `relayerUrl` — same contract addresses, just a DNS change on Zama's side.

### Known limitations (frontend)

- **Relayer dependency** — the submit flow depends entirely on Zama's testnet relayer being up. If the relayer returns errors or times out, encryption fails in-browser before any transaction is sent. No fallback relayer is configured.
- **No ENS or address book** — report metadata shows raw addresses. No labeling or history beyond what the contract stores.
- **Chain change triggers reload** — switching networks or accounts reloads the page rather than updating state in place. Functional, but not seamless.

## Setup

```bash
git clone https://github.com/0xpenn/confidential-audit-disclosure.git
cd confidential-audit-disclosure
npm install

npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
npx hardhat vars set ETHERSCAN_API_KEY

npx hardhat compile
npx hardhat test
npx hardhat deploy --network sepolia --tags AuditDisclosure
```

## Known limitations

These are deliberate MVP scope cuts, not oversights:

- **No spam/Sybil prevention** — any address can submit unlimited reports. No staking, no slashing.
- **No independent severity verification** — researcher self-reports the score. Same trust model as HackerOne or Immunefi's initial triage.
- **No off-chain leak prevention** — encryption solves on-chain disclosure, not the researcher choosing to leak the finding elsewhere. That remains a trust problem, not a code problem.
- **No pause-aware deadline** — the 7-day clock runs regardless of network conditions or an owner being temporarily unavailable.
- **No escrow** — payment flows directly at approval time; no locked funds guaranteeing payout before disclosure.
- **No arbitration** — disputes are a public counter, not a resolution mechanism.

## Future work

- Stake-slashing for spam prevention
- Escrow-based payment with time-locked release
- Lightweight arbitration (e.g. multi-sig committee vote on disputed rejections)
- Pause mechanism for the reveal deadline, gated by a DAO or multisig
- Ownership transfer support

---

## Build log

**Why this project.** Wasn't the first thing I tried. Sui Overflow 2026 was already closed by the time I could actually sit down and build. Then tried Canton Network through Encode Club — that one just kept hitting walls. Docker wouldn't run on my hardware the way their setup needed, and even past that, Super Validator approval was a multi-day queue that flat out wasn't going to clear before any deadline. Didn't want to waste the work though, so I put together a concept checkpoint anyway — "Audit Findings Vault," architecture diagram, a rough UI mockup — and submitted it as exactly what it was: a concept, not working code. No point pretending otherwise. Ended up on Zama because it wasn't a stretch — FHE genuinely solves something real here, the front-running problem with on-chain disclosures, instead of just being encryption for the sake of having encryption in the pitch.

**June 30.** Cloned Zama's `fhevm-hardhat-template`. First `npm audit` came back with 55 vulnerabilities and I panicked for a second — turned out almost all of it was Hardhat's own dev dependency tree, nothing that ships to runtime. `npm audit --omit=dev` brought it down to 2 real findings, both in `ws`, neither exploitable in a local toolchain. Got `FHECounter.sol` (the template's example) compiling, tested, and deployed to Sepolia before touching my own contract — wanted the pipeline proven first.

**July 1.** Wrote `AuditDisclosure.sol` — submit, approve/reject/auto-reveal, dispute. 9 tests, all against FHEVM's mock mode so I wasn't burning Sepolia gas debugging. Deployed, Etherscan verification failed on bytecode mismatch. Turned out `bytecodeHash: "none"` in the Hardhat config strips metadata Etherscan needs to match source against deployed bytecode. Switched to `"ipfs"`, redeployed, verified clean.

**July 2.** Went back through the contract against original scope before touching frontend. Added `getReport()` — one call for full metadata instead of three separate calls. Deliberately left the raw `encSeverity` handle out of it; returning a ciphertext handle to someone without decrypt access is just noise. Added `getReportsByResearcher()` for submission history. Full NatSpec pass. Looked at `FHE.allowTransient()` for gas savings on submit but kept `FHE.allow()` — owner needs to come back and decrypt later, transient access wouldn't survive that. Hit a WSL DNS failure mid-deploy (`EAI_AGAIN sepolia.infura.io`), took a break, came back and it just worked. Redeployed, reverified.

**Corrections made along the way, worth noting because they're the kind of thing that only shows up by actually compiling against the installed library, not just reading docs:**
- `externalEuint8` is a value type, not a struct — first draft had `calldata` on it, doesn't compile.
- `FHE.fromExternal()` needs an `inputProof` argument alongside the encrypted handle. Missed it first pass.
- `FHE.allowPublic()` doesn't exist in this FHEVM version. Grepped the actual installed `FHE.sol` and found the real function — `FHE.makePubliclyDecryptable()`, which returns a handle you have to reassign.
- Tried `hardhat-keystore` for encrypted secret storage instead of plaintext `vars`. Every published version needs Hardhat 3, this project's pinned to 2.28.6. Not compatible. Stuck with `vars` — fine tradeoff since the wallet behind it is a burner holding only testnet ETH.

**Where the security background actually shows up in the code:** `approve()` sets status to `Approved` before the ETH transfer goes out — checks-effects-interactions, closes the reentrancy window a naive version would leave open. Every state change is gated by a modifier, not scattered inline checks. Authorization runs on `msg.sender`, never `tx.origin`.

**July 5.** Frontend build and relayer fix. `npm run build` was passing clean already. Tracked down the submit-flow failure: the `SepoliaConfig` bundled in `@zama-fhe/relayer-sdk@0.2.0` points at `relayer.testnet.zama.cloud`, which is completely dead — DNS returns nothing. Found a Zama community post from Dec 2025 where a team member confirms the new domain is `relayer.testnet.zama.org`. Confirmed the new URL responds (Kong gateway, HTTP-level alive). Fix is a one-liner: spread `SepoliaConfig` and override `relayerUrl`. Same contract addresses, same SDK version, just the DNS changed out from under us. Also fleshed out the frontend section of this README — architecture, how to run, Vite/Rolldown gotchas, relayer override rationale, remaining frontend limitations.

## License

MIT
