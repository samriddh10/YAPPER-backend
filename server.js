const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
require("dotenv").config();

// Initialize Firebase Admin
const serviceAccount = require("./yapperdotcom-firebase-adminsdk-fbsvc-f0e2db942b.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
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

const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"],
  },
});

// CORS Middleware (Allow all origins)
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

// Multer Setup for File Uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Upload Image Route
app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const userId = req.body.userId;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    // Convert Cloudinary upload_stream into a Promise
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

app.get("/", (req, res) => {
  res.send("Real-Time Chat Server is running...");
});

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

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
