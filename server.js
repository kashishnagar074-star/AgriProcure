
const express = require("express");
const path = require("path");
const pool = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const CURRENT_TOKEN = 24;
const MINUTES_PER_FARMER = 4;

// =====================================
// AUTHENTICATION
// =====================================

function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Please login first."
        });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            success: false,
            message: "JWT_SECRET is missing."
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: "Invalid or expired login."
            });
        }

        req.user = user;
        next();
    });
}

function requireOfficer(req, res, next) {
    if (!req.user || !["officer", "admin"].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: "Officer access required."
        });
    }
    next();
}

function requireFarmer(req, res, next) {
    if (!req.user || req.user.role !== "farmer") {
        return res.status(403).json({
            success: false,
            message: "Farmer access required."
        });
    }
    next();
}

// =====================================
// HOME AND TEST
// =====================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index22.html"));
});

app.get("/api/test", (req, res) => {
    res.json({
        success: true,
        message: "AgriProcure API is working."
    });
});

app.get("/api/route-check", (req, res) => {
    res.json({
        success: true,
        message: "Updated server is running."
    });
});

// =====================================
// REGISTER
// =====================================

app.post("/api/register", async (req, res) => {
    const { full_name, mobile, password } = req.body || {};

    if (!full_name || !mobile || !password) {
        return res.status(400).json({
            success: false,
            message: "All fields are required."
        });
    }

    if (!/^[0-9]{10}$/.test(String(mobile))) {
        return res.status(400).json({
            success: false,
            message: "Enter a valid 10-digit mobile number."
        });
    }

    if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Password must contain at least 8 characters."
        });
    }

    try {
        const hash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO users
             (full_name, mobile, password_hash, role)
             VALUES ($1, $2, $3, 'farmer')
             RETURNING id, full_name, mobile, role`,
            [full_name.trim(), mobile, hash]
        );

        const user = result.rows[0];

        const token = jwt.sign(
            {
                userId: user.id,
                mobile: user.mobile,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.status(201).json({
            success: true,
            message: "Registration successful.",
            user,
            token
        });

    } catch (error) {
        console.error("Registration error:", error);

        res.status(error.code === "23505" ? 409 : 500).json({
            success: false,
            message: error.code === "23505"
                ? "Mobile number already registered."
                : "Registration failed."
        });
    }
});

// =====================================
// LOGIN
// =====================================

app.post("/api/login", async (req, res) => {
    const { mobile, role, password } = req.body || {};

    if (!mobile || !role || !password) {
        return res.status(400).json({
            success: false,
            message: "Mobile, role and password are required."
        });
    }

    if (!["farmer", "officer", "admin"].includes(role)) {
        return res.status(400).json({
            success: false,
            message: "Invalid role."
        });
    }

    try {
        const result = await pool.query(
            `SELECT id, full_name, mobile, password_hash, role
             FROM users
             WHERE mobile = $1 AND role = $2`,
            [mobile, role]
        );

        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({
                success: false,
                message: "Invalid mobile number, role or password."
            });
        }

        const token = jwt.sign(
            {
                userId: user.id,
                mobile: user.mobile,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({
            success: true,
            message: "Login successful.",
            user: {
                id: user.id,
                name: user.full_name,
                mobile: user.mobile,
                role: user.role
            },
            token
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
});

// =====================================
// CREATE FARMER BOOKING
// =====================================

app.post("/api/bookings", authenticateToken, requireFarmer, async (req, res) => {
    const crop = String(req.body?.crop || "").trim();
    const centre = String(req.body?.centre || "").trim();
    const date = String(req.body?.date || req.body?.booking_date || "").trim();
    const slot = String(req.body?.slot || req.body?.timeSlot || "").trim();

    if (!crop || !centre || !date || !slot) {
        return res.status(400).json({
            success: false,
            message: "Crop, centre, date and slot are required."
        });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
            success: false,
            message: "Invalid booking date."
        });
    }

    let client;

    try {
        client = await pool.connect();

        const farmerResult = await client.query(
            `SELECT id, full_name FROM users
             WHERE id = $1 AND role = 'farmer'`,
            [req.user.userId]
        );

        if (!farmerResult.rowCount) {
            return res.status(404).json({
                success: false,
                message: "Farmer account not found."
            });
        }

        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(4242)");

        const tokenResult = await client.query(
            "SELECT COALESCE(MAX(token), 41) + 1 AS token FROM bookings"
        );

        const token = Number(tokenResult.rows[0].token);
        const farmer = farmerResult.rows[0];

        const result = await client.query(
            `INSERT INTO bookings
             (farmer_name, crop, centre, booking_date, slot, token, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, farmer_name AS farmer, crop, centre,
             booking_date::text AS date, slot, token, user_id`,
            [farmer.full_name, crop, centre, date, slot, token, farmer.id]
        );

        await client.query("COMMIT");

        res.status(201).json({
            success: true,
            message: "Booking created successfully.",
            booking: result.rows[0]
        });

    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (_) {}
        }

        console.error("Booking error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to create booking."
        });

    } finally {
        if (client) client.release();
    }
});

// =====================================
// GET BOOKINGS
// =====================================

app.get("/api/bookings", authenticateToken, async (req, res) => {
    try {
        let result;

        if (req.user.role === "farmer") {
            result = await pool.query(
                `SELECT id, farmer_name AS farmer, crop, centre,
                 booking_date::text AS date, slot, token, user_id
                 FROM bookings
                 WHERE user_id = $1
                 ORDER BY id DESC`,
                [req.user.userId]
            );
        } else if (["officer", "admin"].includes(req.user.role)) {
            result = await pool.query(
                `SELECT id, farmer_name AS farmer, crop, centre,
                 booking_date::text AS date, slot, token, user_id
                 FROM bookings ORDER BY id DESC`
            );
        } else {
            return res.status(403).json({
                success: false,
                message: "Not allowed."
            });
        }

        res.json({
            success: true,
            bookings: result.rows
        });

    } catch (error) {
        console.error("Bookings error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch bookings."
        });
    }
});

// =====================================
// LIVE QUEUE
// =====================================

app.get("/api/queue", async (req, res) => {
    const token = Number(req.query.token);

    if (!Number.isInteger(token) || token < 1) {
        return res.status(400).json({
            success: false,
            message: "Invalid token."
        });
    }

    try {
        const result = await pool.query(
            `SELECT id, farmer_name AS farmer, crop, centre,
             booking_date::text AS date, slot, token
             FROM bookings WHERE token = $1`,
            [token]
        );

        const booking = result.rows[0];

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found."
            });
        }

        const farmersAhead = Math.max(0, token - CURRENT_TOKEN - 1);

        const status = token < CURRENT_TOKEN
            ? "Already served"
            : token === CURRENT_TOKEN
                ? "Now serving"
                : "Waiting";

        res.json({
            success: true,
            token,
            currentToken: CURRENT_TOKEN,
            status,
            farmersAhead,
            estimatedWaitMinutes:
                status === "Waiting" ? farmersAhead * MINUTES_PER_FARMER : 0,
            booking
        });

    } catch (error) {
        console.error("Queue error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to fetch queue."
        });
    }
});

// =====================================
// OFFICER BOOKINGS
// =====================================

app.get(
    "/api/officer/bookings",
    authenticateToken,
    requireOfficer,
    async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT
                    b.id,
                    b.farmer_name AS farmer,
                    b.crop,
                    b.centre,
                    b.booking_date::text AS date,
                    b.slot,
                    b.token,
                    b.user_id,
                    p.quality_status,
                    p.moisture_percent,
                    p.crop_grade,
                    p.quality_remarks,
                    p.gross_weight,
                    p.tare_weight,
                    p.net_weight,
                    p.procurement_rate,
                    p.bill_number,
                    p.bill_amount,
                    p.payment_status,
                    p.payment_mode,
                    p.transaction_reference,
                    p.payment_remarks,
                    CASE
                        WHEN p.payment_status = 'Credited' THEN 'Completed'
                        WHEN p.payment_status = 'Processing' THEN 'Payment Processing'
                        WHEN p.quality_status = 'Rejected' THEN 'Rejected'
                        WHEN p.bill_number IS NOT NULL THEN 'Payment Pending'
                        WHEN p.net_weight IS NOT NULL THEN 'Bill Pending'
                        WHEN p.quality_status = 'Accepted' THEN 'Weighing Pending'
                        ELSE 'Waiting'
                    END AS workflow_status
                FROM bookings b
                LEFT JOIN procurement_records p ON p.booking_id = b.id
                ORDER BY b.booking_date ASC, b.token ASC, b.id ASC
            `);

            res.json({
                success: true,
                bookings: result.rows
            });

        } catch (error) {
            console.error("OFFICER BOOKINGS DATABASE ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Officer bookings database query failed.",
                detail: error.message
            });
        }
    }
);

