import express from "express";
import path from "path";
import multer from "multer";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup multer for memory storage with limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Shareable Gemini client initialization
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// API: Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API: Analyze contract
app.post("/api/analyze", upload.single("contract"), async (req, res) => {
  try {
    const file = req.file;
    const contractType = req.body.contractType || "General Contract";

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Only PDF files are supported" });
    }

    // Extract text from PDF
    const data = await pdf(file.buffer);
    const contractText = data.text;

    if (!contractText || contractText.trim().length === 0) {
      return res.status(400).json({ error: "Could not extract text from PDF. It might be an image-only PDF." });
    }

    const prompt = `
    You are a senior legal analyst specializing in contract risk management. 
    Analyze the following ${contractType} and provide a detailed report.
    
    Document Text:
    ${contractText}
    
    IMPORTANT: Provide the response in a structured JSON format with the following keys:
    - riskScore: (0-100, number)
    - executiveSummary: (3-sentence summary, string)
    - highRiskClauses: (Array of objects with 'clause', 'plainEnglish', and 'implication')
    - missingProtections: (Array of strings)
    - negotiationRecommendations: (Array of strings)
    
    Format the highRiskClauses objects like:
    { "clause": "exact text from contract", "plainEnglish": "simple explanation", "implication": "real-world consequence" }
    
    Be extremely critical. Look for "Missing Protections"—identifying what the drafter intentionally left out to protect themselves at the signer's expense.
    `;

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const report = JSON.parse(result.text || "{}");
    res.json(report);

  } catch (error: any) {
    console.error("Analysis error:", error);
    
    // Check for specific leaked API key error
    if (error.message?.includes("leaked") || error.status === 403) {
      return res.status(403).json({ 
        error: "Your Gemini API Key appears to be invalid or reported as leaked. Please update or provide a new API key in the AI Studio Settings menu.",
        details: error.message
      });
    }
    
    res.status(500).json({ error: error.message || "Failed to analyze contract" });
  }
});

// API: Analyze contract text directly
app.post("/api/analyze-text", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "No text provided" });
    }

    const prompt = `
    You are LexGuard, an AI legal assistant. Analyze the following contract.
    Extract the 3 most important clauses. For each clause, provide:
    1. A 'title'
    2. The exact 'extracted_text'
    3. A severity 'risk_score' from 0-10
    4. A 'plain_language_explanation' of why this is risky.
    
    Respond ONLY in valid JSON format like:
    [
        { "id": "1", "title": "...", "extracted_text": "...", "risk_score": 8, "plain_language_explanation": "..." }
    ]
    
    Contract Text:
    ${text}
    `;

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    res.json(JSON.parse(result.text || "[]"));

  } catch (error: any) {
    console.error("Text analysis error:", error);
    
    // Check for specific leaked API key error
    if (error.message?.includes("leaked") || error.status === 403) {
      return res.status(403).json({ 
        error: "Your Gemini API Key appears to be invalid or reported as leaked. Please update or provide a new API key in the AI Studio Settings menu.",
        details: error.message
      });
    }
    
    res.status(500).json({ error: error.message || "Failed to analyze contract text" });
  }
});

// API: Chat with LexGuard
app.post("/api/chat", async (req, res) => {
  try {
    const { message, documentText } = req.body;

    const prompt = `
    You are LexGuard, an AI legal assistant. 
    The user is asking a question about their uploaded contract.
    
    Contract Text Context:
    ${documentText || "No contract uploaded yet."}
    
    User Question: ${message}
    
    Answer professionally, concisely, and helpfully. Do not give formal legal advice, but rather explain the implications based on the text.
    `;

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    res.json({ reply: result.text });

  } catch (error: any) {
    console.error("Chat error:", error);
    
    // Check for specific leaked API key error
    if (error.message?.includes("leaked") || error.status === 403) {
      return res.status(403).json({ 
        error: "Your Gemini API Key appears to be invalid or reported as leaked. Please update or provide a new API key in the AI Studio Settings menu.",
        details: error.message
      });
    }
    
    res.status(500).json({ error: error.message || "Failed to chat" });
  }
});

async function startServer() {
  console.log("Starting LexGuard server...");
  try {
    if (process.env.NODE_ENV !== "production") {
      console.log("Initializing Vite in development mode...");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware attached.");
    } else {
      const distPath = path.join(process.cwd(), "dist");
      console.log(`Serving static files from: ${distPath}`);
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`LEXGUARD Backend running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error("FATAL: Critical server startup error:", err);
    process.exit(1);
  }
}

startServer().catch(err => {
  console.error("Unhandled promise rejection during startup:", err);
  process.exit(1);
});
