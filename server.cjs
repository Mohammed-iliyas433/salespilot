require("dotenv/config");
const express = require("express");
const { createServer: createViteServer } = require("vite");
const path = require("path");
const multer = require("multer");
const mammoth = require("mammoth");
const cors = require("cors");

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Route: DOCX Text Extraction
  app.post("/api/docx-to-text", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      const buffer = req.file.buffer;
      const docData = await mammoth.extractRawText({ buffer });
      res.json({ text: docData.value });
    } catch (error) {
      console.error("DOCX error:", error);
      res.status(500).json({ error: "DOCX extraction failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configFile: path.resolve(process.cwd(), 'vite.config.ts'),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
