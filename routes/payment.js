const express = require("express");
const router = express.Router();

const {
    createOrder,
    verifyPayment,
    checkPurchase // <-- Add kiya
} = require("../controllers/paymentController");

router.post("/check-purchase", checkPurchase); // <-- Naya Route
router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);

module.exports = router;