// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <=0.8.20;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract Lottery is VRFConsumerBaseV2, ConfirmedOwner {
	using SafeMath for uint256;
	VRFCoordinatorV2Interface private COORDINATOR;

	uint16 private constant requestConfirmations = 3;
	uint32 private constant numWords = 3;
	uint32 private constant callbackGasLimit = 300000;
	uint64 private s_subscriptionId;

	uint256 public maxTickets;
	uint256 public currentTickets;
	uint256 public endDate;
	uint256 public startDate;
	uint256 public duration;
	uint256 public maxTicketsForWallet;
	uint256 public currentId;
	uint256 public price;
	uint256 public percentageCommission;
	address public operator;
	address private usdt;
	address private treasury;

	bytes32 private constant keyHash =
	0xd4bb89654db74673a187bd804519e65e3f71a52bc55f11da7601a13dcf505314;

	struct RequestStatus {
		bool fulfilled;
		bool exists;
		uint256[] randomWords;
	}

	mapping(uint256 => RequestStatus) public s_requests;
	mapping(address => mapping(uint256 => uint256)) public walletWithIdToAmount;
	mapping(uint256 => bool) public lotteryIdToEnded;
	address[] private tickets;

	constructor(
		uint64 _subscriptionId,
		uint256 _duration,
		uint256 _price,
		uint256 _amountMaxForWallet,
		uint256 _amountMax,
		address _usdt,
		address _operator,
		address _vrfConsumer
	) VRFConsumerBaseV2(_vrfConsumer) ConfirmedOwner(msg.sender) {
		COORDINATOR = VRFCoordinatorV2Interface(_vrfConsumer);
		s_subscriptionId = _subscriptionId;
		currentId = 1;
		startDate = block.timestamp;
		endDate = block.timestamp + _duration;
		duration = _duration;
		price = _price;
		maxTicketsForWallet = _amountMaxForWallet;
		maxTickets = _amountMax;
		usdt = _usdt;
		operator = _operator;
		percentageCommission = 10;
	}

	function buyTickets(uint256 _amount) external {
		require(currentTickets + _amount <= maxTickets, "max tickets");
		require(endDate >= block.timestamp, "end lottery wait");
		require(
			walletWithIdToAmount[msg.sender][currentId] + _amount <=
			maxTicketsForWallet,
			"only 50% buy tickets"
		);
		uint256 commission = ((_amount * price) / 100) * percentageCommission;
		_safeTransferIn(usdt, msg.sender, (_amount * price) + commission);
		walletWithIdToAmount[msg.sender][currentId] += _amount;
		currentTickets += _amount;
		for (uint256 i = 0; i < _amount; i++) {
			tickets.push(msg.sender);
		}
	}

	function endLottery() external {
		require(
			currentTickets == maxTickets || endDate <= block.timestamp,
			"not ended"
		);
		require(msg.sender == operator || msg.sender == owner(), "not owner");
		if (currentTickets != maxTickets && endDate <= block.timestamp) {
			uint256 commission = (price / 100) * percentageCommission;
			for (uint256 i = 0; i < tickets.length; i++) {
				_safeTransferOut(usdt, tickets[i], price + commission);
			}
			_restartLottery();
		} else {
			uint256 requestId = COORDINATOR.requestRandomWords(
				keyHash,
				s_subscriptionId,
				requestConfirmations,
				callbackGasLimit,
				numWords
			);

			s_requests[requestId] = RequestStatus({
			randomWords: new uint256[](0),
			exists: true,
			fulfilled: false
			});
		}
	}

	function fulfillRandomWords(
		uint256 _requestId,
		uint256[] memory _randomWords
	) internal override {
		require(s_requests[_requestId].exists, "request not found");
		s_requests[_requestId].fulfilled = true;
		s_requests[_requestId].randomWords = _randomWords;
		uint256 value = tickets.length * price;
		uint256 commission = (value / 100) * percentageCommission;
		address firstWinner = tickets[(_randomWords[0] % tickets.length) + 0];
		address secondWinner = tickets[(_randomWords[1] % tickets.length) + 0];
		address thirdWinner = tickets[(_randomWords[2] % tickets.length) + 0];
		_safeTransferOut(usdt, firstWinner, (value / 100) * 80);
		_safeTransferOut(usdt, secondWinner, (value / 100) * 10);
		_safeTransferOut(usdt, thirdWinner, (value / 100) * 10);

		_safeTransferOut(usdt, treasury, commission);
		_restartLottery();
	}

	function _safeTransferIn(
		address _token,
		address _from,
		uint256 _amount
	) internal {
		IERC20 erc20 = IERC20(_token);
		uint256 balBefore = erc20.balanceOf(address(this));
		erc20.transferFrom(_from, address(this), _amount);
		require(
			erc20.balanceOf(address(this)).sub(balBefore) == _amount,
			"!transfer from"
		);
	}

	function _safeTransferOut(
		address _token,
		address _to,
		uint256 _amount
	) internal {
		IERC20 erc20 = IERC20(_token);
		erc20.transfer(_to, _amount);
	}

	function _restartLottery() internal {
		startDate = block.timestamp;
		endDate = block.timestamp + duration;
		tickets = new address[](0);
		lotteryIdToEnded[currentId] = true;
		currentTickets = 0;
		currentId++;
	}

	function setDuration(uint256 _duration) external onlyOwner {
		duration = _duration;
	}

	function setPrice(uint256 _cost) external onlyOwner {
		price = _cost;
	}

	function setMaxTickets(uint256 _amount) external onlyOwner {
		maxTickets = _amount;
	}

	function setMaxTicketsForWallet(uint256 _amount) external onlyOwner {
		maxTicketsForWallet = _amount;
	}

	function setOperator(address _operator) external onlyOwner {
		operator = _operator;
	}

	function setCoin(address _coin) external onlyOwner {
		usdt = _coin;
	}

	function setTreasury(address _treasury) external onlyOwner {
		treasury = _treasury;
	}

	function setCommission(uint256 _percentage) external onlyOwner {
		percentageCommission = _percentage;
	}
}
