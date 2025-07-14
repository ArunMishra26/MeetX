import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { connectToSocket } from "./controllers/socketManager.js";
import userRoutes from "./routes/users.routes.js";

dotenv.config(); // Load environment variables

const app = express();
const server = createServer(app);
const io = connectToSocket(server);

// Set the port from env or fallback to 8000
app.set("port", process.env.PORT || 8000);

// Middlewares
app.use(cors());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ limit: "40kb", extended: true }));


app.use("/api/v1/users", userRoutes);


const start = async () => {
  try {
    const connectionDb = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MONGO CONNECTED: ${connectionDb.connection.host}`);

    server.listen(app.get("port"), () => {
      console.log(`🚀 SERVER RUNNING on PORT ${app.get("port")}`);
    });
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB", err);
    process.exit(1);
  }
};

start();
