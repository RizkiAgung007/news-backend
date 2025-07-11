import express from "express";
import db from "../db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

dotenv.config();
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware verifikasi token
function verifyToken(req, res, next) {

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Token tidak ditemukan atau format salah" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token tidak ditemukan" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.role = decoded.role;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token tidak valid" });
  }
}

// Rate limit untuk login
const loginLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  message: { message: "Terlalu banyak percobaan login, coba lagi nanti." },
})

// Method post untuk REGISTER
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username dan password wajib diisi." });
    }

    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Input tidak valid." });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ message: "Username harus antara 3-20 karakter." });
    }

    if (password.length < 6 || password.length > 100) {
      return res.status(400).json({ message: "Password harus minimal 6 karakter." });
    }

    const usernamePattern = /^[a-zA-Z0-9_.-]+$/; 
    if (!usernamePattern.test(username)) {
      return res.status(400).json({ message: "Username hanya boleh berisi huruf, angka, titik, underscore, atau dash." });
    }

    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ message: "Password harus mengandung huruf besar dan angka." });
    }
    
    const hashed = await bcrypt.hash(password, 10);
    const queryPostUser =
      "INSERT INTO users (username, password) VALUES (?, ?)";

    await db.query(queryPostUser, [username, hashed]);

    return res.status(201).json({ message: "User berhasil didaftarkan" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Username sudah ada" });
    }
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ message: "Server error saat registrasi" });
  }
});

// Method post untuk LOGIN
router.post("/login", loginLimit, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username dan password diperlukan" });
    }

    let user, role, userId;

    if (username === "admin") {
      const queryAdmin = "SELECT * FROM admin WHERE username = ?";
      const [rows] = await db.query(queryAdmin, [username]);
      if (rows.length === 0) {
        return res.status(404).json({ message: "Admin tidak ditemukan" });
      }
      user = rows[0];
      role = "admin";
      userId = user.id_admin;
    } else {
      const queryUser = "SELECT * FROM users WHERE username = ?";
      const [rows] = await db.query(queryUser, [username]);
      if (rows.length === 0) {
        return res.status(404).json({ message: "User tidak ditemukan" });
      }
      user = rows[0];
      role = "user";
      userId = user.id_users;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Username dan Password salah" });
    }

    const token = jwt.sign({ id: userId, username, role: role }, JWT_SECRET, {
      expiresIn: "2h",
    });
    return res.status(200).json({ token, role: role, username, userId: userId });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ message: "Terjadi kesalahan pada server" });
  }
});

// Method get untuk Statistik Pertumbuhan user (7 hari terakhir)
router.get("/stats/growth", verifyToken, async (req, res) => {
  if (req.role !== "admin")
    return res.status(403).json({ message: "Akses ditolak" });
  try {
    const query = `
      SELECT DATE(create_at) as date, COUNT(*) as count
      FROM users
      WHERE create_at >= CURDATE() - INTERVAL 7 DAY
      GROUP BY DATE(create_at)
      ORDER BY date ASC;
    `;
    const [growthUser] = await db.query(query);
    res.json(growthUser);
  } catch (err) {
    console.error("ERROR GET /news/stats/growth :", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Method get untuk PROFILE (untuk user yang sedang login)
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.userId;
    const currentUserRole = req.role;

    if (currentUserRole === "admin") {
      const [rows] = await db.query(
        "SELECT id_admin, username FROM admin WHERE id_admin = ?",
        [currentUserId]
      );
      if (rows.length === 0)
        return res.status(404).json({ message: "Admin tidak ditemukan" });
      return res.status(200).json({ 
        userId: rows[0].id_admin, 
        username: rows[0].username, 
        role: "admin", 
      });
    } else {
      const [rows] = await db.query(
        "SELECT id_users, username, create_at FROM users WHERE id_users = ?",
        [currentUserId]
      );
      if (rows.length === 0)
        return res.status(404).json({ message: "User tidak ditemukan" });
      return res.status(200).json({
        userId: rows[0].id_users, 
        username: rows[0].username,
        createdAt: rows[0].create_at,
        role: "user",
      });
    }
  } catch (error) {
    console.error("GET PROFILE ERROR:", error);
    return res
      .status(500)
      .json({ message: "Server error saat mengambil profil" });
  }
});

// Method put untuk UPDATE username
router.put("/update-profile", verifyToken, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || username.trim() === "") {
      return res.status(400).json({ message: "Username tidak boleh kosong" });
    }

    if (req.role !== "user") {
      return res
        .status(403)
        .json({ message: "Hanya user yang bisa update profil" });
    }

    const query = "UPDATE users SET username = ? WHERE id_users = ?";
    await db.query(query, [username.trim(), req.userId]);

    res.status(200).json({
      message: "Username berhasil diperbarui",
      username: username.trim(),
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "Username tersebut sudah digunakan." });
    }
    console.error("UPDATE PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error saat update profil" });
  }
});

