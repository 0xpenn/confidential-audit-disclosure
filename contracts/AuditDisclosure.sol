// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title AuditDisclosure
/// @author 0xpenn
/// @notice Confidential vulnerability disclosure — severity stays encrypted until
///         owner acts or the 7-day hard cutoff triggers a trustless public reveal.
/// @dev Severity scale: 1=Low 2=Medium 3=High 4=Critical (euint8, FHE-encrypted)
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

    // researcher => list of reportIds they submitted
    mapping(address => uint256[]) private reportsByResearcher;

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
    /// @notice Submit an encrypted severity score + off-chain report hash.
    /// @dev inputProof is a ZK proof binding the ciphertext to this sender —
    ///      prevents replay of someone else's encrypted input.
    /// @param encryptedSeverity FHE ciphertext of severity (1–4)
    /// @param inputProof ZK proof generated client-side via fhevm.js
    /// @param descriptionHash keccak256 of the off-chain report (IPFS CID or similar)
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

        reportsByResearcher[msg.sender].push(reportId);
        emit ReportSubmitted(reportId, msg.sender);
    }

    // ── approve() ──────────────────────────────────────────────────
    /// @notice Approve a finding and pay the researcher in ETH.
    /// @dev msg.value is forwarded directly — no escrow, no intermediary.
    /// @param reportId Target report
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
    /// @notice Reject a finding with a mandatory public reason.
    /// @dev Empty reason reverts — silent rejection isn't an option.
    /// @param reportId Target report
    /// @param reason Plaintext rejection rationale, permanent on-chain
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
    /// @notice Trigger public reveal after the 7-day deadline.
    /// @dev Callable by anyone — trustless enforcement, no owner involvement needed.
    ///      makePubliclyDecryptable() returns an updated handle, must reassign.
    /// @param reportId Target report
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
    /// @notice Flag a rejection as bad-faith. Public counter only — no arbitration.
    /// @param reportId Target report (must be in Rejected state)
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

    // ── getReport() ────────────────────────────────────────────────
    /// @notice Pull all metadata for a report in one call.
    /// @dev encSeverity intentionally excluded — raw euint8 handle is
    ///      meaningless to a caller without FHE decrypt access.
    /// @param reportId Target report
    function getReport(uint256 reportId)
        external
        view
        reportExists(reportId)
        returns (
            address researcher,
            bytes32 descriptionHash,
            Status  status,
            uint256 submittedAt,
            string memory rejectionReason,
            uint256 disputeCount,
            bool    revealed
        )
    {
        Report storage r = reports[reportId];
        return (
            r.researcher,
            r.descriptionHash,
            r.status,
            r.submittedAt,
            r.rejectionReason,
            r.disputeCount,
            r.revealed
        );
    }

    // ── getReportsByResearcher() ────────────────────────────────────
    /// @notice Returns all reportIds submitted by a given researcher.
    /// @dev Frontend uses this to populate a researcher's submission history.
    /// @param researcher Wallet address to query
    function getReportsByResearcher(address researcher)
        external
        view
        returns (uint256[] memory)
    {
        return reportsByResearcher[researcher];
    }

    // ── View helpers ───────────────────────────────────────────────
    /// @notice Current state machine position for a report.
    function getStatus(uint256 reportId)
        external
        view
        reportExists(reportId)
        returns (Status)
    {
        return reports[reportId].status;
    }

    /// @notice Rejection reason — empty string unless status is Rejected.
    function getRejectionReason(uint256 reportId)
        external
        view
        reportExists(reportId)
        returns (string memory)
    {
        return reports[reportId].rejectionReason;
    }

    /// @notice Returns true if the 7-day reveal window has passed.
    function isDeadlinePassed(uint256 reportId)
        external
        view
        reportExists(reportId)
        returns (bool)
    {
        return block.timestamp >= reports[reportId].submittedAt + DEADLINE;
    }
}
