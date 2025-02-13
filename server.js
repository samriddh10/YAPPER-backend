const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
require("dotenv").config();

// Firebase Admin SDK Setup from .env
const firebaseConfig = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"), // Fix newlines
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || "googleapis.com",
};

// Initialize Firebase Admin
admin.initializeApp({ credential: admin.credential.cert(firebaseConfig) });
const db = getFirestore();

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

// Socket.io Setup with CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ✅ Proper CORS Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());

// Multer Setup for File Uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ✅ Upload Image Route (Fixed)
app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    // Cloudinary upload as a Promise
    const uploadToCloudinary = () =>
      new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "profilePictures" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(req.file.buffer);
      });

    const cloudinaryResult = await uploadToCloudinary();

    // Save URL in Firebase Firestore
    await db.collection("users").doc(userId).update({ photoURL: cloudinaryResult.secure_url });

    return res.json({ message: "Upload successful", url: cloudinaryResult.secure_url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Default Route
app.get("/", (req, res) => {
  res.send("Real-Time Chat Server is running...");
});

// ✅ WebSockets with Socket.io
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("sendMessage", (message) => {
    console.log("Message received:", message);
    io.emit("receiveMessage", message);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Start Server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app; // Required for Vercel Deployment
