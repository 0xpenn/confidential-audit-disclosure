// Tells TypeScript that window.ethereum exists — injected by wallet
// extensions (Rabby, MetaMask, etc). Untyped since different wallets
// attach slightly different shapes; ethers.BrowserProvider handles it fine.
interface Window {
  ethereum?: any;
}