// Method put untuk UPDATE password
router.put("/change-password", verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Semua field password wajib diisi" });
    }

    if (req.role !== "user") {
      return res.status(403).json({ message: "Fitur ini hanya untuk user" });
    }

    const [rows] = await db.query(
      "SELECT password FROM users WHERE id_users = ?",
      [req.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) {
      return res.status(401).json({ message: "Password saat ini salah" });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password = ? WHERE id_users = ?", [
      newHashedPassword,
      req.userId,
    ]);

    res.status(200).json({ message: "Password berhasil diubah" });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);
    res.status(500).json({ message: "Server error saat ganti password" });
  }
});

// Method get untuk Statistik aktivitas user (jumlah like & komentar) - Untuk user yang sedang login
router.get("/activity-stats", verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const likeQuery =
      "SELECT COUNT(*) AS likeCount FROM likes WHERE id_users = ? AND value = 1";
    const [likeResult] = await db.query(likeQuery, [userId]);

    const commentQuery =
      "SELECT COUNT(*) AS commentCount FROM comments WHERE id_user = ?";
    const [commentResult] = await db.query(commentQuery, [userId]);

    res.json({
      totalLikes: likeResult[0].likeCount,
      totalComments: commentResult[0].commentCount,
    });
  } catch (error) {
    console.error("GET USER ACTIVITY STATS ERROR:", error);
    return res
      .status(500)
      .json({ message: "Server error saat mengambil statistik aktivitas" });
  }
});

// Method get untuk Statistik aktivitas user (jumlah like & komentar) - Untuk admin melihat user lain
router.get("/activity-stats/:id", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak. Hanya admin yang dapat melihat statistik aktivitas pengguna lain." });
  }
  try {
    const userIdToView = req.params.id; 
    
    const likeQuery = "SELECT COUNT(*) AS likeCount FROM likes WHERE id_users = ? AND value = 1";
    const [likeResult] = await db.query(likeQuery, [userIdToView]);

    const commentQuery = "SELECT COUNT(*) AS commentCount FROM comments WHERE id_user = ?";
    const [commentResult] = await db.query(commentQuery, [userIdToView]);

    res.json({
      totalLikes: likeResult[0].likeCount,
      totalComments: commentResult[0].commentCount,
    });
  } catch (error) {
    console.error("GET USER ACTIVITY STATS ERROR (Admin View):", error);
    return res.status(500).json({ message: "Server error saat mengambil statistik aktivitas." });
  }
});

// Method get untuk Riwayat Like User - Untuk user yang sedang login
router.get("/activity/likes", verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const totalQuery =
      "SELECT COUNT(*) as total FROM likes WHERE id_users = ? AND value = 1";
    const [totalResult] = await db.query(totalQuery, [userId]);
    const totalItems = totalResult[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    const dataQuery = `
      SELECT 
        l.id, l.id_news as article_id, n.title, l.created_at as activity_date
      FROM likes l
      LEFT JOIN news n ON l.id_news = CAST(n.id_news AS CHAR) COLLATE utf8mb4_general_ci
      WHERE l.id_users = ? AND l.value = 1
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?;
    `;

    const [likes] = await db.query(dataQuery, [userId, limit, offset]);
    res.status(200).json({
      data: likes,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems,
      },
    });
  } catch (error) {
    console.error("GET LIKE ACTIVITY ERROR:", error);
    res
      .status(500)
      .json({ message: "Server error saat mengambil riwayat like" });
  }
});

// Method get untuk Riwayat Like User - Untuk admin melihat user lain
router.get("/activity/likes/:id", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak. Hanya admin yang dapat melihat riwayat like pengguna lain." });
  }
  try {
    const userIdToView = req.params.id; 
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const totalQuery =
      "SELECT COUNT(*) as total FROM likes WHERE id_users = ? AND value = 1";
    const [totalResult] = await db.query(totalQuery, [userIdToView]);
    const totalItems = totalResult[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    const dataQuery = `
      SELECT 
        l.id, l.id_news as article_id, n.title, l.created_at as activity_date
      FROM likes l
      LEFT JOIN news n ON l.id_news = CAST(n.id_news AS CHAR) COLLATE utf8mb4_general_ci
      WHERE l.id_users = ? AND l.value = 1
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?;
    `;

    const [likes] = await db.query(dataQuery, [userIdToView, limit, offset]);
    res.status(200).json({
      data: likes,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems,
      },
    });
  } catch (error) {
    console.error("GET LIKE ACTIVITY ERROR (Admin View):", error);
    res.status(500).json({ message: "Server error saat mengambil riwayat like." });
  }
});


