import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { AuditDisclosure, AuditDisclosure__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  owner: HardhatEthersSigner;
  researcher: HardhatEthersSigner;
  stranger: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("AuditDisclosure")) as AuditDisclosure__factory;
  const contract = (await factory.deploy()) as AuditDisclosure;
  const address = await contract.getAddress();
  return { contract, address };
}

// Encrypt a uint8 severity score on behalf of the researcher
async function encryptSeverity(
  contractAddress: string,
  signer: HardhatEthersSigner,
  severity: number
) {
  return fhevm
    .createEncryptedInput(contractAddress, signer.address)
    .add8(severity)
    .encrypt();
}

describe("AuditDisclosure", function () {
  let signers: Signers;
  let contract: AuditDisclosure;
  let address: string;

  before(async function () {
    const all: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { owner: all[0], researcher: all[1], stranger: all[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Run against mock — Sepolia FHE tests use FHECounterSepolia.ts pattern");
      this.skip();
    }
    ({ contract, address } = await deployFixture());
  });

  // ── submit ──────────────────────────────────────────────────────

  it("researcher submits encrypted severity — reportCount increments", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 3);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("reentrancy in withdraw()"));

    const tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    expect(await contract.reportCount()).to.eq(1);
  });

  it("submitted report starts in Pending state", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 2);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("integer overflow in mint()"));

    const tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    // Status.Pending = 0
    expect(await contract.getStatus(0)).to.eq(0);
  });

  // ── approve ─────────────────────────────────────────────────────

  it("owner approves and researcher receives ETH", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 4);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("critical: price oracle manipulation"));

    let tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    const payment = ethers.parseEther("0.1");
    const balanceBefore = await ethers.provider.getBalance(signers.researcher.address);

    tx = await contract.connect(signers.owner).approve(0, { value: payment });
    await tx.wait();

    const balanceAfter = await ethers.provider.getBalance(signers.researcher.address);
    expect(balanceAfter - balanceBefore).to.eq(payment);

    // Status.Approved = 1
    expect(await contract.getStatus(0)).to.eq(1);
  });

  it("stranger cannot approve", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 2);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("access control missing"));

    let tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    await expect(
      contract.connect(signers.stranger).approve(0, { value: ethers.parseEther("0.1") })
    ).to.be.revertedWith("Not owner");
  });

  // ── reject ──────────────────────────────────────────────────────

  it("owner rejects with reason — stored on-chain permanently", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 1);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("low: gas optimization"));

    let tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    const reason = "Known issue, already patched in v2.1";
    tx = await contract.connect(signers.owner).reject(0, reason);
    await tx.wait();

    // Status.Rejected = 2
    expect(await contract.getStatus(0)).to.eq(2);
    expect(await contract.getRejectionReason(0)).to.eq(reason);
  });

  it("owner cannot reject with empty reason", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 1);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("low: gas optimization"));

    let tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    await expect(
      contract.connect(signers.owner).reject(0, "")
    ).to.be.revertedWith("Rejection reason required");
  });

  // ── dispute ─────────────────────────────────────────────────────

  it("researcher disputes bad-faith rejection — counter increments", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 3);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("reentrancy in stake()"));

    let tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    tx = await contract.connect(signers.owner).reject(0, "Out of scope");
    await tx.wait();

    tx = await contract.connect(signers.researcher).dispute(0);
    await tx.wait();

    const report = await contract.reports(0);
    expect(report.disputeCount).to.eq(1);
  });

  it("stranger cannot dispute someone else's report", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 3);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("reentrancy in stake()"));

    let tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    tx = await contract.connect(signers.owner).reject(0, "Out of scope");
    await tx.wait();

    await expect(
      contract.connect(signers.stranger).dispute(0)
    ).to.be.revertedWith("Not your report");
  });

  // ── reveal ──────────────────────────────────────────────────────

  it("reveal blocked before 7-day deadline", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 2);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("overflow in rewards calc"));

    const tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    await expect(
      contract.connect(signers.stranger).reveal(0)
    ).to.be.revertedWith("Deadline not reached");
  });

  it("anyone can reveal after deadline — status flips to Revealed", async function () {
    const enc = await encryptSeverity(address, signers.researcher, 2);
    const descHash = ethers.keccak256(ethers.toUtf8Bytes("overflow in rewards calc"));

    let tx = await contract
      .connect(signers.researcher)
      .submit(enc.handles[0], enc.inputProof, descHash);
    await tx.wait();

    // Fast-forward 7 days + 1 second
    await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);

    tx = await contract.connect(signers.stranger).reveal(0);
    await tx.wait();

    // Status.Revealed = 3
    expect(await contract.getStatus(0)).to.eq(3);

    const report = await contract.reports(0);
    expect(report.revealed).to.eq(true);
  });
});
