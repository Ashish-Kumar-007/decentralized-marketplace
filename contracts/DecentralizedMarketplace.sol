// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./library/ReentrancyGuard.sol";
import "./library/ArrayUtils.sol";

contract DecentralizedMarketplace is ReentrancyGuard {

    struct Product {
        address payable seller;
        string name;
        uint price;
        uint quantity;
        bool listed;
    }

    struct Escrow {
        uint productId;
        address payable buyer;
        address payable seller;
        uint amount;
        bool released;
        bool disputed;
    }

    struct Dispute {
        uint purchaseId;
        address[] arbitrators;
        uint8 buyerVotes;
        uint8 sellerVotes;
        bool resolved;
        address winner;
    }

    struct Reputation {
        uint positiveReviews;
        uint negativeReviews;
    }

    mapping(uint => Product) public products;
    mapping(address => uint[]) public sellers;
    mapping(uint => Escrow) public escrows;
    mapping(uint => Dispute) public disputes;
    mapping(address => Reputation) public reputations;
    uint public productCount;
    uint public disputeCount;
    address[] private users;

    // Define Events
    event ProductListed(uint productId, address indexed seller, string name, uint price, uint quantity);
    event ProductPurchased(uint productId, uint purchaseId, address indexed buyer, uint amount);
    event DeliveryConfirmed(uint purchaseId, address indexed seller, uint amount);
    event OrderDisputed(uint purchaseId, address indexed buyer);
    event DisputeResolved(uint disputeId, address indexed winner, bool inFavorOfBuyer);

    function beforeListing(string memory _name, uint _price, uint _quantity) internal pure {
        require(bytes(_name).length > 0, "Not valid Name");
        require(_price > 0, "Not valid Price");
        require(_quantity > 0, "Not valid Quantity");
    }

    function checkUniqueness(address _user) internal view returns(uint, bool) {
        return ArrayUtils.indexOf(users, _user);
    }

    function listProduct(string memory name, uint price, uint quantity) external {
        beforeListing(name, price, quantity);
        productCount++;
        products[productCount] = Product(payable(msg.sender), name, price, quantity, true);
        sellers[msg.sender].push(productCount);

        (, bool isPresent) = checkUniqueness(msg.sender);
        if(!isPresent){
          users.push(msg.sender);  
        }

        // Emit ProductListed event
        emit ProductListed(productCount, msg.sender, name, price, quantity);
    }

    function beforePurchase(uint productId) internal view {
        Product memory product = products[productId];
        require(product.seller != msg.sender, "Can't purchase own product");
        require(product.listed, "Product not listed.");
        require(msg.value == product.price, "Incorrect value sent.");
        require(product.quantity > 0, "Out of stock.");
    }

    function purchaseProduct(uint productId) public payable nonReentrant returns (uint){
        beforePurchase(productId);
        Product memory product = products[productId];


        uint purchaseId = uint(keccak256(abi.encodePacked(block.timestamp, msg.sender, productId)));
        escrows[purchaseId] = Escrow(productId, payable(msg.sender), payable(product.seller), msg.value, false, false);

        product.quantity -= 1;
        products[productId] = product;

        (, bool isPresent) = checkUniqueness(msg.sender);
        if(!isPresent){
          users.push(msg.sender);  
        }

        // Emit ProductPurchased event
        emit ProductPurchased(productId, purchaseId, msg.sender, msg.value);

        return productId;
    }

    function checkOrder(uint purchaseId) internal view {
        require(purchaseId > 0, "Invalid purchase ID.");
        Escrow storage escrow = escrows[purchaseId];
        require(msg.sender == escrow.buyer, "Only buyer can confirm delivery.");
        require(!escrow.released, "Funds already released.");
        require(!escrow.disputed, "Dispute in process.");
    }

    function confirmDelivery(uint purchaseId) public nonReentrant {
        checkOrder(purchaseId);
        Escrow storage escrow = escrows[purchaseId];

        (bool sent, ) = escrow.seller.call{value: escrow.amount}("");
        require(sent, "Failed to send Ether");

        escrow.released = true;
        updateReputation(escrow.seller, true);

        // Emit DeliveryConfirmed event
        emit DeliveryConfirmed(purchaseId, escrow.seller, escrow.amount);
    }

    function disputeOrder(uint purchaseId) public {
        checkOrder(purchaseId);
        Escrow storage escrow = escrows[purchaseId];

        escrow.disputed = true;
        disputeCount++;
        disputes[disputeCount] = Dispute(purchaseId, getArbitrators(purchaseId), 0, 0, false, address(0));

        // Emit OrderDisputed event
        emit OrderDisputed(purchaseId, msg.sender);
    }

    function resolveDispute(uint disputeId, bool inFavorOfBuyer) public {
        Dispute storage dispute = disputes[disputeId];
        require(isArbitrator(msg.sender, dispute.arbitrators), "Not an arbitrator.");
        require(!dispute.resolved, "Dispute already resolved.");

        if (inFavorOfBuyer) {
            dispute.buyerVotes++;
        } else {
            dispute.sellerVotes++;
        }

        Escrow storage escrow = escrows[dispute.purchaseId];
        if (dispute.buyerVotes == 2) {
            dispute.resolved = true;
            dispute.winner = escrow.buyer;
            (bool sent, ) = escrow.buyer.call{value: escrow.amount}("");
            require(sent, "Failed to send Ether");
            updateReputation(escrow.seller, false);
        } else if (dispute.sellerVotes == 2) {
            dispute.resolved = true;
            dispute.winner = escrow.seller;
            (bool sent, ) = escrow.seller.call{value: escrow.amount}("");
            require(sent, "Failed to send Ether");
            updateReputation(escrow.buyer, false);
        }

        // Emit DisputeResolved event
        emit DisputeResolved(disputeId, dispute.winner, inFavorOfBuyer);
    }

    function updateReputation(address user, bool positive) internal {
        if (positive) {
            reputations[user].positiveReviews++;
        } else {
            reputations[user].negativeReviews++;
        }
    }

    function getArbitrators(uint _purchaseId) internal view returns (address[] memory) {
        uint userCount = users.length;
        require(userCount >= 3, "Not enough users to select arbitrators");

        uint randomSeed = uint(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, msg.sender)));
        address[] memory randomUsers;
        Escrow memory escrow = escrows[_purchaseId];
        uint arbitratorCount = 0;

        // Track selected users using a fixed-size array
        address[3] memory selectedUsers;
        uint selectedCount = 0;

        while (arbitratorCount < 3) {
            uint index = randomSeed % userCount;
            randomSeed = uint(keccak256(abi.encodePacked(randomSeed)));

            address potentialArbitrator = users[index];

            // Check if potential arbitrator is not the buyer or seller and not already selected
            bool alreadySelected = false;
            for (uint i = 0; i < selectedCount; i++) {
                if (selectedUsers[i] == potentialArbitrator) {
                    alreadySelected = true;
                    break;
                }
            }

            if (!alreadySelected && potentialArbitrator != escrow.buyer && potentialArbitrator != escrow.seller) {
                randomUsers[arbitratorCount] = potentialArbitrator;
                selectedUsers[selectedCount] = potentialArbitrator;
                selectedCount++;
                arbitratorCount++;
            }
        }

        return randomUsers;
    }



    function isArbitrator(address user, address[] memory arbitrators) internal pure returns (bool) {
        for (uint i = 0; i < arbitrators.length; i++) {
            if (arbitrators[i] == user) {
                return true;
            }
        }
        return false;
    }
}