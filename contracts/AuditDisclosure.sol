// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title AuditDisclosure
/// @notice Confidential vulnerability disclosure with FHE-encrypted severity scores
/// @dev Severity scale: 1=Low, 2=Medium, 3=High, 4=Critical
contract AuditDisclosure is ZamaEthereumConfig {

    // ── State machine ──────────────────────────────────────────────
    enum Status { Pending, Approved, Rejected, Revealed }

    // ── Report struct ──────────────────────────────────────────────
    struct Report {
        address researcher;
        euint8  encSeverity;
        bytes32 descriptionHash;
        Status  status;
        uint256 submittedAt;
        string  rejectionReason;
        uint256 disputeCount;
        bool    revealed;
    }

    // ── Storage ────────────────────────────────────────────────────
    address public owner;
    uint256 public constant DEADLINE = 7 days;
    uint256 public reportCount;
    mapping(uint256 => Report) public reports;

    // ── Events ─────────────────────────────────────────────────────
    event ReportSubmitted(uint256 indexed reportId, address indexed researcher);
    event ReportApproved(uint256 indexed reportId, uint256 payment);
    event ReportRejected(uint256 indexed reportId, string reason);
    event ReportRevealed(uint256 indexed reportId);
    event ReportDisputed(uint256 indexed reportId, uint256 disputeCount);

    // ── Modifiers ──────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier reportExists(uint256 reportId) {
        require(reportId < reportCount, "Report does not exist");
        _;
    }

    modifier onlyPending(uint256 reportId) {
        require(reports[reportId].status == Status.Pending, "Report not pending");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ── submit() ───────────────────────────────────────────────────
    // inputProof is a ZK proof verifying the researcher knows the plaintext
    // severity without revealing it — required by FHEVM to prevent replay attacks.
    // externalEuint8 has no data location specifier — it is a value type.
    function submit(
        externalEuint8 encryptedSeverity,
        bytes calldata inputProof,
        bytes32 descriptionHash
    ) external {
        euint8 severity = FHE.fromExternal(encryptedSeverity, inputProof);
        FHE.allow(severity, owner);
        FHE.allow(severity, address(this));

        uint256 reportId = reportCount++;
        reports[reportId] = Report({
            researcher:      msg.sender,
            encSeverity:     severity,
            descriptionHash: descriptionHash,
            status:          Status.Pending,
            submittedAt:     block.timestamp,
            rejectionReason: "",
            disputeCount:    0,
            revealed:        false
        });

        emit ReportSubmitted(reportId, msg.sender);
    }

    // ── approve() ──────────────────────────────────────────────────
    // Owner approves finding and pays researcher in ETH.
    // msg.value must match the intended payment.
    function approve(uint256 reportId)
        external
        payable
        onlyOwner
        reportExists(reportId)
        onlyPending(reportId)
    {
        Report storage r = reports[reportId];
        r.status = Status.Approved;

        (bool sent, ) = r.researcher.call{value: msg.value}("");
        require(sent, "Payment failed");

        emit ReportApproved(reportId, msg.value);
    }

    // ── reject() ───────────────────────────────────────────────────
    // Owner rejects with a mandatory public reason — permanent on-chain accountability.
    // Empty reason string is blocked — owner cannot silently reject.
    function reject(uint256 reportId, string calldata reason)
        external
        onlyOwner
        reportExists(reportId)
        onlyPending(reportId)
    {
        require(bytes(reason).length > 0, "Rejection reason required");

        Report storage r = reports[reportId];
        r.status = Status.Rejected;
        r.rejectionReason = reason;

        emit ReportRejected(reportId, reason);
    }

    // ── reveal() ───────────────────────────────────────────────────
    // Anyone can call this after 7 days — trustless enforcement.
    // makePubliclyDecryptable() returns the updated handle — must reassign.
    // Verified against installed FHE.sol line 8919.
    function reveal(uint256 reportId)
        external
        reportExists(reportId)
        onlyPending(reportId)
    {
        Report storage r = reports[reportId];
        require(
            block.timestamp >= r.submittedAt + DEADLINE,
            "Deadline not reached"
        );

        r.status = Status.Revealed;
        r.revealed = true;
        r.encSeverity = FHE.makePubliclyDecryptable(r.encSeverity);

        emit ReportRevealed(reportId);
    }

    // ── dispute() ──────────────────────────────────────────────────
    // Researcher flags bad-faith rejection. Public counter only — no arbitration.
    // Only the original researcher can dispute their own report.
    function dispute(uint256 reportId)
        external
        reportExists(reportId)
    {
        Report storage r = reports[reportId];
        require(msg.sender == r.researcher, "Not your report");
        require(r.status == Status.Rejected, "Can only dispute rejections");

        r.disputeCount++;
        emit ReportDisputed(reportId, r.disputeCount);
    }

    // ── View helpers ───────────────────────────────────────────────
    function getStatus(uint256 reportId)
        external
        view
        reportExists(reportId)
        returns (Status)
    {
        return reports[reportId].status;
    }

    function getRejectionReason(uint256 reportId)
        external
        view
        reportExists(reportId)
        returns (string memory)
    {
        return reports[reportId].rejectionReason;
    }

    function isDeadlinePassed(uint256 reportId)
        external
        view
        reportExists(reportId)
        returns (bool)
    {
        return block.timestamp >= reports[reportId].submittedAt + DEADLINE;
    }
}
