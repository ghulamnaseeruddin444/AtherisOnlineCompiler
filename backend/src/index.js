import "dotenv/config";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import passport from "passport";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { connectDB } from "./config/db.js";
import { configurePassport } from "./config/passport.js";

// Routes
import authRoutes from "./routes/auth.js";
import executeRoutes from "./routes/execute.js";
import snippetRoutes from "./routes/snippets.js";
import aiRoutes from "./routes/ai.js";
import usersRoutes from "./routes/users.js";
import historyRoutes from "./routes/history.js";
import apiKeysRoutes from "./routes/apiKeys.js";
import webhooksRoutes from "./routes/webhooks.js";
import statsRoutes from "./routes/stats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Node 18+ DNS / Network workarounds
dns.setDefaultResultOrder("ipv4first");
http.globalAgent.keepAlive = false;
https.globalAgent.keepAlive = false;

// Fail fast if JWT_SECRET is missing
if (!process.env.JWT_SECRET || !process.env.JWT_SECRET.trim()) {
  console.error("[startup] JWT_SECRET is missing. Set it in your environment variables.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);

// CORS
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://atheris-online-compiler-frontend.vercel.app",
      /\.vercel\.app$/,
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "3mb" }));

configurePassport();
app.use(passport.initialize());

// Health check (kept above everything else)
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", uptime: process.uptime() })
);

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/execute", executeRoutes);
app.use("/api/snippets", snippetRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/api-keys", apiKeysRoutes);
app.use("/api/webhooks", webhooksRoutes);
app.use("/api/stats", statsRoutes);

// Serve the frontend build only if it exists in this deployment
const distDir = path.join(__dirname, "..", "..", "frontend", "dist");
const hasFrontend = fs.existsSync(path.join(distDir, "index.html"));

if (hasFrontend) {
  app.use(express.static(distDir));
}

// Centralized error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.publicMessage || "Something went wrong." });
});

// SPA catch-all (only if the frontend is bundled), otherwise 404 JSON
app.get("*", (_req, res) => {
  if (hasFrontend) return res.sendFile(path.join(distDir, "index.html"));
  res.status(404).json({ message: "Not found" });
});

const PORT = process.env.PORT || 4000;

// Start listening FIRST so the healthcheck passes, then connect the DB
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] Atheris backend listening on port ${PORT}`);
});

connectDB()
  .then(() => console.log("[db] connected"))
  .catch((err) => console.error("[db] Critical failed database initialization:", err));

export default app;