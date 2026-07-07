import { useState, useEffect, useCallback, useRef } from "react";
import { BrowserProvider, Contract, parseEther } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, STATUS_LABELS } from "./contract";
import { encryptSeverity } from "./fhe";
import "./App.css";

type Report = {
  id: number;
  researcher: string;
  descriptionHash: string;
  status: number;
  submittedAt: number;
  rejectionReason: string;
  disputeCount: number;
  revealed: boolean;
};

// IntersectionObserver hook — adds .revealed class when element scrolls into view
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("revealed");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function ScrollReveal({ children, className = "", delay = 0 }: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={`reveal-on-scroll ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────

function App() {
  const [view, setView] = useState<"landing" | "app">("landing");
  const [address, setAddress] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [severity, setSeverity] = useState(2);
  const [descHash, setDescHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [activeTab, setActiveTab] = useState<"submit" | "reports">("submit");

  const isOwner = owner?.toLowerCase() === address?.toLowerCase();

  const getContract = useCallback(async (needsSigner = false) => {
    if (!window.ethereum) throw new Error("No wallet found");
    const provider = new BrowserProvider(window.ethereum);
    const signerOrProvider = needsSigner ? await provider.getSigner() : provider;
    return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerOrProvider);
  }, []);

  const switchToSepolia = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
      setWrongNetwork(false);
      if (address) await loadReports();
    } catch (err: any) {
      if (err?.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0xaa36a7",
              chainName: "Sepolia",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://eth-sepolia.public.blastapi.io"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            }],
          });
          setWrongNetwork(false);
          if (address) await loadReports();
        } catch (addErr) {
          console.error(addErr);
          setStatusMsg("Couldn't add Sepolia — add it manually in your wallet.");
        }
      } else {
        console.error(err);
        setStatusMsg("Network switch cancelled or failed.");
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setStatusMsg("No wallet detected — install Rabby or MetaMask.");
      return;
    }
    const provider = new BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    setAddress(accounts[0]);

    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 11155111) {
      setWrongNetwork(true);
      setStatusMsg("Switch to Sepolia to interact with the contract.");
    } else {
      setWrongNetwork(false);
    }
    setView("app");

    window.ethereum.on?.("chainChanged", () => window.location.reload());
    window.ethereum.on?.("accountsChanged", () => window.location.reload());
  };

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const contract = await getContract(false);
      const count = await contract.reportCount();
      const ownerAddr = await contract.owner();
      setOwner(ownerAddr);

      const items: Report[] = [];
      for (let i = 0; i < Number(count); i++) {
        const r = await contract.getReport(i);
        items.push({
          id: i,
          researcher: r[0],
          descriptionHash: r[1],
          status: Number(r[2]),
          submittedAt: Number(r[3]),
          rejectionReason: r[4],
          disputeCount: Number(r[5]),
          revealed: r[6],
        });
      }
      setReports(items.reverse());
    } catch (err) {
      console.error(err);
      setStatusMsg("Couldn't load reports — check you're on Sepolia.");
    } finally {
      setLoading(false);
    }
  }, [getContract]);

  useEffect(() => {
    if (view === "app" && address) {
      loadReports();
    }
  }, [view, address, loadReports]);

  const handleSubmit = async () => {
    if (!address) return;
    setSubmitting(true);
    setStatusMsg("Encrypting severity in-browser...");
    try {
      const { handle, inputProof } = await encryptSeverity(address, severity);
      const hashInput = descHash.trim() || `report-${Date.now()}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(hashInput);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashHex =
        "0x" +
        Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      setStatusMsg("Waiting for wallet confirmation...");
      const contract = await getContract(true);
      const tx = await contract.submit(handle, inputProof, hashHex);
      setStatusMsg("Submitting on-chain...");
      await tx.wait();
      setStatusMsg("Submitted.");
      setDescHash("");
      await loadReports();
    } catch (err) {
      console.error(err);
      setStatusMsg("Submit failed — see console.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (reportId: number, ethAmount: string) => {
    try {
      setStatusMsg("Approving...");
      const contract = await getContract(true);
      const tx = await contract.approve(reportId, {
        value: parseEther(ethAmount || "0"),
      });
      await tx.wait();
      setStatusMsg("Approved.");
      await loadReports();
    } catch (err) {
      console.error(err);
      setStatusMsg("Approve failed — see console.");
    }
  };

  const handleReject = async (reportId: number, reason: string) => {
    if (!reason.trim()) {
      setStatusMsg("Rejection reason is required.");
      return;
    }
    try {
      setStatusMsg("Rejecting...");
      const contract = await getContract(true);
      const tx = await contract.reject(reportId, reason);
      await tx.wait();
      setStatusMsg("Rejected.");
      await loadReports();
    } catch (err) {
      console.error(err);
      setStatusMsg("Reject failed — see console.");
    }
  };

  const handleReveal = async (reportId: number) => {
    try {
      setStatusMsg("Revealing...");
      const contract = await getContract(true);
      const tx = await contract.reveal(reportId);
      await tx.wait();
      setStatusMsg("Revealed.");
      await loadReports();
    } catch (err) {
      console.error(err);
      setStatusMsg("Reveal failed — deadline may not have passed yet.");
    }
  };

  const handleDispute = async (reportId: number) => {
    try {
      setStatusMsg("Disputing...");
      const contract = await getContract(true);
      const tx = await contract.dispute(reportId);
      await tx.wait();
      setStatusMsg("Disputed.");
      await loadReports();
    } catch (err) {
      console.error(err);
      setStatusMsg("Dispute failed — see console.");
    }
  };

  // ─── LANDING VIEW ────────────────────────────────────────

  if (view === "landing") {
    return (
      <div className="landing">
        <nav className="nav">
          <div className="logo"><span className="amber">▓</span>redact</div>
          <button className="btn-primary" onClick={connectWallet}>Launch app →</button>
        </nav>

        <div className="hero-inner">
          <div className="badge">Built on FHEVM · Zama Protocol</div>

          <h1 className="hero-title">
            Stays encrypted.<br />
            <span className="hero-emphasis">Until it shouldn't be.</span>
          </h1>

          <p className="hero-desc">
            Researchers submit vulnerability severity as ciphertext. Only the protocol
            owner can decrypt it — until an outcome is reached, or seven days pass and
            it reveals on its own.
          </p>

          <div className="hero-actions">
            <button className="btn-primary" onClick={connectWallet}>Launch app →</button>
            <a
              className="btn-secondary"
              href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}#code`}
              target="_blank"
              rel="noreferrer"
            >
              View contract
            </a>
          </div>
        </div>

        <ScrollReveal>
          <div className="stats-bar">
            <div className="stat-item">
              <div className="stat-value">▓▓▓</div>
              <div className="stat-label">Encrypted</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">7d</div>
              <div className="stat-label">Auto-reveal</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">1–4</div>
              <div className="stat-label">Severity</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">1</div>
              <div className="stat-label">Contract</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">0</div>
              <div className="stat-label">Intermediaries</div>
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="how-it-works">
            <div className="step-card">
              <div className="step-number">01</div>
              <div className="step-title">Submit</div>
              <div className="step-desc">
                Researcher encrypts a severity score (1–4) client-side and submits it
                on-chain alongside a hash of the full report.
              </div>
            </div>
            <div className="step-card">
              <div className="step-number">02</div>
              <div className="step-title">Owner decides</div>
              <div className="step-desc">
                Only the protocol owner can decrypt the score. They approve and pay,
                or reject with a mandatory public reason.
              </div>
            </div>
            <div className="step-card">
              <div className="step-number">03</div>
              <div className="step-title">Reveal or payout</div>
              <div className="step-desc">
                If nothing happens within 7 days, the severity reveals publicly.
                No pause, no exceptions — the deadline is trustless.
              </div>
            </div>
          </div>
        </ScrollReveal>

        <Footer />
      </div>
    );
  }

  // ─── APP VIEW ────────────────────────────────────────────

  return (
    <div className="app-shell">
      <nav className="nav">
        <div className="logo"><span className="amber">▓</span>redact</div>
        <div className="wallet-badge">
          {address?.slice(0, 6)}..{address?.slice(-4)}
        </div>
      </nav>

      {statusMsg && <div className="status-bar">{statusMsg}</div>}

      {wrongNetwork && (
        <div className="status-bar" style={{ borderColor: "rgba(184, 92, 92, 0.3)", color: "#B85C5C", background: "rgba(184, 92, 92, 0.04)" }}>
          Wrong network —{" "}
          <button
            onClick={switchToSepolia}
            style={{
              background: "transparent",
              border: "none",
              color: "#B85C5C",
              textDecoration: "underline",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: "inherit",
              padding: 0,
            }}
          >
            switch to Sepolia
          </button>
        </div>
      )}

      <div className="app-tabs">
        <button
          className={`app-tab ${activeTab === "submit" ? "active" : ""}`}
          onClick={() => setActiveTab("submit")}
        >
          Submit
        </button>
        <button
          className={`app-tab ${activeTab === "reports" ? "active" : ""}`}
          onClick={() => setActiveTab("reports")}
        >
          Reports {reports.length > 0 && `(${reports.length})`}
        </button>
      </div>

      {activeTab === "submit" && (
        <div className="submit-card">
          <div className="card-label">Submit a finding</div>
          <div className="severity-picker">
            {[1, 2, 3, 4].map((s) => (
              <button
                key={s}
                className={`severity-btn ${severity === s ? "selected" : ""}`}
                onClick={() => setSeverity(s)}
              >
                {s} {["", "low", "med", "high", "crit"][s]}
              </button>
            ))}
          </div>
          <input
            className="hash-input"
            placeholder="Report reference (link, IPFS CID, or free text)"
            value={descHash}
            onChange={(e) => setDescHash(e.target.value)}
          />
          <button
            className="btn-primary full-width"
            onClick={handleSubmit}
            disabled={submitting || wrongNetwork}
          >
            {wrongNetwork ? "Switch to Sepolia" : submitting ? "Submitting..." : "Encrypt and submit"}
          </button>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="reports-section">
          <div className="card-label">Reports {loading && "· loading..."}</div>
          {reports.length === 0 && !loading && (
            <div className="empty-state">No reports yet.</div>
          )}
          {reports.map((r) => (
            <ReportRow
              key={r.id}
              report={r}
              isOwner={isOwner}
              isResearcher={r.researcher.toLowerCase() === address?.toLowerCase()}
              onApprove={handleApprove}
              onReject={handleReject}
              onReveal={handleReveal}
              onDispute={handleDispute}
            />
          ))}
        </div>
      )}

      <Footer />
    </div>
  );
}

