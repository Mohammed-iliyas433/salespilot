/**
 * ============================================================================
 * SERVER.TS - Express Backend & File Parsing API Server
 * ============================================================================
 * 
 * PURPOSE:
 * This file sets up the Express.js server that acts as the backend for SalesPilot.
 * It provides:
 * 1. REST API endpoints for extracting raw text from uploaded files (.docx and .pdf).
 * 2. Vite development middleware integration (HMR & bundling during local dev).
 * 3. Static file serving in production mode (serving the compiled dist/ bundle).
 */

import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import { createRequire } from "module";
import mammoth from "mammoth";
import cors from "cors";

// Enables CommonJS 'require' syntax inside an ES Module environment
const require = createRequire(import.meta.url);

/**
 * FILE UPLOAD CONFIGURATION (Multer)
 * Uses in-memory storage so uploaded files (PDFs/DOCX) are stored temporarily
 * as binary buffers in RAM (`req.file.buffer`) rather than saving files to disk.
 */
const upload = multer({ storage: multer.memoryStorage() });

/**
 * FUNCTION: startServer
 * PURPOSE:
 * Initializes the Express app, mounts middleware, defines API endpoints for document
 * extraction, configures Vite/Static asset serving, and binds to port 3000.
 */
async function startServer() {
  const app = express();
  const PORT = 3000;

  // --------------------------------------------------------------------------
  // GLOBAL MIDDLEWARE
  // --------------------------------------------------------------------------
  // Enable Cross-Origin Resource Sharing for API requests
  app.use(cors());
  // Parse incoming JSON request bodies
  app.use(express.json());

  // --------------------------------------------------------------------------
  // API ROUTE: DOCX Text Extraction (/api/docx-to-text)
  // PURPOSE:
  // Receives a single .docx file via multipart/form-data, parses it using the
  // 'mammoth' library, and extracts clean, raw text for LLM lead ingestion.
  // --------------------------------------------------------------------------
  app.post("/api/docx-to-text", upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const buffer = req.file.buffer;
      // Extract raw text from Word document buffer
      const docData = await mammoth.extractRawText({ buffer });
      res.json({ text: docData.value });
    } catch (error) {
      console.error("DOCX error:", error);
      res.status(500).json({ error: "DOCX extraction failed" });
    }
  });

  // --------------------------------------------------------------------------
  // API ROUTE: PDF Text Extraction (/api/pdf-to-text)
  // PURPOSE:
  // Receives a single .pdf file via multipart/form-data, parses it using the
  // 'pdf-parse' library, and returns all plain text content to the client.
  // --------------------------------------------------------------------------
  app.post("/api/pdf-to-text", upload.single("file"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: req.file.buffer });
      const pdfText = await parser.getText();
      res.json({ text: pdfText?.text || pdfText || "" });
    } catch (error) {
      console.error("PDF extraction error:", error);
      res.status(500).json({ error: "PDF extraction failed" });
    }
  });

  // --------------------------------------------------------------------------
  // FRONTEND INTEGRATION: Vite Middleware vs Static Production Files
  // PURPOSE:
  // - Development: Connects Vite as middleware to provide instant Hot Module Replacement (HMR).
  // - Production: Serves static compiled frontend assets from the /dist folder.
  // --------------------------------------------------------------------------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
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

  // --------------------------------------------------------------------------
  // SERVER INITIALIZATION
  // PURPOSE: Starts the HTTP server listening on all network interfaces (0.0.0.0).
  // --------------------------------------------------------------------------
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Execute server startup
startServer();