// =====================================
// SAVE QUALITY CHECK
// =====================================

app.put(
    "/api/procurement/:bookingId/quality",
    authenticateToken,
    requireOfficer,
    async (req, res) => {
        const bookingId = Number(req.params.bookingId);
        const status = String(req.body?.quality_status || "");
        const moistureInput = req.body?.moisture_percent;

        const moisture = moistureInput === "" ||
            moistureInput === null ||
            moistureInput === undefined
            ? null
            : Number(moistureInput);

        const grade = String(req.body?.crop_grade || "").trim();
        const remarks = String(req.body?.quality_remarks || "").trim();

        if (!Number.isInteger(bookingId) || bookingId < 1) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID."
            });
        }

        if (!["Accepted", "Rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Select Accepted or Rejected."
            });
        }

        if (moisture !== null &&
            (!Number.isFinite(moisture) || moisture < 0 || moisture > 100)) {
            return res.status(400).json({
                success: false,
                message: "Moisture must be between 0 and 100."
            });
        }

        try {
            const booking = await pool.query(
                "SELECT id FROM bookings WHERE id = $1",
                [bookingId]
            );

            if (!booking.rowCount) {
                return res.status(404).json({
                    success: false,
                    message: "Booking not found."
                });
            }

            const existing = await pool.query(
                `SELECT net_weight, bill_number, payment_status
                 FROM procurement_records WHERE booking_id = $1`,
                [bookingId]
            );

            if (existing.rowCount) {
                const old = existing.rows[0];

                if (old.net_weight !== null ||
                    old.bill_number ||
                    old.payment_status !== "Pending") {
                    return res.status(409).json({
                        success: false,
                        message: "Quality cannot be changed after later stages have started."
                    });
                }
            }

            const result = await pool.query(
                `INSERT INTO procurement_records
                 (booking_id, quality_status, moisture_percent, crop_grade,
                  quality_remarks, quality_checked_by, quality_checked_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())
                 ON CONFLICT (booking_id)
                 DO UPDATE SET
                    quality_status = EXCLUDED.quality_status,
                    moisture_percent = EXCLUDED.moisture_percent,
                    crop_grade = EXCLUDED.crop_grade,
                    quality_remarks = EXCLUDED.quality_remarks,
                    quality_checked_by = EXCLUDED.quality_checked_by,
                    quality_checked_at = NOW(),
                    updated_at = NOW()
                 RETURNING *`,
                [
                    bookingId,
                    status,
                    moisture,
                    grade || null,
                    remarks || null,
                    req.user.userId
                ]
            );

            res.json({
                success: true,
                message: "Quality check saved successfully.",
                record: result.rows[0]
            });

        } catch (error) {
            console.error("QUALITY ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Unable to save quality check.",
                detail: error.message
            });
        }
    }
);

