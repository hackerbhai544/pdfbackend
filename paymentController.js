const razorpay = require("../config/razorpay");
const crypto = require("crypto");
const supabase = require("../config/supabase");

// ============================
// AUTHENTICATION (SIGNUP / LOGIN / RESET PASSWORD)
// ============================
exports.signup = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Check if user already exists
        const { data: existingUser } = await supabase
            .from("users")
            .select("*")
            .eq("email", cleanEmail)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({ message: "Account already exists! Please Login." });
        }

        // Insert new user
        const { data: newUser, error } = await supabase
            .from("users")
            .insert([{ email: cleanEmail, password: password }])
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, user: { email: newUser.email } });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const cleanEmail = email.trim().toLowerCase();

        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", cleanEmail)
            .eq("password", password)
            .maybeSingle();

        if (error || !user) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        res.json({ success: true, user: { email: user.email } });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: err.message });
    }
};

// --- NAYA FORGOT / RESET PASSWORD FUNCTION ---
exports.resetPassword = async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        if (!email || !newPassword) {
            return res.status(400).json({ message: "Email and new password are required" });
        }

        const cleanEmail = email.trim().toLowerCase();

        // Check if user exists
        const { data: user } = await supabase
            .from("users")
            .select("*")
            .eq("email", cleanEmail)
            .maybeSingle();

        if (!user) {
            return res.status(404).json({ message: "No account found with this email!" });
        }

        // Update password in Supabase
        const { error } = await supabase
            .from("users")
            .update({ password: newPassword })
            .eq("email", cleanEmail);

        if (error) throw error;

        res.json({ success: true, message: "Password updated successfully!" });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: err.message });
    }
};

// ============================
// FETCH ALL USER PURCHASES (MY LIBRARY)
// ============================
exports.getUserPurchases = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const cleanEmail = email.trim().toLowerCase();

        const { data: purchases, error } = await supabase
            .from("purchases")
            .select("*")
            .eq("email", cleanEmail);

        if (error) throw error;

        const library = await Promise.all(
            purchases.map(async (item) => {
                const { data: storageData } = await supabase.storage
                    .from("pdfs")
                    .createSignedUrl(item.pdf_name, 3600, { download: true });

                return {
                    pdf_name: item.pdf_name,
                    download_url: storageData ? storageData.signedUrl : null,
                    purchased_at: item.created_at || new Date()
                };
            })
        );

        res.json({ success: true, library });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: err.message });
    }
};

// ============================
// CHECK PREVIOUS PURCHASE
// ============================
exports.checkPurchase = async (req, res) => {
    try {
        const { product_id, email } = req.body;

        if (!product_id || !email) {
            return res.status(400).json({ message: "Product ID and Email are required" });
        }

        const { data: product, error: productError } = await supabase
            .from("products")
            .select("pdf_name")
            .eq("id", product_id)
            .single();

        if (productError || !product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const { data: purchases, error: purchaseError } = await supabase
            .from("purchases")
            .select("*")
            .eq("email", email.trim().toLowerCase())
            .eq("pdf_name", product.pdf_name);

        if (purchaseError) {
            return res.status(500).json({ message: purchaseError.message });
        }

        if (purchases && purchases.length > 0) {
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

        res.json({ alreadyPurchased: false });

    } catch (err) {
        console.log(err);
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
            return res.status(400).json({ message: "Product ID and Email are required" });
        }

        const { data: product, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", product_id)
            .single();

        if (error || !product) {
            return res.status(404).json({ message: "Product not found" });
        }

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
        res.status(500).json({ message: err.message });
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

        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: "Invalid Signature" });
        }

        const { data: product, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", product_id)
            .single();

        if (error || !product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const { error: insertError } = await supabase
            .from("purchases")
            .insert([
                {
                    email: email.trim().toLowerCase(),
                    payment_id: razorpay_payment_id,
                    order_id: razorpay_order_id,
                    pdf_name: product.pdf_name,
                    amount: product.price
                }
            ]);

        if (insertError) console.log("Supabase Insert Error:", insertError);

        const { data, error: storageError } = await supabase.storage
            .from("pdfs")
            .createSignedUrl(product.pdf_name, 120, { download: true });

        if (storageError) {
            return res.status(500).json({ message: storageError.message });
        }

        res.json({
            success: true,
            download_url: data.signedUrl
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: err.message });
    }
};