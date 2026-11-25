// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ReceiptRegistry — catatan receipt settlement yang bisa dibaca manusia.
// Tidak memegang dana, tidak punya owner, tidak bisa di-upgrade. Satu receipt
// = satu pembayaran: mandate yang disetujui, siapa bayar siapa, token + jumlah,
// tx settlement, dan satu baris memo yang terbaca ("Ringkasan riset 5 sumber").
// Dashboard menampilkan receipt seperti dokumen tagihan; siapa saja bisa
// memverifikasi isinya lewat explorer tanpa harus percaya server SettleTable.
//
// Satu paymentId hanya boleh tercatat sekali — ini yang mencegah receipt
// ganda untuk pembayaran yang sama.

contract ReceiptRegistry {
    struct Receipt {
        bytes32 paymentId;
        address payer;
        address payee;
        address token;
        uint256 amount; // satuan terkecil token (USDC: 6 desimal)
        bytes32 mandateHash; // hash EIP-712 mandate yang disetujui
        bytes32 txHash; // tx settlement (hash tx yang mengeksekusi bayar)
        uint256 recordedAt; // block.timestamp saat receipt dicatat
        string memo; // baris deskripsi yang bisa dibaca manusia
    }

    bytes32[] private paymentIds;
    mapping(bytes32 => Receipt) private receipts;
    mapping(bytes32 => bool) public exists;
    mapping(address => bytes32[]) private byPayer;
    mapping(address => bytes32[]) private byPayee;

    event ReceiptRecorded(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed payee,
        address token,
        uint256 amount,
        bytes32 mandateHash,
        bytes32 txHash,
        string memo
    );

    error DuplicatePaymentId(bytes32 paymentId);
    error UnknownReceipt(bytes32 paymentId);
    error ZeroPaymentId();
    error ZeroAddress();
    error ZeroAmount();
    error MemoTooLong();

    function recordReceipt(
        bytes32 paymentId,
        address payer,
        address payee,
        address token,
        uint256 amount,
        bytes32 mandateHash,
        bytes32 txHash,
        string calldata memo
    ) external {
        if (paymentId == bytes32(0)) revert ZeroPaymentId();
        if (exists[paymentId]) revert DuplicatePaymentId(paymentId);
        if (payer == address(0) || payee == address(0) || token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (bytes(memo).length > 280) revert MemoTooLong();

        receipts[paymentId] = Receipt({
            paymentId: paymentId,
            payer: payer,
            payee: payee,
            token: token,
            amount: amount,
            mandateHash: mandateHash,
            txHash: txHash,
            recordedAt: block.timestamp,
            memo: memo
        });
        exists[paymentId] = true;
        paymentIds.push(paymentId);
        byPayer[payer].push(paymentId);
        byPayee[payee].push(paymentId);

        emit ReceiptRecorded(paymentId, payer, payee, token, amount, mandateHash, txHash, memo);
    }

    function getReceipt(bytes32 paymentId) public view returns (Receipt memory) {
        if (!exists[paymentId]) revert UnknownReceipt(paymentId);
        return receipts[paymentId];
    }

    function receiptCount() external view returns (uint256) {
        return paymentIds.length;
    }

    function receiptByIndex(uint256 index) external view returns (Receipt memory) {
        return getReceipt(paymentIds[index]);
    }

    function receiptsOfPayer(address payer) external view returns (Receipt[] memory) {
        bytes32[] memory ids = byPayer[payer];
        Receipt[] memory out = new Receipt[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = receipts[ids[i]];
        }
        return out;
    }

    function receiptsOfPayee(address payee) external view returns (Receipt[] memory) {
        bytes32[] memory ids = byPayee[payee];
        Receipt[] memory out = new Receipt[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = receipts[ids[i]];
        }
        return out;
    }

    // Teks receipt yang tampil seperti dokumen tagihan — dipakai dashboard
    // di halaman receipt. Angka waktu tetap unix timestamp; yang memformat
    // jadi tanggal adalah UI, bukan kontrak.
    function receiptText(bytes32 paymentId) external view returns (string memory) {
        Receipt memory receipt = getReceipt(paymentId);
        return
            string(
                abi.encodePacked(
                    "SETTLETABLE RECEIPT\n",
                    "payment: ",
                    _bytes32ToString(receipt.paymentId),
                    "\n",
                    "payer: ",
                    _addressToString(receipt.payer),
                    "\n",
                    "payee: ",
                    _addressToString(receipt.payee),
                    "\n",
                    "token: ",
                    _addressToString(receipt.token),
                    "\n",
                    "amount: ",
                    _uintToString(receipt.amount),
                    "\n",
                    "mandate: ",
                    _bytes32ToString(receipt.mandateHash),
                    "\n",
                    "tx: ",
                    _bytes32ToString(receipt.txHash),
                    "\n",
                    "recorded: ",
                    _uintToString(receipt.recordedAt),
                    "\n",
                    "memo: ",
                    receipt.memo
                )
            );
    }

    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _addressToString(address account) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        uint160 value = uint160(account);
        for (uint256 i = 41; i > 1; i--) {
            buffer[i] = alphabet[value & 0xf];
            value >>= 4;
        }
        return string(buffer);
    }

    function _bytes32ToString(bytes32 data) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory buffer = new bytes(66);
        buffer[0] = "0";
        buffer[1] = "x";
        uint256 value = uint256(data);
        for (uint256 i = 65; i > 1; i--) {
            buffer[i] = alphabet[value & 0xf];
            value >>= 4;
        }
        return string(buffer);
    }
}