// =====================================
// SAVE WEIGHING
// =====================================

app.put(
    "/api/procurement/:bookingId/weighing",
    authenticateToken,
    requireOfficer,
    async (req, res) => {
        const bookingId = Number(req.params.bookingId);
        const gross = Number(req.body?.gross_weight);
        const tare = Number(req.body?.tare_weight);

        if (!Number.isInteger(bookingId) ||
            !Number.isFinite(gross) ||
            !Number.isFinite(tare) ||
            gross <= 0 ||
            tare < 0 ||
            tare >= gross) {
            return res.status(400).json({
                success: false,
                message: "Gross weight must be greater than tare weight."
            });
        }

        try {
            const result = await pool.query(
                `UPDATE procurement_records
                 SET gross_weight = $1,
                     tare_weight = $2,
                     net_weight = $3,
                     weighing_recorded_by = $4,
                     weighing_recorded_at = NOW(),
                     updated_at = NOW()
                 WHERE booking_id = $5
                   AND quality_status = 'Accepted'
                   AND bill_number IS NULL
                 RETURNING *`,
                [
                    gross,
                    tare,
                    Number((gross - tare).toFixed(2)),
                    req.user.userId,
                    bookingId
                ]
            );

            if (!result.rowCount) {
                return res.status(400).json({
                    success: false,
                    message: "Save an Accepted quality check first, and make sure a bill has not already been generated."
                });
            }

            res.json({
                success: true,
                message: "Weighing saved successfully.",
                record: result.rows[0]
            });

        } catch (error) {
            console.error("WEIGHING ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Unable to save weighing.",
                detail: error.message
            });
        }
    }
);

