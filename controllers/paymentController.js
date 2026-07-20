const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const supabase = require("../config/supabase");

// ============================
// CHECK PREVIOUS PURCHASE
// ============================
exports.checkPurchase = async (req, res) => {
    try {
        const { product_id, email } = req.body;

        if (!product_id || !email) {
            return res.status(400).json({ message: "Product ID and Email are required" });
        }

        // Fetch purchases for this email and product_id
        const { data: purchases, error: purchaseError } = await supabase
            .from("purchases")
            .select("*")
            .eq("email", email.trim().toLowerCase())
            .eq("product_id", product_id);

        if (purchaseError) {
            console.log("Purchase Error:", purchaseError);
            return res.status(500).json({ message: purchaseError.message });
        }

        // Agar user ne pehle se khareeda hua hai
        if (purchases && purchases.length > 0) {
            // Product ka pdf_name fetch karo
            const { data: product, error: productError } = await supabase
                .from("products")
                .select("pdf_name")
                .eq("id", product_id)
                .single();

            if (productError || !product) {
                return res.status(404).json({ message: "Product not found" });
            }

            // Direct download link generate karo
            const { data: storageData, error: storageError } = await supabase.storage
                .from("pdfs")
                .createSignedUrl(product.pdf_name, 120, { download: true });

            if (storageError) {
                return res.status(500).json({ message: storageError.message });
            }

            return res.json({
                alreadyPurchased: true,
                download_url: storageData.signedUrl
            });
        }

        // Agar nahi khareeda hai
        res.json({ alreadyPurchased: false });

    } catch (err) {
        console.log("Catch block error:", err);
        res.status(500).json({ message: err.message });
    }
};

// ============================
// CREATE ORDER
// ============================
exports.createOrder = async (req, res) => {
    try {

        const { product_id, email } = req.body;

        if (!product_id || !email) {
            return res.status(400).json({
                message: "Product ID and Email are required"
            });
        }

        // Product fetch from Supabase
        const { data: product, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", product_id)
            .single();

        if (error || !product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        // Razorpay Order
        const order = await razorpay.orders.create({
            amount: product.price * 100,
            currency: "INR",
            receipt: `receipt_${Date.now()}`
        });

        res.json({
            key: process.env.RAZORPAY_KEY_ID,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            description: product.name
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: err.message
        });

    }
};


// ============================
// VERIFY PAYMENT
// ============================
exports.verifyPayment = async (req, res) => {

    try {

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            product_id,
            email
        } = req.body;

        // Verify Signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {

            return res.status(400).json({
                message: "Invalid Signature"
            });

        }

        // Fetch Product
        const { data: product, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", product_id)
            .single();

        if (error || !product) {

            return res.status(404).json({
                message: "Product not found"
            });

        }

        // Save Purchase (Saved email in lowercase for exact match)
        await supabase
            .from("purchases")
            .insert([
                {
                    email: email.trim().toLowerCase(),
                    product_id,
                    payment_id: razorpay_payment_id,
                    order_id: razorpay_order_id,
                    amount: product.price
                }
            ]);

        // Signed URL
        const { data, error: storageError } = await supabase.storage
            .from("pdfs")
            .createSignedUrl(product.pdf_name, 120, {
                download: true
            });

        if (storageError) {

            return res.status(500).json({
                message: storageError.message
            });

        }

        res.json({
            success: true,
            download_url: data.signedUrl
        });

    } catch (err) {

        console.log(err);

        res.status(500).json({
            message: err.message
        });

    }

};
