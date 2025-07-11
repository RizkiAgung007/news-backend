import express from 'express';
import db from '../db.js';
import { verifyToken } from './auth.js';

const router = express.Router();

// Method get untuk semua kategori
router.get('/all', verifyToken, async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Akses ditolak' });
  try {
    const [results] = await db.query('SELECT * FROM category ORDER BY name ASC');
    const [totalCate] = await db.query('SELECT COUNT (*) as total FROM category');
    const category = totalCate[0].total;
    res.json({
      status: 'success',
      category,
      results
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Method get untuk kategori
router.get('/public/all', async (req, res) => {
  try {
    const [result] = await db.query("SELECT * FROM category ORDER BY name ASC");
    const categoryName = result.map(cat => cat.name);
    res.json(categoryName);
  } catch (err) {
    console.error("Get public categories error", err);
    res.status(500).json({ message: 'Server error '});
  }
});

// Method get untuk Statistik Distribusi Kategori 
router.get('/stats/category-distribution', verifyToken, async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Akses ditolak' });
  try {
    const query = `
      SELECT category, COUNT(*) as count
      FROM news
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category
      ORDER BY count DESC
      LIMIT 5;
    `;
    const [distributionData] = await db.query(query);
    res.json(distributionData);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Methode post untuk kategori baru
router.post('/create', verifyToken, async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Akses ditolak' });
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ message: 'Nama kategori wajib diisi' });
    
    const trimmedName = name.trim();
    const [existing] = await db.query('SELECT * FROM category WHERE name = ?', [trimmedName]);
    if (existing.length > 0) {
      return res.status(200).json({ message: 'Kategori sudah ada' });
    }
    const [result] = await db.query('INSERT INTO category (name) VALUES (?)', [trimmedName]);
    res.status(201).json({ message: 'Kategori berhasil dibuat', categoryId: result.insertId, name: trimmedName });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Method put untuk update kategori by id
router.put('/update/:id', verifyToken, async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Akses ditolak' });
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ message: 'Nama kategori tidak boleh kosong' });

    const [result] = await db.query('UPDATE category SET name = ? WHERE id_category = ?', [name.trim(), id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Kategori tidak ditemukan' });

    res.json({ message: 'Kategori berhasil diupdate' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Nama kategori tersebut sudah digunakan.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});


// Method delete untuk hapus kategori by id
router.delete('/delete/:id', verifyToken, async (req, res) => {
  if (req.role !== 'admin') return res.status(403).json({ message: 'Akses ditolak' });
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM category WHERE id_category = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Kategori tidak ditemukan' });
    res.json({ message: 'Kategori berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;