const getHeaders = (contentType = "application/json") => {
    const headers = {};
    if (contentType) headers["Content-Type"] = contentType;
    
    const customKey = localStorage.getItem("gemini_api_key");
    if (customKey) {
        headers["x-gemini-api-key"] = customKey;
    }
    return headers;
};

export async function analyzeDocumentWithAI(documentText) {
    try {
        const response = await fetch("/api/analyze-text", {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ text: documentText }),
        });
        
        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            let errorMessage = "Analysis failed";
            if (contentType && contentType.includes("application/json")) {
                const errData = await response.json();
                errorMessage = errData.error || errorMessage;
                
                // If it's a 401 or 403, we add a specific instruction
                if (response.status === 401 || response.status === 403) {
                    errorMessage = `API Key Error: ${errorMessage}`;
                }
            } else {
                const text = await response.text();
                console.error("Non-JSON error response:", text);
                errorMessage = `Server Error (${response.status}): The request could not be completed.`;
                if (response.status === 401 || response.status === 403) {
                    errorMessage = "Access Denied: Your API key was blocked or reported as leaked. Please update it in Settings.";
                }
            }
            throw new Error(errorMessage);
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

        const customHeaders = getHeaders(null); // No content-type for multipart
        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: customHeaders,
            body: formData,
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            let errorMessage = "File analysis failed";
            if (contentType && contentType.includes("application/json")) {
                const errData = await response.json();
                errorMessage = errData.error || errorMessage;
            } else {
                errorMessage = `Server Error (${response.status}): The file could not be analyzed.`;
                if (response.status === 401 || response.status === 403) {
                    errorMessage = "Access Denied: Invalid or leaked API key. Please update it in Settings.";
                }
            }
            throw new Error(errorMessage);
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
            headers: getHeaders(),
            body: JSON.stringify({ message, documentText }),
        });
        
        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            let errorMessage = "Chat failed";
            if (contentType && contentType.includes("application/json")) {
                const errData = await response.json();
                errorMessage = errData.error || errorMessage;
            } else {
                errorMessage = "Chat service unavailable (Server Error)";
                if (response.status === 401 || response.status === 403) errorMessage = "Chat Access Denied: Invalid or leaked API key.";
            }
            throw new Error(errorMessage);
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
