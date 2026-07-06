// Contract address for AuditDisclosure, verified on Sepolia:
// https://sepolia.etherscan.io/address/0x052EA0f42d522199bBd1BdD2E588f1c40c981102#code

import AuditDisclosureArtifact from "./AuditDisclosure.json";

export const CONTRACT_ADDRESS = "0x052EA0f42d522199bBd1BdD2E588f1c40c981102";

// Real compiled ABI from Hardhat's build output — not hand-typed, guaranteed
// to match the deployed bytecode exactly.
export const CONTRACT_ABI = AuditDisclosureArtifact.abi;

// Status enum mirrors AuditDisclosure.sol exactly — index order matters
export const STATUS_LABELS = ["Pending", "Approved", "Rejected", "Revealed"] as const;
