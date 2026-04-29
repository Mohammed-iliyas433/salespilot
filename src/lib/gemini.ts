import { GoogleGenAI, Type } from "@google/genai";
import toolsDb from "./tools-db.json";

function getAIConfig() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const grokKey = process.env.GROK_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  
  return {
    geminiKey,
    grokKey,
    groqKey,
    useGrok: !!grokKey && grokKey !== "undefined" && grokKey.trim() !== "",
    useGroq: !!groqKey && groqKey !== "undefined" && groqKey.trim() !== ""
  };
}

async function callAI(prompt: string, schema?: any, image?: { mimeType: string, data: string }) {
  const { useGrok, useGroq, grokKey, groqKey, geminiKey } = getAIConfig();
  const errors: string[] = [];

  // 1. Try Grok (xAI)
  if (useGrok) {
    try {
      return await callGrok(prompt, schema, image);
    } catch (e: any) {
      errors.push(`Grok: ${e.message}`);
      console.warn("Grok failed:", e);
    }
  }

  // 2. Try Groq (groq.com)
  if (useGroq) {
    try {
      return await callGroqAPI(prompt, image);
    } catch (e: any) {
      errors.push(`Groq: ${e.message}`);
      console.warn("Groq failed:", e);
    }
  }

  // 3. Fallback to Gemini
  if (geminiKey && geminiKey !== "undefined" && geminiKey.trim() !== "") {
    try {
      return await callGemini(prompt, schema, image);
    } catch (e: any) {
      errors.push(`Gemini: ${e.message}`);
      console.warn("Gemini failed:", e);
    }
  }

  if (errors.length > 0) {
    const errorMsg = `AI providers failed:\n${errors.join("\n")}\n\nCheck your API keys and model availability.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
  
  throw new Error("No valid AI API key found (Grok, Groq, or Gemini). Please configure your environment variables.");
}

async function callGroqAPI(prompt: string, image?: { mimeType: string, data: string }) {
  const { groqKey } = getAIConfig();
  
  const messages: any[] = [
    {
      role: "system",
      content: "You are a professional sales assistant. Return your response in valid JSON format."
    },
    {
      role: "user",
      content: image ? [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${image.mimeType};base64,${image.data}`
          }
        }
      ] : prompt
    }
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: image ? "meta-llama/llama-4-scout-17b-16e-instruct" : "llama-3.3-70b-versatile",
      messages,
      response_format: { type: "json_object" },
      temperature: 0
    })
  });

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorData = await response.json();
      errorMsg = errorData.error?.message || errorData.message || JSON.stringify(errorData);
    } catch (e) {}
    throw new Error(`Groq API Error: ${errorMsg}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

async function callGemini(prompt: string, schema?: any, image?: { mimeType: string, data: string }) {
  const { geminiKey } = getAIConfig();
  const genAI = new GoogleGenAI({ apiKey: geminiKey! });
  const parts: any[] = [{ text: prompt }];
  
  if (image) {
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data
      }
    });
  }

  const generationConfig: any = {
    responseMimeType: "application/json",
  };

  if (schema) {
    generationConfig.responseSchema = schema;
  }

  const response = await genAI.models.generateContent({
    model: "gemini-1.5-flash",
    contents: { parts },
    config: generationConfig,
  });
  return response.text || "";
}

async function callGrok(prompt: string, jsonSchema?: any, image?: { mimeType: string, data: string }) {
  const { grokKey } = getAIConfig();
  
  if (!grokKey || grokKey === "undefined" || grokKey.trim() === "") {
    throw new Error("Grok API key is missing or invalid.");
  }

  const messages: any[] = [
    {
      role: "system",
      content: "You are a professional sales assistant. Return your response in valid JSON format."
    },
    {
      role: "user",
      content: [
        { type: "text", text: prompt + (jsonSchema ? `\n\nFollow this JSON structure: ${JSON.stringify(jsonSchema)}` : "") }
      ]
    }
  ];

  if (image) {
    messages[1].content.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${image.data}`
      }
    });
  }

  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${grokKey}`
      },
      body: JSON.stringify({
        model: "grok-2", 
        messages,
        response_format: { type: "json_object" },
        temperature: 0
      })
    });

    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const errorData = await response.json();
        errorMsg = errorData.error?.message || errorData.message || JSON.stringify(errorData);
      } catch (e) {
        // Not JSON
      }
      throw new Error(`Grok API Status ${response.status}: ${errorMsg}`);
    }

    const result = await response.json();
    if (!result.choices?.[0]?.message?.content) {
      throw new Error("Invalid response structure from Grok API");
    }
    return result.choices[0].message.content;
  } catch (error: any) {
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      throw new Error("Grok API Connection Failed: This might be a CORS issue or network problem. Check if the API key is valid and allows browser requests.");
    }
    throw error;
  }
}

export async function extractLeadInfo(text: string, filePart?: { mimeType: string, data: string }) {
  const prompt = `Analyze the following lead intake from text and/or attached documents/images.
    Focus on extracting lead details accurately, especially from email headers, footers, or chat signatures.
    
    Available Tools (Catalog): ${toolsDb.map(t => t.name).join(", ")}.
    
    Extraction requirements:
    - companyName: The name of the lead's company.
    - contactName: The full name of the person contacting us. Look in signatures or "From" fields.
    - email: The contact's email address. If an email is shown as "Name (address)" or "Name (domain)", extract the address or infer it (e.g., "John (gmail.com)" -> "john@gmail.com" if "John" is the only name). ONLY provide a valid email format.
    - userCount: Number of seats or users requested (integer).
    - intent: Brief description of what they need.
    - toolName: The name of the software tool they are interested in.
    
    Logic:
    1. Set 'isComplete' to true ONLY if you have extracted: companyName, email, and userCount. toolName is also required for completion.
    2. Set 'toolFound' to true if 'toolName' matches one of the Available Tools in the Catalog (fuzzy match allowed).
    3. If any required information is missing, provide a polite, natural question to ask the user in 'followUpPrompt'.
    
    Return your response as a JSON object with these keys: companyName, contactName, email, userCount, intent, toolName, isComplete, toolFound, followUpPrompt.
    
    Text Input: ${text || "None provided"}`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      companyName: { type: Type.STRING },
      contactName: { type: Type.STRING },
      email: { type: Type.STRING },
      userCount: { type: Type.NUMBER },
      intent: { type: Type.STRING },
      toolName: { type: Type.STRING },
      isComplete: { type: Type.BOOLEAN },
      toolFound: { type: Type.BOOLEAN },
      followUpPrompt: { type: Type.STRING },
    },
    required: ["isComplete", "toolFound", "followUpPrompt"]
  };

  try {
    const resultText = await callAI(prompt, schema, filePart);
    const parsed = JSON.parse(resultText || "{}");
    
    return {
      data: {
        companyName: parsed.companyName || "",
        contactName: parsed.contactName || "",
        email: parsed.email || "",
        userCount: parsed.userCount || 0,
        intent: parsed.intent || "",
        toolName: parsed.toolName || ""
      },
      isComplete: !!parsed.isComplete,
      toolFound: !!parsed.toolFound,
      followUpPrompt: parsed.followUpPrompt || ""
    };
  } catch (error: any) {
    console.error("AI Extraction Error:", error);
    return { error: error.message || "Failed to extract lead info" };
  }
}

export async function generateProposal(lead: any) {
  const { useGrok, geminiKey } = getAIConfig();
  const tool = toolsDb.find(t => t.name === lead.toolName) || toolsDb[0];
  
  const prompt = `Generate a professional sales proposal for ${tool.name}.
    Lead: ${JSON.stringify(lead)}
    Tool Details: ${JSON.stringify(tool)}
    
    Pricing Logic: 
    - Base price: $${tool.price}/user/month.
    - Allowable discount range: ${tool.minDiscount}% to ${tool.maxDiscount}%.
    - Initial discount should be conservative (closer to ${tool.minDiscount}%).
    
    Return JSON with fields: basePrice, discountPercent, finalPrice, terms.`;

  try {
    const resultText = await callAI(prompt);
    const parsed = JSON.parse(resultText || "{}");
    return { ...parsed, toolName: tool.name };
  } catch (error: any) {
    console.error("AI Proposal Error:", error);
    return { error: error.message || "Failed to generate proposal" };
  }
}

export async function negotiateProposal(proposal: any, userMessage: string, history: any[]) {
  const { useGrok, geminiKey } = getAIConfig();
  const tool = toolsDb.find(t => t.name === proposal.toolName) || toolsDb[0];

  const prompt = `You are a sales negotiation agent for ${tool.name}.
    Current Proposal: ${JSON.stringify(proposal)}
    User Message: ${userMessage}
    Negotiation History: ${JSON.stringify(history)}
    Tool Constraints:
    - Min Discount: ${tool.minDiscount}%
    - Max Discount: ${tool.maxDiscount}%
    - Base Price: $${tool.price}/user/month
    
    STRICT RULE: You MUST NOT offer a discount higher than ${tool.maxDiscount}% or lower than ${tool.minDiscount}%. 
    If the user asks for more, politely explain that this is your best offer within authorized corporate limits.
    
    Return JSON with: message (your reply), newDiscountPercent, newFinalPrice, status ('negotiation', 'accepted', or 'rejected'), actionTrigger (null, 'cancel', or 'approve').`;

  try {
    const resultText = await callAI(prompt);
    const parsed = JSON.parse(resultText || "{}");
    return parsed;
  } catch (error: any) {
    console.error("AI Negotiation Error:", error);
    return { error: error.message || "Negotiation protocol failure" };
  }
}

