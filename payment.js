const express = require("express");
const router = express.Router();

const {
    createOrder,
    verifyPayment,
    checkPurchase,
    signup,
    login,
    resetPassword, // <-- Naya route
    getUserPurchases
} = require("../controllers/paymentController");

router.post("/signup", signup);
router.post("/login", login);
router.post("/reset-password", resetPassword); // <-- Naya route
router.post("/my-library", getUserPurchases);

router.post("/check-purchase", checkPurchase);
router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);

module.exports = router;