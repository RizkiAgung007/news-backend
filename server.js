import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import authRoutes from './routes/auth.js';
import commentRoutes from './routes/comment.js';
import newsRoutes from './routes/news.js';
import categoryRoutes from './routes/category.js';
import likeRoutes from './routes/like.js'
import reviewRoutes from './routes/ulasan.js';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
// app.use(rateLimit())
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/news', newsRoutes)
app.use('/api/category', categoryRoutes);
app.use('/api/likes', likeRoutes);
app.use('/api/review', reviewRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
