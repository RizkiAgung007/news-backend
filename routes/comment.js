import express from "express";
import db from "../db.js";
import { verifyToken } from "./auth.js";

const router = express.Router();

// Method get untuk seluruh komentar
router.get("/", async (req, res) => {
  const { news_url } = req.query;
  if (!news_url) {
    return res
      .status(400)
      .json({ message: "Parameter query news_url diperlukan" });
  }

  const queryGetAllComment = `
    SELECT c.id_comment, c.content, c.create_at, u.username, c.id_user
    FROM comments c
    JOIN users u ON c.id_user = u.id_users
    WHERE c.news_url = ?
    ORDER BY c.create_at DESC
  `;

  try {
    const [comments] = await db.query(queryGetAllComment, [news_url]);
    res.json(comments);
  } catch (err) {
    console.error("DATABASE ERROR on GET /comments:", err);
    res.status(500).json({ message: "Server error saat mengambil komentar" });
  }
});

// Method get untuk 5 komentar terbaru di dashboard admin
router.get("/recent", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).json({ message: "Akses ditolak" });
  }

  const queryGetComment = `
    SELECT c.content, u.username, n.title AS news_title, n.id_news
    FROM comments c
    JOIN users u ON c.id_user = u.id_users
    JOIN news n ON c.news_url = n.id_news 
    ORDER BY c.create_at DESC
    LIMIT 5;
  `;

  try {
    const [comments] = await db.query(queryGetComment);
    res.json(comments);
  } catch (err) {
    console.error("DATABASE ERROR on GET /comments/recent:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Method post untuk membuat komentar baru
router.post("/", verifyToken, async (req, res) => {
  const { content, news_url } = req.body;
  const id_user = req.userId;

  if (!content || !news_url) {
    return res
      .status(400)
      .json({ message: "Content dan news_url wajib diisi" });
  }

  const queryPostComment = `INSERT INTO comments (id_user, content, news_url, create_at) VALUES (?, ?, ?, NOW())`;

  try {
    const [result] = await db.query(queryPostComment, [
      id_user,
      content,
      news_url,
    ]);
    res.status(201).json({
      message: "Komentar berhasil ditambahkan",
      id_comment: result.insertId,
    });
  } catch (err) {
    console.error("DATABASE ERROR on POST /comments:", err);
    res.status(500).json({ message: "Server error saat menyimpan komentar" });
  }
});

// Method get untuk menghapus komentar
router.delete("/:id_comment", verifyToken, async (req, res) => {
  const { id_comment } = req.params; 
  const id_user = req.userId;

  if (!id_comment) {
    return res
      .status(400)
      .json({ message: "Parameter id_comment diperlukan." });
  }

  try {
    const deleteCommentQuery = `
      DELETE FROM comments
      WHERE id_comment = ? AND id_user = ?
    `;

    const [result] = await db.query(deleteCommentQuery, [id_comment, id_user]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Komentar tidak ditemukan atau Anda tidak memiliki izin untuk menghapusnya.", });
    }

    res.status(200).json({ message: "Komentar berhasil dihapus." });
  } catch (err) {
    console.error("DATABASE ERROR on DELETE /comments:", err);
    res.status(500).json({ message: "Server error saat menghapus komentar." });
  }
});

// Method get untuk Statistik Pertumbuhan Berita (7 hari terakhir)
router.get("/stats/growth", verifyToken, async (req, res) => {
  if (req.role !== "admin")
    return res.status(403).json({ message: "Akses ditolak" });
  try {
    const query = `
      SELECT DATE(create_at) as date, COUNT(*) as count
      FROM comments
      WHERE create_at >= CURDATE() - INTERVAL 7 DAY
      GROUP BY DATE(create_at)
      ORDER BY date ASC;
    `;
    const [growthComment] = await db.query(query);
    res.json(growthComment);
  } catch (err) {
    console.error("ERROR GET /news/stats/growth :", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
