// Client-side FHE encryption setup — talks to Zama's relayer, never our own server.
// Severity score is encrypted in-browser before it ever touches the network.

import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/web";
import { CONTRACT_ADDRESS } from "./contract";

let instancePromise: ReturnType<typeof createInstance> | null = null;

// Instance creation is slow (loads WASM + fetches relayer public key) —
// cache the promise so we only pay that cost once per session.
export function getFhevmInstance() {
  if (!instancePromise) {
    instancePromise = createInstance(SepoliaConfig);
  }
  return instancePromise;
}

// Encrypts a severity score (1-4) for the connected wallet, bound to this contract.
// Returns the ciphertext handle + inputProof — both required by submit().
export async function encryptSeverity(userAddress: string, severity: number) {
  const instance = await getFhevmInstance();
  const input = instance.createEncryptedInput(CONTRACT_ADDRESS, userAddress);
  input.add8(severity);
  const encrypted = await input.encrypt();
  return {
    handle: encrypted.handles[0],
    inputProof: encrypted.inputProof,
  };
}
