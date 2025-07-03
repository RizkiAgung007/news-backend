import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import authRoutes from "./routes/auth.js";
import commentRoutes from "./routes/comment.js";
import newsRoutes from "./routes/news.js";
import categoryRoutes from "./routes/category.js";
import likeRoutes from "./routes/like.js";
import reviewRoutes from "./routes/ulasan.js";
import dotenv from "dotenv";
import path from "path";
import rateLimit from "express-rate-limit";

// =======================================================
// KODE DEBUGGING - Tambahkan ini untuk melihat variabel
console.log("----- DEBUGGING ENVIRONMENT VARIABLES -----");
console.log("ALLOWED_ORIGINS:", process.env.ALLOWED_ORIGINS);
console.log("DB_HOST:", process.env.DB_HOST);
// !!process.env.DB_PASS akan mencetak 'true' jika variabel ada,
// ini lebih aman daripada mencetak password asli ke log.
console.log("DB_PASS is set:", !!process.env.DB_PASS);
console.log("-----------------------------------------");
// =======================================================

dotenv.config();

const app = express();

// const allowOrigins = process.env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim());

// app.use(
//     cors({
//         origin: function (origin, callback) {
//             if (!origin || allowOrigins.includes(origin)) {
//                 callback(null, true);
//             } else {
//                 callback(new Error("Not allowed by CORS: " + origin));
//             }
//         },
//         credentials: true,
//     })
// );

// const allowOrigins = process.env.ALLOWED_ORIGINS
//   ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
//   : [];

// TAMBAHKAN KODE INI SEBAGAI PENGGANTI:
const allowOrigins = [
  "https://rainbow-cocada-69c528.netlify.app",
  "http://localhost:5173",
];

console.log("Allowed Origins (Hardcoded):", allowOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: "));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
// app.use(rateLimit())
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/category", categoryRoutes);
app.use("/api/likes", likeRoutes);
app.use("/api/review", reviewRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
