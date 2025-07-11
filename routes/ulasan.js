import express from "express";
import db from "../db.js";
import { verifyToken } from "./auth.js"; 

const router = express.Router();

// Method GET untuk seluruh ulasan (dengan pagination, sorting, dan search untuk Admin)
router.get("/", verifyToken, async (req, res) => {
    if (req.role !== 'admin') {
        return res.status(403).json({ message: 'Akses ditolak. Hanya admin yang dapat melihat ulasan.' });
    }

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20; 
        const sortOrder = req.query.sortOrder === "asc" ? "ASC" : "DESC";
        const searchTerm = req.query.search || ""; 
        const offset = (page - 1) * limit;

        let whereClauses = [];
        let queryParams = [];

        // Kondisi pencarian jika searchTerm ada
        if (searchTerm) {
            whereClauses.push("(subject LIKE ? OR message LIKE ?)");
            queryParams.push(`%${searchTerm}%`, `%${searchTerm}%`);
        }

        const finalWhereClause = whereClauses.length > 0
            ? `WHERE ${whereClauses.join(" AND ")}`
            : "";

        // Query untuk menghitung total ulasan (dengan atau tanpa filter pencarian)
        const totalQuery = `SELECT COUNT(*) as total FROM ulasan ${finalWhereClause}`;
        const [totalResult] = await db.query(totalQuery, queryParams);
        const totalReviews = totalResult[0].total;
        const totalPages = Math.ceil(totalReviews / limit);

        // Query untuk mendapatkan data ulasan (dengan filter, sorting, dan pagination)
        const dataQuery = `
            SELECT id_ulasan, id_user, username, email, subject, message, create_at
            FROM ulasan
            ${finalWhereClause}
            ORDER BY create_at ${sortOrder}
            LIMIT ? OFFSET ?
        `;
        const dataQueryParams = [...queryParams, limit, offset];

        const [reviews] = await db.query(dataQuery, dataQueryParams);

        res.json({
            status: "success",
            totalReviews,
            reviews,
            currentPage: page,
            totalPages,
        });

    } catch (err) {
        console.error("DATABASE ERROR on GET /ulasan:", err);
        res.status(500).json({ message: 'Server error saat mengambil ulasan.' });
    }
});

// Method GET untuk detail ulasan by ID (Admin)
router.get("/:id", verifyToken, async (req, res) => {
    if (req.role !== 'admin') {
        return res.status(403).json({ message: 'Akses ditolak. Hanya admin yang dapat melihat detail ulasan.' });
    }
    try {
        const { id } = req.params; 

        const query = `
            SELECT id_ulasan, id_user, username, email, subject, message, create_at
            FROM ulasan
            WHERE id_ulasan = ?
        `;
        const [result] = await db.query(query, [id]);

        if (result.length === 0) {
            return res.status(404).json({ message: "Ulasan tidak ditemukan." });
        }

        res.json(result[0]); 
    } catch (err) {
        console.error("DATABASE ERROR on GET /ulasan/:id:", err);
        res.status(500).json({ message: 'Server error saat mengambil detail ulasan.' });
    }
});


// Method POST untuk mengirim review
router.post("/create", verifyToken, async (req, res) => {
    const { email, subject, message } = req.body;
    const id_user = req.userId; 
    let username = '';

    if (!email || !subject || !message) {
        return res.status(400).json({ message: "Email, subject, dan message wajib diisi." });
    }

    try {
        const [userRows] = await db.query("SELECT username FROM users WHERE id_users = ?", [id_user]);
        if (userRows.length > 0) {
            username = userRows[0].username;
        } else {
            username = "Pengguna Tidak Dikenal"; 
        }

        const queryPostReview = `INSERT INTO ulasan (id_user, username, email, subject, message, create_at) VALUES (?, ?, ?, ?, ?, NOW())`;

        const [result] = await db.query(queryPostReview, [
            id_user,
            username,
            email,
            subject,
            message,
        ]);
        res.status(201).json({ message: "Ulasan berhasil ditambahkan", id_ulasan: result.insertId });
    } catch (err) {
        console.error("DATABASE ERROR ON POST /ulasan/create:", err);
        res.status(500).json({ message: "Server error saat menyimpan ulasan." });
    }
});

// Method DELETE untuk menghapus ulasan by ID 
router.delete("/:id", verifyToken, async (req, res) => {
    if (req.role !== 'admin') {
        return res.status(403).json({ message: 'Akses ditolak. Hanya admin yang dapat menghapus ulasan.' });
    }

    try {
        const { id } = req.params; 
        const [result] = await db.query("DELETE FROM ulasan WHERE id_ulasan = ?", [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Ulasan tidak ditemukan." });
        }

        res.status(200).json({ message: "Ulasan berhasil dihapus." });

    } catch (err) {
        console.error("DATABASE ERROR ON DELETE /ulasan/:id:", err);
        res.status(500).json({ message: "Server error saat menghapus ulasan." });
    }
});

export default router;