// =====================================
// GENERATE BILL
// =====================================

app.post(
    "/api/procurement/:bookingId/bill",
    authenticateToken,
    requireOfficer,
    async (req, res) => {
        const bookingId = Number(req.params.bookingId);
        const rate = Number(req.body?.procurement_rate);

        if (!Number.isInteger(bookingId) ||
            !Number.isFinite(rate) ||
            rate <= 0) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid positive procurement rate."
            });
        }

        let client;

        try {
            client = await pool.connect();
            await client.query("BEGIN");

            const result = await client.query(
                `SELECT * FROM procurement_records
                 WHERE booking_id = $1 FOR UPDATE`,
                [bookingId]
            );

            if (!result.rowCount ||
                result.rows[0].quality_status !== "Accepted" ||
                result.rows[0].net_weight === null) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message: "Accepted quality check and weighing are required before billing."
                });
            }

            const record = result.rows[0];

            if (record.bill_number) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    success: false,
                    message: "Bill already generated.",
                    bill_number: record.bill_number
                });
            }

            const amount = Number(
                (Number(record.net_weight) * rate).toFixed(2)
            );

            const billNumber = `AP-${bookingId}-${Date.now()}`;

            const updated = await client.query(
                `UPDATE procurement_records
                 SET procurement_rate = $1,
                     bill_number = $2,
                     bill_amount = $3,
                     bill_generated_at = NOW(),
                     updated_at = NOW()
                 WHERE booking_id = $4
                 RETURNING *`,
                [rate, billNumber, amount, bookingId]
            );

            await client.query("COMMIT");

            res.json({
                success: true,
                message: "Procurement bill generated successfully.",
                record: updated.rows[0]
            });

        } catch (error) {
            if (client) {
                try {
                    await client.query("ROLLBACK");
                } catch (_) {}
            }

            console.error("BILL ERROR:", error);

            res.status(500).json({
                success: false,
                message: "Unable to generate bill.",
                detail: error.message
            });

        } finally {
            if (client) client.release();
        }
    }
);

// =====================================
// UPDATE PAYMENT
// =====================================

app.put(
    "/api/procurement/:bookingId/payment",
    authenticateToken,
    requireOfficer,
    async (req, res) => {
        const bookingId = Number(req.params.bookingId);
        const status = String(req.body?.payment_status || "");
        const reference = String(
            req.body?.transaction_reference || ""
        ).trim();
        const remarks = String(
            req.body?.payment_remarks || ""
        ).trim();

        if (!Number.isInteger(bookingId) ||
            !["Processing", "Credited"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment details."
            });
        }

        if (status === "Credited" && !reference) {
            return res.status(400).json({
                success: false,
                message: "Transaction reference is required."
            });
        }

        try {
            const existing = await pool.query(
                `SELECT payment_status
                 FROM procurement_records
                 WHERE booking_id = $1 AND bill_number IS NOT NULL`,
                [bookingId]
            );

            if (!existing.rowCount) {
                return res.status(400).json({
                    success: false,
                    message: "Generate a bill before updating payment."
                });
            }

            if (existing.rows[0].payment_status === "Credited" &&
                status !== "Credited") {
                return res.status(409).json({
                    success: false,
                    message: "A credited payment cannot be changed back to Processing."
                });
            }

            const result = await pool.query(
                `UPDATE procurement_records
                 SET payment_status = $1,
                     transaction_reference = COALESCE($2, transaction_reference),
                     payment_remarks = $3,
                     payment_recorded_by = $4,
                     payment_recorded_at = NOW(),
                     updated_at = NOW()
                 WHERE booking_id = $5
                   AND bill_number IS NOT NULL
                 RETURNING *`,
                [
                    status,
                    reference || null,
                    remarks || null,
                    req.user.userId,
                    bookingId
                ]
            );

            res.json({
                success: true,
                message: status === "Credited"
                    ? "Payment status recorded as Credited. This is not bank verification."
                    : "Payment status updated to Processing.",
                record: result.rows[0]
            });

        } catch (error) {
            console.error("PAYMENT ERROR:", error);

            res.status(error.code === "23505" ? 409 : 500).json({
                success: false,
                message: error.code === "23505"
                    ? "Transaction reference already exists."
                    : "Unable to update payment.",
                detail: error.message
            });
        }
    }
);

