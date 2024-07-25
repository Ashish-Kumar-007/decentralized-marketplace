const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DecentralizedMarketplace", function () {
  let marketplace;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let addr4;
  let addr5;

  before(async function () {
    marketplace = await ethers.deployContract("DecentralizedMarketplace");
    [owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
    marketplace.waitForDeployment();
  });

  describe("Product Listing", function () {
    it("should allow a user to list a product and emit event", async function () {
await expect (     marketplace
        .connect(addr1)
        .listProduct("Product 1", ethers.parseEther("1"), 10)).to.emit(marketplace, "ProductListed")
        .withArgs(
          1,
          addr1.address,
          "Product 1",
          ethers.parseEther("1"),
          10
        );
      const product = await marketplace.products(1);
      expect(product.name).to.equal("Product 1");
      expect(product.price).to.equal(ethers.parseEther("1"));
      expect(product.quantity).to.equal(10);
    });
    it("should fail to list a product with invalid price", async function () {
        await expect(marketplace.connect(addr1).listProduct("Product1", 0, 10)).to.be.revertedWith("Not valid Price");
    });

    it("should fail to list a product with invalid quantity", async function () {
        await expect(marketplace.connect(addr1).listProduct("Product1", ethers.parseEther("1"), 0)).to.be.revertedWith("Not valid Quantity");
    });

  });

  describe("Product Purchase", function () {
    it("should allow a user to purchase a product", async function () {
      await marketplace
        .connect(addr2)
        .purchaseProduct(1, { value: ethers.parseEther("1") });
        
        let _purchaseId;

        const filter = marketplace.filters.ProductPurchased();
        console.log(typeof filter, filter.preparedTopicFilter)
        const inputs = filter.preparedTopicFilter.fragment.inputs;

// Logging the inputs
inputs.forEach((input, index) => {
  console.log(`Input ${index + 1}:`);
  console.log(`  Name: ${input.name}`);
  console.log(`  Type: ${input.type}`);
});
      const escrow = await marketplace.escrows(_purchaseId);
      expect(escrow.amount).to.equal(ethers.parseEther("1"));
      expect(escrow.buyer).to.equal(addr2.address);
      expect(escrow.seller).to.equal(addr1.address);
    });

    it("should decrease the product quantity", async function () {
      await marketplace
        .connect(addr2)
        .purchaseProduct(1, { value: ethers.parseEther("1") });
      const product = await marketplace.products(1);
      expect(product.quantity).to.equal(8);
    });

    it("should emit a ProductPurchased event", async function () {
      await expect(
        marketplace
          .connect(addr2)
          .purchaseProduct(1, { value: ethers.parseEther("1") })
      )
        .to.emit(marketplace, "ProductPurchased")
        .withArgs(1, 1, addr2.address, ethers.parseEther("1"));
    });

    it("should not allow the buyer to purchase their own product", async function () {
      await expect(
        marketplace
          .connect(addr1)
          .purchaseProduct(1, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Can't purchase own product");
    });

    it("should require the buyer to send the correct amount", async function () {
      await expect(
        marketplace
          .connect(addr2)
          .purchaseProduct(1, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Incorrect value sent.");
    });

    it("should not allow purchase if product is out of stock", async function () {
      await marketplace
        .connect(addr1)
        .listProduct("Product 2", ethers.parseEther("1"), 1);
      await marketplace
        .connect(addr2)
        .purchaseProduct(2, { value: ethers.parseEther("1") });
      await expect(
        marketplace
          .connect(addr3)
          .purchaseProduct(2, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Out of stock.");
    });
  });

  describe("Confirm Delivery", function () {
    it("should allow the buyer to confirm delivery", async function () {
      await marketplace.connect(addr2).confirmDelivery(1);
      const escrow = await marketplace.escrows(1);
      expect(escrow.released).to.be.true;
    });

    it("should transfer funds to the seller", async function () {
      await expect(() =>
        marketplace.connect(addr2).confirmDelivery(1)
      ).to.changeEtherBalances(
        [addr2, addr1],
        [ethers.parseEther("-1"), ethers.parseEther("1")]
      );
    });

    it("should emit a DeliveryConfirmed event", async function () {
      await expect(marketplace.connect(addr2).confirmDelivery(1))
        .to.emit(marketplace, "DeliveryConfirmed")
        .withArgs(1, addr1.address, ethers.parseEther("1"));
    });

    it("should update the seller's reputation positively", async function () {
      await marketplace.connect(addr2).confirmDelivery(1);
      const reputation = await marketplace.reputations(addr1.address);
      expect(reputation.positiveReviews).to.equal(1);
    });
  });

  describe("Dispute Order", function () {

    it("should allow the buyer to dispute an order", async function () {
      await marketplace.connect(addr2).disputeOrder(1);
      const escrow = await marketplace.escrows(1);
      expect(escrow.disputed).to.be.true;
    });

    it("should create a dispute with arbitrators", async function () {
      await marketplace.connect(addr2).disputeOrder(1);
      const dispute = await marketplace.disputes(1);
      expect(dispute.arbitrators.length).to.equal(3);
    });

    it("should emit an OrderDisputed event", async function () {
      await expect(marketplace.connect(addr2).disputeOrder(1))
        .to.emit(marketplace, "OrderDisputed")
        .withArgs(1, addr2.address);
    });
  });

  describe("Resolve Dispute", function () {

    it("should allow an arbitrator to vote to resolve a dispute", async function () {
      const dispute = await marketplace.disputes(1);
      await marketplace.connect(dispute.arbitrators[0]).resolveDispute(1, true);
      const updatedDispute = await marketplace.disputes(1);
      expect(updatedDispute.buyerVotes).to.equal(1);
    });

    it("should transfer funds to the buyer if they win", async function () {
      const dispute = await marketplace.disputes(1);
      await marketplace.connect(dispute.arbitrators[0]).resolveDispute(1, true);
      await marketplace.connect(dispute.arbitrators[1]).resolveDispute(1, true);
      await expect(() =>
        marketplace.connect(dispute.arbitrators[2]).resolveDispute(1, true)
      ).to.changeEtherBalances(
        [addr2, addr1],
        [ethers.parseEther("1"), ethers.parseEther("-1")]
      );
    });

    it("should update the seller's reputation negatively if buyer wins", async function () {
      const dispute = await marketplace.disputes(1);
      await marketplace.connect(dispute.arbitrators[0]).resolveDispute(1, true);
      await marketplace.connect(dispute.arbitrators[1]).resolveDispute(1, true);
      await marketplace.connect(dispute.arbitrators[2]).resolveDispute(1, true);
      const reputation = await marketplace.reputations(addr1.address);
      expect(reputation.negativeReviews).to.equal(1);
    });

    it("should transfer funds to the seller if they win", async function () {
      const dispute = await marketplace.disputes(1);
      await marketplace
        .connect(dispute.arbitrators[0])
        .resolveDispute(1, false);
      await marketplace
        .connect(dispute.arbitrators[1])
        .resolveDispute(1, false);
      await expect(() =>
        marketplace.connect(dispute.arbitrators[2]).resolveDispute(1, false)
      ).to.changeEtherBalances(
        [addr2, addr1],
        [ethers.parseEther("-1"), ethers.parseEther("1")]
      );
    });

    it("should update the buyer's reputation negatively if seller wins", async function () {
      const dispute = await marketplace.disputes(1);
      await marketplace
        .connect(dispute.arbitrators[0])
        .resolveDispute(1, false);
      await marketplace
        .connect(dispute.arbitrators[1])
        .resolveDispute(1, false);
      await marketplace
        .connect(dispute.arbitrators[2])
        .resolveDispute(1, false);
      const reputation = await marketplace.reputations(addr2.address);
      expect(reputation.negativeReviews).to.equal(1);
    });

    it("should emit a DisputeResolved event", async function () {
      const dispute = await marketplace.disputes(1);
      await marketplace.connect(dispute.arbitrators[0]).resolveDispute(1, true);
      await marketplace.connect(dispute.arbitrators[1]).resolveDispute(1, true);
      await expect(
        marketplace.connect(dispute.arbitrators[2]).resolveDispute(1, true)
      )
        .to.emit(marketplace, "DisputeResolved")
        .withArgs(1, addr2.address, true);
    });
  });

  describe("Reputation System", function () {

    it("should update reputation negatively after losing a dispute", async function () {
      await marketplace
        .connect(addr1)
        .listProduct("Product 1", ethers.parseEther("1"), 10);
      await marketplace
        .connect(addr2)
        .purchaseProduct(1, { value: ethers.parseEther("1") });
      await marketplace.connect(addr2).disputeOrder(1);
      const dispute = await marketplace.disputes(1);
      await marketplace.connect(dispute.arbitrators[0]).resolveDispute(1, true);
      await marketplace.connect(dispute.arbitrators[1]).resolveDispute(1, true);
      await marketplace.connect(dispute.arbitrators[2]).resolveDispute(1, true);
      const reputation = await marketplace.reputations(addr1.address);
      expect(reputation.negativeReviews).to.equal(1);
    });
  });
});