// ─── Report Row ────────────────────────────────────────────

function ReportRow({
  report,
  isOwner,
  isResearcher,
  onApprove,
  onReject,
  onReveal,
  onDispute,
}: {
  report: Report;
  isOwner: boolean;
  isResearcher: boolean;
  onApprove: (id: number, eth: string) => void;
  onReject: (id: number, reason: string) => void;
  onReveal: (id: number) => void;
  onDispute: (id: number) => void;
}) {
  const [reason, setReason] = useState("");
  const [payAmount, setPayAmount] = useState("0.01");
  const [expanded, setExpanded] = useState(false);

  const statusColor = ["#C9A227", "#4A9E7C", "#B85C5C", "#4A7C9E"][report.status];
  const canReveal =
    report.status === 0 &&
    Date.now() / 1000 - report.submittedAt >= 7 * 24 * 60 * 60;

  return (
    <div className="report-row" onClick={() => setExpanded(!expanded)}>
      <div className="report-summary">
        <div>
          <div className="report-id">#{String(report.id).padStart(4, "0")}</div>
          <div className="report-meta">
            {new Date(report.submittedAt * 1000).toLocaleDateString()}
            {report.disputeCount > 0 && ` · disputed ×${report.disputeCount}`}
          </div>
        </div>
        <div className="report-status" style={{ color: statusColor }}>
          {report.status === 0 ? "▓ locked" : STATUS_LABELS[report.status].toLowerCase()}
        </div>
      </div>

      {expanded && (
        <div className="report-detail" onClick={(e) => e.stopPropagation()}>
          <div className="detail-row">researcher: {report.researcher}</div>
          {report.status === 2 && (
            <div className="detail-row">reason: {report.rejectionReason}</div>
          )}

          {isOwner && report.status === 0 && (
            <div className="owner-controls">
              <input
                className="mini-input"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="ETH amount"
              />
              <button className="btn-mini approve" onClick={() => onApprove(report.id, payAmount)}>
                Approve
              </button>
              <input
                className="mini-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Rejection reason"
              />
              <button className="btn-mini reject" onClick={() => onReject(report.id, reason)}>
                Reject
              </button>
            </div>
          )}

          {canReveal && (
            <button className="btn-mini reveal" onClick={() => onReveal(report.id)}>
              Reveal (deadline passed)
            </button>
          )}

          {isResearcher && report.status === 2 && (
            <button className="btn-mini dispute" onClick={() => onDispute(report.id)}>
              Flag as bad-faith rejection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Footer ────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="logo"><span className="amber">▓</span>redact</div>
          <p className="footer-tagline">
            Confidential vulnerability disclosure on FHEVM. Severity stays encrypted
            until an outcome is reached, or seven days force a public reveal.
          </p>
          <div className="footer-chip">Sepolia · Live</div>
        </div>

        <div className="footer-column">
          <h4>Product</h4>
          <ul>
            <li><a href="#how">How it works</a></li>
            <li><a href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}#code`} target="_blank" rel="noreferrer">Contract</a></li>
            <li><a href="https://github.com/0xpenn/confidential-audit-disclosure" target="_blank" rel="noreferrer">GitHub</a></li>
          </ul>
        </div>

        <div className="footer-column">
          <h4>Protocol</h4>
          <ul>
            <li><a href="https://www.zama.org/" target="_blank" rel="noreferrer">Zama Protocol</a></li>
            <li><a href="https://docs.zama.org/" target="_blank" rel="noreferrer">FHEVM Docs</a></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© 2026 Redact · Built on the Zama Protocol</span>
        <span>Severity encrypted end-to-end</span>
      </div>
    </footer>
  );
}

export default App;