// =====================================
// FARMER PROCUREMENT STATUS
// =====================================

app.get(
    "/api/procurement/my",
    authenticateToken,
    requireFarmer,
    async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT
                    b.id AS booking_id,
                    b.farmer_name AS farmer,
                    b.crop,
                    b.centre,
                    b.booking_date::text AS date,
                    b.slot,
                    b.token,
                    p.quality_status,
                    p.moisture_percent,
                    p.crop_grade,
                    p.quality_remarks,
                    p.gross_weight,
                    p.tare_weight,
                    p.net_weight,
                    p.procurement_rate,
                    p.bill_number,
                    p.bill_amount,
                    p.payment_status,
                    p.transaction_reference,
                    p.payment_remarks
                 FROM bookings b
                 LEFT JOIN procurement_records p ON p.booking_id = b.id
                 WHERE b.user_id = $1
                 ORDER BY b.id DESC
                 LIMIT 1`,
                [req.user.userId]
            );

            res.json({
                success: true,
                booking: result.rows[0] || null
            });

        } catch (error) {
            console.error("Farmer procurement status error:", error);

            res.status(500).json({
                success: false,
                message: "Unable to fetch procurement status.",
                detail: error.message
            });
        }
    }
);

// =====================================
// DATABASE CHECK
// =====================================

app.get("/api/database-check", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT current_database() AS database_name"
        );

        res.json({
            success: true,
            database: result.rows[0].database_name
        });
    } catch (error) {
        console.error("Database check error:", error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
// =====================================
// FARMER PROCUREMENT STATUS API
// =====================================

app.get("/api/farmer/procurement", authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== "farmer") {
            return res.status(403).json({
                success: false,
                message: "Farmer access only"
            });
        }

        const result = await pool.query(
            `SELECT
                b.id AS booking_id,
                b.farmer_name,
                b.crop,
                b.centre,
                TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS booking_date,
                b.slot,
                b.token,
                pr.quality_status,
                pr.moisture_percent,
                pr.crop_grade,
                pr.quality_remarks,
                pr.gross_weight,
                pr.tare_weight,
                pr.net_weight,
                pr.procurement_rate,
                pr.bill_number,
                pr.bill_amount,
                pr.payment_status,
                pr.payment_mode,
                pr.transaction_reference,
                pr.payment_remarks,
                pr.payment_recorded_at
            FROM bookings b
            LEFT JOIN procurement_records pr
                ON pr.booking_id = b.id
            WHERE b.user_id = $1
            ORDER BY b.created_at DESC`,
            [req.user.userId]
        );

        res.json({
            success: true,
            bookings: result.rows
        });

    } catch (error) {
        console.error("Farmer procurement status error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load procurement status."
        });
    }
});
// =====================================
// FARMER PROCUREMENT STATUS API
// =====================================

// =====================================
// SERVER
// =====================================


// =====================================
// ADMIN DASHBOARD SUMMARY
// =====================================

app.get("/api/admin/summary", authenticateToken, async (req, res) => {

    if (req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Admin access required."
        });
    }

    try {
        const [statsResult, centresResult, paymentsResult, activityResult] =
            await Promise.all([

                // 1. Dashboard statistics
                pool.query(`
                    SELECT
                        (SELECT COUNT(*) FROM users
                         WHERE role = 'farmer') AS total_farmers,

                        (SELECT COUNT(*) FROM bookings
                         WHERE booking_date = CURRENT_DATE) AS todays_bookings,

                        (SELECT COUNT(DISTINCT b.centre)
                         FROM bookings b
                         LEFT JOIN procurement_records p
                         ON p.booking_id = b.id
                         WHERE COALESCE(p.payment_status, 'Pending') <> 'Credited'
                         AND COALESCE(p.quality_status, 'Pending') <> 'Rejected'
                        ) AS active_queues,

                        (SELECT COUNT(*) FROM procurement_records
                         WHERE payment_status = 'Credited') AS completed,

                        (SELECT COUNT(*) FROM procurement_records
                         WHERE bill_number IS NOT NULL
                         AND payment_status IN ('Pending', 'Processing')
                        ) AS pending_payments
                `),

                // 2. Procurement centre data
                pool.query(`
                    SELECT
                        b.centre,
                        COUNT(*) AS total_bookings,
                        COUNT(*) FILTER (
                            WHERE COALESCE(p.payment_status, 'Pending') <> 'Credited'
                            AND COALESCE(p.quality_status, 'Pending') <> 'Rejected'
                        ) AS active_bookings
                    FROM bookings b
                    LEFT JOIN procurement_records p
                    ON p.booking_id = b.id
                    GROUP BY b.centre
                    ORDER BY active_bookings DESC, b.centre ASC
                `),

                // 3. Outstanding payments
                pool.query(`
                    SELECT
                        b.farmer_name AS farmer,
                        b.token,
                        b.centre,
                        p.bill_amount,
                        p.payment_status,
                        p.bill_number
                    FROM procurement_records p
                    JOIN bookings b ON b.id = p.booking_id
                    WHERE p.bill_number IS NOT NULL
                    AND p.payment_status IN ('Pending', 'Processing')
                    ORDER BY p.updated_at DESC
                    LIMIT 10
                `),

                // 4. Recent procurement activity
                pool.query(`
                    SELECT
                        b.token,
                        b.farmer_name AS farmer,
                        b.centre,

                        CASE
                            WHEN p.payment_recorded_at IS NOT NULL
                                THEN 'Payment updated'
                            WHEN p.bill_generated_at IS NOT NULL
                                THEN 'Procurement bill generated'
                            WHEN p.weighing_recorded_at IS NOT NULL
                                THEN 'Crop weighing recorded'
                            WHEN p.quality_checked_at IS NOT NULL
                                THEN 'Crop quality checked'
                            ELSE 'New booking created'
                        END AS title,

                        CASE
                            WHEN p.payment_recorded_at IS NOT NULL
                                THEN 'Payment: ' || p.payment_status
                            WHEN p.bill_generated_at IS NOT NULL
                                THEN 'Bill: ' || p.bill_number
                            WHEN p.weighing_recorded_at IS NOT NULL
                                THEN 'Net weight: ' || COALESCE(p.net_weight::text, 'N/A') || ' kg'
                            WHEN p.quality_checked_at IS NOT NULL
                                THEN 'Quality: ' || p.quality_status
                            ELSE 'Booking registered'
                        END AS description,

                        GREATEST(
                            b.created_at,
                            COALESCE(p.updated_at, b.created_at)
                        ) AS activity_at

                    FROM bookings b
                    LEFT JOIN procurement_records p
                    ON p.booking_id = b.id
                    ORDER BY activity_at DESC
                    LIMIT 8
                `)
            ]);

        res.json({
            success: true,
            stats: statsResult.rows[0],
            centres: centresResult.rows,
            pendingPayments: paymentsResult.rows,
            activities: activityResult.rows
        });

    } catch (error) {
        console.error("Admin dashboard summary error:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load admin dashboard data.",
            error: error.message
        });
    }
});
app.listen(PORT, "0.0.0.0", () => {
    console.log(`AgriProcure server running at http://localhost:${PORT}`);
});






