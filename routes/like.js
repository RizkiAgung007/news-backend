import express from 'express';
import db from '../db.js';
import { verifyToken } from "./auth.js";

const router = express.Router();


// Method get untuk Menampilkan jumlah like dan dsilke
router.get('/', verifyToken, async (req, res) => {
  const { id_news } = req.query; 
  const id_users = req.userId; 

  if (!id_news) {
    return res.status(400).json({ error: 'Parameter id_news diperlukan' });
  }

  try {
    const [status] = await db.query(
      'SELECT value FROM likes WHERE id_users = ? AND id_news = ?',
      [id_users, id_news]
    );
    const [likes] = await db.query(
      'SELECT COUNT(*) AS count FROM likes WHERE id_news = ? AND value = 1',
      [id_news]
    );
    const [dislikes] = await db.query(
      'SELECT COUNT(*) AS count FROM likes WHERE id_news = ? AND value = 0',
      [id_news]
    );

    res.json({
      userLikeStatus: status.length > 0 ? (status[0].value === 1 ? true : false) : null,
      likeCount: likes[0].count,
      dislikeCount: dislikes[0].count,
    });
  } catch (err) {
    console.error('DATABASE ERROR (GET /likes):', err);
    res.status(500).json({ error: 'Server Gagal Mengambil Status Like' });
  }
});

// Method post untuk menambah atau update like/dislike dan delete untuk menghapus like/dislike
router.post('/', verifyToken, async (req, res) => {
  const { id_news, value } = req.body;
  const id_users = req.userId;

  if (!id_news || typeof value !== 'boolean') {
    return res.status(400).json({ error: 'Input id_news atau value tidak valid' });
  }

  try {
    const sql = `
      INSERT INTO likes (id_users, id_news, value, created_at, updated_at)
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()
    `;
    await db.query(sql, [id_users, id_news, value, value]);
    res.status(200).json({ message: 'Like status berhasil diperbarui' });
  } catch (err) {
    console.error('DATABASE ERROR (POST /likes):', err);
    res.status(500).json({ error: 'Server Gagal Menyimpan Like' });
  }
});

router.delete('/', verifyToken, async (req, res) => {
  const { id_news } = req.body;
  const id_users = req.userId;

  if (!id_news) {
    return res.status(400).json({ error: 'Input id_news atau value tidak aktif'})
  }

  try {
    const deleteSql = 'DELETE FROM likes WHERE id_users = ? AND id_news = ?';
    await db.query(deleteSql, [id_users, id_news]);
    res.status(200).json({ message: 'Like status berhasil dilakukan'});
  } catch (err) {
    console.error('Database err (delete/likes0): ', err);
    res.status(500).json({ message: 'Server Gagal Menyimpan Update' })
  }
});

export default router;