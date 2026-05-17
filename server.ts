import express from "express";
import path from "path";
import multer from "multer";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Setup multer for memory storage with limits
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper to get Gemini client with specific key
const getAiClient = (req: express.Request) => {
  const customKey = req.headers["x-gemini-api-key"] as string;
  const apiKey = customKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("No Gemini API key found. Please provide one in the settings.");
  }
  return new GoogleGenerativeAI(apiKey);
};

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
    const genAI = getAiClient(req);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

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

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const report = JSON.parse(responseText || "{}");
    res.json(report);

  } catch (error: any) {
    console.error("Analysis error:", error);
    
    const message = error.message || String(error);
    if (message.includes("leaked") || message.includes("403") || message.includes("PERMISSION_DENIED")) {
      // Use 401 Unauthorized instead of 403 to avoid generic Nginx 403 HTML override
      return res.status(401).json({ 
        error: "Your Gemini API Key is invalid or reported as leaked. Please go to Settings and provide a new key from AI Studio.",
        details: message,
        isApiKeyError: true
      });
    }
    
    res.status(500).json({ error: message || "Failed to analyze contract" });
  }
});

// API: Analyze contract text directly
app.post("/api/analyze-text", async (req, res) => {
  try {
    const { text } = req.body;
    const genAI = getAiClient(req);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

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

    const result = await model.generateContent(prompt);
    res.json(JSON.parse(result.response.text() || "[]"));

  } catch (error: any) {
    console.error("Text analysis error:", error);
    
    const message = error.message || String(error);
    if (message.includes("leaked") || message.includes("403") || message.includes("PERMISSION_DENIED")) {
      return res.status(401).json({ 
        error: "Your Gemini API Key is invalid or reported as leaked. Please go to Settings and provide a new key from AI Studio.",
        details: message,
        isApiKeyError: true
      });
    }
    
    res.status(500).json({ error: message || "Failed to analyze contract text" });
  }
});

// API: Chat with LexGuard
app.post("/api/chat", async (req, res) => {
  try {
    const { message, documentText } = req.body;
    const genAI = getAiClient(req);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    You are LexGuard, an AI legal assistant. 
    The user is asking a question about their uploaded contract.
    
    Contract Text Context:
    ${documentText || "No contract uploaded yet."}
    
    User Question: ${message}
    
    Answer professionally, concisely, and helpfully. Do not give formal legal advice, but rather explain the implications based on the text.
    `;

    const result = await model.generateContent(prompt);
    res.json({ reply: result.response.text() });

  } catch (error: any) {
    console.error("Chat error:", error);
    
    const message = error.message || String(error);
    if (message.includes("leaked") || message.includes("403") || message.includes("PERMISSION_DENIED")) {
      return res.status(401).json({ 
        error: "Your Gemini API Key is invalid or reported as leaked. Please go to Settings and provide a new key from AI Studio.",
        details: message,
        isApiKeyError: true
      });
    }
    
    res.status(500).json({ error: message || "Failed to chat" });
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
