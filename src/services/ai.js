export async function analyzeDocumentWithAI(documentText) {
    try {
        const response = await fetch("/api/analyze-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: documentText }),
        });
        
        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const errData = await response.json();
                throw new Error(errData.error || "Analysis failed");
            } else {
                const text = await response.text();
                console.error("Non-JSON error response:", text);
                throw new Error(`Server returned error (${response.status}). Please try again later.`);
            }
        }
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        } else {
            throw new Error("Invalid response format from server");
        }
    } catch (error) {
        console.error("AI Analysis failed:", error);
        return [
            {
                id: "1",
                title: "Error occurred",
                extracted_text: "Connection failure",
                risk_score: 5,
                plain_language_explanation: `Could not connect to analysis engine: ${error.message}. Please ensure the server is running.`
            }
        ];
    }
}

export async function analyzeFileWithAI(file) {
    try {
        const formData = new FormData();
        formData.append("contract", file);

        const response = await fetch("/api/analyze", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const errData = await response.json();
                throw new Error(errData.error || "Analysis failed");
            } else {
                throw new Error(`Server error (${response.status}). The file might be too large or invalid.`);
            }
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            return data;
        } else {
            throw new Error("Invalid response format from server");
        }
    } catch (error) {
        console.error("File Analysis failed:", error);
        throw error;
    }
}

export async function askLexGuardChatbot(message, documentText) {
    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, documentText }),
        });
        
        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const errData = await response.json();
                throw new Error(errData.error || "Chat failed");
            } else {
                throw new Error("Chat service unavailable");
            }
        }
        
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            return data.reply;
        } else {
            throw new Error("Invalid chat response");
        }
    } catch (error) {
        console.error("Chatbot failed:", error);
        return "Sorry, I had trouble communicating with the LexGuard brain. Error: " + error.message;
    }
}
