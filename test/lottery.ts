import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { min } from "hardhat/internal/util/bigint";
import { zeroOutAddresses } from "hardhat/internal/hardhat-network/stack-traces/library-utils";

describe("Lottery", function() {
  let owner: any;
  let buyer: any;
  let buyer_second: any;
  let usdt: any;
  let lottery: any;

  beforeEach(async function() {
    [owner, buyer, buyer_second] = await ethers.getSigners();
    const name = "USDT";
    const symbol = "USD";

    const coin = await ethers.getContractFactory("mockErc20");
    const coinDeploy = await coin.deploy(name, symbol);
    usdt = await coinDeploy.deployed();
    await coinDeploy.deployed();

    const lotteryFactory = await ethers.getContractFactory("Lottery");
    const chainlinkId = 2961;
    const chainlinkSubscription = "0x6A2AAd07396B36Fe02a22b33cf443582f682c82f";
    const price = "50000000000000000";
    const duration = 3600;
    const amountForWallet = 10;
    const amountMax = 20;
    const lotteryDeployed = await lotteryFactory.deploy(chainlinkId, duration, price, amountForWallet, amountMax, usdt.address, owner.address, chainlinkSubscription);

    lottery = await lotteryDeployed.deployed();
    await lotteryDeployed.deployed();
  });

  it("change operator", async function() {
    const changeOperator = await lottery.setOperator(buyer.address);
    await expect(changeOperator).to.emit(lottery, "NewOperator").withArgs(buyer.address);
    await changeOperator.wait();
    const newOperator = await lottery.operator();
    expect(buyer.address).to.be.eq(newOperator);
  });
  it("change operator zero", async function() {
    const changeOperatorZero = lottery.setOperator(ethers.constants.AddressZero);
    await expect(changeOperatorZero).to.be.revertedWith("zero address");
  });

  it("change coin", async function() {
    const changeCoin = await lottery.setCoin(buyer.address);
    await expect(changeCoin).to.emit(lottery, "NewCoin").withArgs(buyer.address);
    await changeCoin.wait();
    const newCoin = await lottery.usdt();
    expect(buyer.address).to.be.eq(newCoin);
  });

  it("change coin zero", async function() {
    const changeCoinZero = lottery.setCoin(ethers.constants.AddressZero);
    await expect(changeCoinZero).to.be.revertedWith("zero address");
  });

  it("change treasury", async function() {
    const changeTreasury = await lottery.setTreasury(buyer.address);
    await expect(changeTreasury).to.emit(lottery, "NewTreasury").withArgs(buyer.address);
    await changeTreasury.wait();
    const newTreasury = await lottery.treasury();
    expect(buyer.address).to.be.eq(newTreasury);
  });

  it("change treasury zero", async function() {
    const changeTreasuryZero = lottery.setTreasury(ethers.constants.AddressZero);
    await expect(changeTreasuryZero).to.be.revertedWith("zero address");
  });

  describe("buyTickets", async function() {

    it("purchase tickets", async function() {
      await usdt.mint(buyer.address, ethers.utils.parseEther("5"));
      await usdt.connect(buyer).approve(lottery.address, ethers.utils.parseEther("5"));
      const buy = await lottery.connect(buyer).buyTickets(1);
      await buy.wait();
      const id = await lottery.currentId();
      const tickets = await lottery.walletWithIdToAmount(buyer.address, id);
      expect(tickets).to.be.eq("1");
    });

    it("purchase tickets without balance", async function() {
      await usdt.mint(buyer.address, ethers.utils.parseEther("5"));
      await usdt.connect(buyer).approve(lottery.address, ethers.utils.parseEther("5"));
      const buy = lottery.connect(buyer).buyTickets(1);
      expect(buy).to.be.revertedWith("not enough balance");
    });

    it("purchase of tickets over 50%", async function() {
      await usdt.mint(owner.address, ethers.utils.parseEther("5"));
      await usdt.connect(owner).approve(lottery.address, ethers.utils.parseEther("5"));
      const buy = lottery.connect(owner).buyTickets(11);
      await expect(buy).to.be.revertedWith("only 50% buy tickets");
    });

    it("purchase of tickets when it's lottery already expired", async function() {
      await usdt.mint(owner.address, ethers.utils.parseEther("5"));
      await usdt.connect(owner).approve(lottery.address, ethers.utils.parseEther("5"));
      await ethers.provider.send("evm_increaseTime", [1 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      const buy = lottery.connect(owner).buyTickets(1);
      await expect(buy).to.be.revertedWith("end lottery wait");
    });

    it("purchase max tickets", async function() {
      await usdt.mint(buyer.address, ethers.utils.parseEther("5"));
      await usdt.mint(owner.address, ethers.utils.parseEther("5"));
      await usdt.mint(buyer_second.address, ethers.utils.parseEther("5"));
      await usdt.connect(buyer).approve(lottery.address, ethers.utils.parseEther("5"));
      await usdt.connect(owner).approve(lottery.address, ethers.utils.parseEther("5"));
      await usdt.connect(buyer_second).approve(lottery.address, ethers.utils.parseEther("5"));
      await (await lottery.connect(buyer).buyTickets(10)).wait();
      await (await lottery.connect(buyer_second).buyTickets(10)).wait();
      const buy = lottery.connect(owner).buyTickets(1);
      await expect(buy).to.be.revertedWith("max tickets");
    });
  });

  describe("endLottery", async function() {
    beforeEach(async function() {
      await usdt.mint(buyer.address, ethers.utils.parseEther("5"));
      await usdt.mint(owner.address, ethers.utils.parseEther("5"));
      await usdt.mint(buyer_second.address, ethers.utils.parseEther("5"));
      await usdt.connect(buyer).approve(lottery.address, ethers.utils.parseEther("5"));
      await usdt.connect(owner).approve(lottery.address, ethers.utils.parseEther("5"));
      await usdt.connect(buyer_second).approve(lottery.address, ethers.utils.parseEther("5"));
    });

    it("end Lottery where not ended", async function() {
      const end = lottery.connect(owner).endLottery();
      await expect(end).to.be.revertedWith("not ended");
    });
    it("end Lottery where not owner", async function() {
      await ethers.provider.send("evm_increaseTime", [1 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      const end = lottery.connect(buyer_second).endLottery();
      await expect(end).to.be.revertedWith("not owner");
    });
  });
});
