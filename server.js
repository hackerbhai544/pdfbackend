console.log("--- KEY CHECK ---");
console.log("Razorpay ID:", process.env.RAZORPAY_KEY_ID ? "Found" : "MISSING");
console.log("Supabase URL:", process.env.SUPABASE_URL ? "Found" : "MISSING");
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const paymentRoutes = require("./routes/payment");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/payment", paymentRoutes);

app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "PDF Backend Running 🚀"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});