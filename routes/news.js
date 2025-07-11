import express from "express";
import db from "../db.js";
import { verifyToken } from "./auth.js";
import multer from "multer";
import path from "path";

const router = express.Router();

// Setup multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage: storage });

// Method get berita berdasarkan kategori
router.get("/category/:categoryName", async (req, res) => {
  try {
    const { categoryName } = req.params;
    const query =
      "SELECT * FROM news WHERE LOWER(category) = LOWER(?) ORDER BY create_at DESC";
    const [results] = await db.query(query, [categoryName]);
    if (results.length === 0) {
      return res.status(404).json({ message: "Kategori tidak ditemukan" });
    }
    res.json(results);
  } catch (err) {
    console.error("ERROR GET /news/category/:categoryName :", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Method get untuk semua berita
router.get("/", async (req, res) => {
  try {
    const [results] = await db.query(
      "SELECT * FROM news ORDER BY create_at DESC"
    );
    res.json(results);
  } catch (err) {
    console.error("ERROR GET /news/ :", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Method get untuk berita di dashboard admin
router.get("/all-news", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak" });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortOrder = req.query.sortOrder === "asc" ? "ASC" : "DESC";
    const searchTerm = req.query.search || ""; 
    const categoryFilter = req.query.category || ""; 
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const queryParams = [];

    // Kondisi untuk pencarian judul jika ada
    if (searchTerm) {
      whereClauses.push("title LIKE ?");
      queryParams.push(`%${searchTerm}%`);
    } 

    // Kondisi untuk filter kategori jika ada
    if (categoryFilter) {
      whereClauses.push("LOWER(category) = LOWER(?)");
      queryParams.push(categoryFilter);
    }

    const finalWhereClause = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    // Query untuk menghitung total berita (dengan filter pencarian dan kategori)
    const totalQuery = `SELECT COUNT(*) as total FROM news ${finalWhereClause}`;
    const [totalResult] = await db.query(totalQuery, queryParams);
    const totalNews = totalResult[0].total;
    const totalPages = Math.ceil(totalNews / limit);

    // Query untuk mendapatkan data berita (dengan filter, sorting, dan pagination)
    const dataQuery = `
      SELECT id_news, title, category, create_at
      FROM news
      ${finalWhereClause}
      ORDER BY create_at ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const dataQueryParams = [...queryParams, limit, offset];
    const [news] = await db.query(dataQuery, dataQueryParams);

    res.json({
      status: "success",
      totalNews,
      news,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Get ALL NEWS ERROR:", error);
    return res.status(500).json({ message: "Server Error" });
  }
});

// Method get untuk pencarian berita
router.get("/search", async (req, res) => {
  try {
    const { title } = req.query;
    if (!title)
      return res
        .status(400)
        .json({ message: "Query pencarian tidak boleh kosong" });

    const query =
      "SELECT * FROM news WHERE title LIKE ? ORDER BY create_at DESC";
    const [results] = await db.query(query, [`%${title}%`]);
    res.json(results);
  } catch (err) {
    console.error("ERROR GET /news/search :", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Method get untuk menampilkan detail berita by id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query("SELECT * FROM news WHERE id_news = ?", [
      id,
    ]);
    if (result.length === 0)
      return res.status(404).json({ message: "Berita tidak ditemukan" });
    res.json(result[0]);
  } catch (err) {
    console.error("ERROR GET /news/:id :", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Method get Berita Terfavorit berdasarkan jumlah like
router.get("/favorites/top", verifyToken, async (req, res) => {
  try {
    if (req.role !== "admin") {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const queryGetTopLike = `
      SELECT
        n.id_news,
        n.title,
        n.url_photo,
        COUNT(l.id_news) AS like_count
      FROM likes l
      JOIN news n ON l.id_news = n.id_news
      WHERE l.value = 1
      GROUP BY n.id_news, n.title, n.url_photo
      ORDER BY like_count DESC
      LIMIT 5;
    `;

    const [favoriteNews] = await db.query(queryGetTopLike);

    res.json(favoriteNews);
  } catch (err) {
    console.error("ERROR GET /news/favorites/top :", err);
    res
      .status(500)
      .json({ message: "Server error saat mengambil berita favorit" });
  }
});

// Method get untuk Statistik Pertumbuhan Berita (7 hari terakhir)
router.get("/stats/growth", verifyToken, async (req, res) => {
  if (req.role !== "admin")
    return res.status(403).json({ message: "Akses ditolak" });
  try {
    const query = `
      SELECT DATE(create_at) as date, COUNT(*) as count
      FROM news
      WHERE create_at >= CURDATE() - INTERVAL 7 DAY
      GROUP BY DATE(create_at)
      ORDER BY date ASC;
    `;
    const [growthData] = await db.query(query);
    res.json(growthData);
  } catch (err) {
    console.error("ERROR GET /news/stats/growth :", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Method post untuk membuat berita baru
router.post("/", verifyToken, upload.single("photo"), async (req, res) => {
  try {
    if (req.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Hanya admin yang dapat membuat berita" });
    }
    const { title, description, category, create_by } = req.body;
    if (!title || !description || !category || !create_by || !req.file) {
      return res
        .status(400)
        .json({ message: "Semua field dan photo wajib diisi" });
    }
    const url_photo = `/uploads/${req.file.filename}`;
    const query =
      "INSERT INTO news (title, description, category, create_by, url_photo, create_at) VALUES (?, ?, ?, ?, ?, NOW())";
    const [result] = await db.query(query, [
      title,
      description,
      category,
      create_by,
      url_photo,
    ]);
    res
      .status(201)
      .json({ message: "Berita berhasil dibuat", id: result.insertId });
  } catch (err) {
    console.error("ERROR POST /news/ :", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Method post untuk Endpoint untuk menyimpan berita eksternal ke database jika belum ada
router.post("/sync-external", verifyToken, async (req, res) => {
  try {
    const { url, title, description, urlToImage, publishedAt, category } =
      req.body;

    if (!url || !title) {
      return res.status(400).json({ message: "URL dan Title diperlukan" });
    }

    const id_news = url;
    const query = `
      INSERT INTO news (id_news, title, description, url_photo, create_at, category, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE title=title; -- Tidak melakukan apa-apa jika duplikat
    `;

    await db.query(query, [
      id_news,
      title,
      description,
      urlToImage,
      publishedAt,
      category || "Eksternal",
      "system",
    ]);

    res
      .status(200)
      .json({ message: "Berita eksternal disinkronkan", id_news: id_news });
  } catch (err) {
    console.error("ERROR POST /news/sync-external :", err);
    res.status(500).json({ message: "Server error saat sinkronisasi" });
  }
});

// Method put untuk update berita by id
router.put("/:id", verifyToken, upload.single("photo"), async (req, res) => {
  try {
    if (req.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Hanya admin yang dapat mengedit berita" });
    }

    const { id } = req.params;
    const { title, description, category, create_by } = req.body;

    // Mengambil data berita yang ada untuk mendapatkan url_photo lama
    const [existingNews] = await db.query(
      "SELECT url_photo FROM news WHERE id_news = ?",
      [id]
    );
    if (existingNews.length === 0) {
      return res.status(404).json({ message: "Berita tidak ditemukan" });
    }

    // Menentukan url_photo: gunakan yang baru jika ada, jika tidak, pakai yang lama
    let url_photo = existingNews[0].url_photo;
    if (req.file) {
      url_photo = `/uploads/${req.file.filename}`;
    }

    const query = `
      UPDATE news 
      SET title = ?, description = ?, category = ?, create_by = ?, url_photo = ? 
      WHERE id_news = ?
    `;

    const [result] = await db.query(query, [
      title,
      description,
      category,
      create_by,
      url_photo,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Berita tidak ditemukan saat update" });
    }

    res.json({ message: "Berita berhasil diupdate" });
  } catch (err) {
    console.error("ERROR PUT /news/:id :", err);
    res.status(500).json({ message: "Server error saat mengupdate berita" });
  }
});

// Methof delete untuk menghapus berita by id
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    if (req.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Hanya admin yang dapat menghapus berita" });
    }
    const { id } = req.params;
    const [result] = await db.query("DELETE FROM news WHERE id_news = ?", [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Berita tidak ditemukan" });
    res.json({ message: "Berita berhasil dihapus" });
  } catch (err) {
    console.error("ERROR DELETE /news/:id :", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