// Methode get untuk Riwayat Komentar User - Untuk user yang sedang login
router.get("/activity/comments", verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const totalQuery =
      "SELECT COUNT(*) as total FROM comments WHERE id_user = ?";
    const [totalResult] = await db.query(totalQuery, [req.userId]);
    const totalItems = totalResult[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    const dataQuery = `
      SELECT 
        c.id_comment, c.news_url as article_id, c.content, n.title, c.create_at as activity_date
      FROM comments c
      LEFT JOIN news n ON c.news_url = CAST(n.id_news AS CHAR) COLLATE utf8mb4_general_ci
      WHERE c.id_user = ?
      ORDER BY c.create_at DESC
      LIMIT ? OFFSET ?;
    `;
    const [comments] = await db.query(dataQuery, [userId, limit, offset]);
    res.status(200).json({
      data: comments,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems,
      },
    });
  } catch (error) {
    console.error("GET COMMENT ACTIVITY ERROR:", error);
    res
      .status(500)
      .json({ message: "Server error saat mengambil riwayat komentar" });
  }
});

// Methode get untuk Riwayat Komentar User - Untuk admin melihat user lain
router.get("/activity/comments/:id", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak. Hanya admin yang dapat melihat riwayat komentar pengguna lain." });
  }
  try {
    const userIdToView = req.params.id; 
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const totalQuery =
      "SELECT COUNT(*) as total FROM comments WHERE id_user = ?";
    const [totalResult] = await db.query(totalQuery, [userIdToView]);
    const totalItems = totalResult[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    const dataQuery = `
      SELECT 
        c.id_comment, c.news_url as article_id, c.content, n.title, c.create_at as activity_date
      FROM comments c
      LEFT JOIN news n ON c.news_url = CAST(n.id_news AS CHAR) COLLATE utf8mb4_general_ci
      WHERE c.id_user = ?
      ORDER BY c.create_at DESC
      LIMIT ? OFFSET ?;
    `;
    const [comments] = await db.query(dataQuery, [userIdToView, limit, offset]);
    res.status(200).json({
      data: comments,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalItems: totalItems,
      },
    });
  } catch (error) {
    console.error("GET COMMENT ACTIVITY ERROR (Admin View):", error);
    res.status(500).json({ message: "Server error saat mengambil riwayat komentar." });
  }
});


// Method get untuk ALL USERS (Untuk admin melihat daftar pengguna)
router.get("/all-users", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak" });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortOrder = req.query.sortOrder === "asc" ? "ASC" : "DESC";
    const searchTerm = req.query.search || "";
    const offset = (page - 1) * limit;

    let baseQuery = "FROM users";
    const params = [];

    if (searchTerm) {
      baseQuery += " WHERE username LIKE ?";
      params.push(`%${searchTerm}%`);
    }

    const totalQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const [totalResult] = await db.query(totalQuery, params);
    const totalUsers = totalResult[0].total;
    const totalPages = Math.ceil(totalUsers / limit);

    const dataParams = [...params];
    dataParams.push(limit, offset);

    const dataQuery = `SELECT id_users, username, create_at ${baseQuery} ORDER BY create_at ${sortOrder} LIMIT ? OFFSET ?`;
    const [users] = await db.query(dataQuery, dataParams);

    res.json({
      status: "success",
      totalUsers,
      users,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("GET ALL USERS ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Method get untuk 5 user terbaru untuk dashboard admin
router.get("/recent-users", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak" });
  }
  try {
    const [users] = await db.query(
      "SELECT username, create_at FROM users ORDER BY create_at DESC LIMIT 5"
    );
    return res.status(200).json(users);
  } catch (error) {
    console.error("GET RECENT USERS ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Method delete untuk user by ID (admin only)
router.delete("/delete-user/:id", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak" });
  }
  try {
    const userId = req.params.id;
    await db.query("DELETE FROM users WHERE id_users = ?", [userId]);
    return res.status(200).json({ message: "User berhasil dihapus" });
  } catch (error) {
    console.error("DELETE USER ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Method GET untuk mendapatkan detail user by ID (khusus Admin)
router.get("/users/:id", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak. Hanya admin yang dapat melihat detail pengguna." });
  }

  try {
    const userIdToView = req.params.id; 

    const userQuery = `
      SELECT id_users, username, create_at
      FROM users
      WHERE id_users = ?
    `;
    const [userRows] = await db.query(userQuery, [userIdToView]);

    if (userRows.length === 0) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });
    }

    const userData = userRows[0];

    // Dapatkan statistik aktivitas (total like dan komentar)
    const likeQuery = "SELECT COUNT(*) AS likeCount FROM likes WHERE id_users = ? AND value = 1";
    const [likeResult] = await db.query(likeQuery, [userIdToView]);

    const commentQuery = "SELECT COUNT(*) AS commentCount FROM comments WHERE id_user = ?";
    const [commentResult] = await db.query(commentQuery, [userIdToView]);

    res.status(200).json({
      ...userData,
      totalLikes: likeResult[0].likeCount,
      totalComments: commentResult[0].commentCount,
    });

  } catch (error) {
    console.error("GET USER DETAILS (Admin View) ERROR:", error);
    return res.status(500).json({ message: "Server error saat mengambil detail pengguna." });
  }
});

export { verifyToken };
export default router;