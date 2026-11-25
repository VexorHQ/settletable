// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// MockUSDC — token settlement cadangan untuk demo Lunas di HSK testnet.
// ERC-20 6 desimal (seperti USDC) + EIP-3009 transferWithAuthorization.
// BUKAN uang sungguhan: mint terbuka untuk siapa saja, testnet saja.
// Jangan pernah deploy kontrak ini ke mainnet — di mainnet pakai USDC HSP
// (testnet 133: 0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6, lihat RESEARCH.md §3).
//
// Ditulis tanpa OpenZeppelin (tidak terpasang di repo) — ERC-20 + EIP-712
// di sini minimal dan sengaja mudah dibaca; jangan tambah fitur.

contract MockUSDC {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    function domainSeparator() public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256(bytes(name)),
                    keccak256(bytes("1")),
                    block.chainid,
                    address(this)
                )
            );
    }

    // Mint terbuka — cuma buat demo testnet. Siapa saja boleh mint untuk
    // dirinya sendiri; jumlahnya dibatasi per panggilan supaya tidak ada
    // yang tidak sengaja mencetak angka absurd di satu transaksi.
    function mint(address to, uint256 amount) external {
        require(to != address(0), "to zero");
        require(amount > 0 && amount <= 1_000_000_000_000, "amount out of range"); // maks 1 juta USDC
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance too low");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to zero");
        require(balanceOf[from] >= amount, "balance too low");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    // --- EIP-3009 ---

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _useAuthorization(
            from,
            keccak256(abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)),
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
        _transfer(from, to, value);
    }

    // Sama seperti di atas, tapi yang mengeksekusi harus si penerima (to).
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(msg.sender == to, "caller must be recipient");
        _useAuthorization(
            from,
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)),
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
        _transfer(from, to, value);
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 structHash = keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        address signer = _recover(structHash, v, r, s);
        require(signer == authorizer, "bad cancel signature");
        require(!authorizationState[authorizer][nonce], "nonce already used");
        authorizationState[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _useAuthorization(
        address from,
        bytes32 structHash,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        require(block.timestamp >= validAfter, "not yet valid");
        require(block.timestamp < validBefore, "expired");
        require(!authorizationState[from][nonce], "nonce already used");
        address signer = _recover(structHash, v, r, s);
        require(signer == from, "bad authorization signature");
        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
    }

    function _recover(bytes32 structHash, uint8 v, bytes32 r, bytes32 s) internal view returns (address) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "bad v");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "bad signature");
        return signer;
    }
}
