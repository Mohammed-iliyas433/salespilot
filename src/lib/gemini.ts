import { GoogleGenAI, Type } from "@google/genai";
import toolsDb from "./tools-db.json";

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "undefined" || apiKey.trim() === "") {
    throw new Error("GEMINI_API_KEY is not configured. Please add it to your environment variables or AI Studio Secrets.");
  }
  return new GoogleGenAI({ apiKey, apiVersion: "v1" });
}

export async function extractLeadInfo(text: string, filePart?: { mimeType: string, data: string }) {
  try {
    const ai = getAI();
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
      
      Text Input: ${text || "None provided"}`;

    const parts: any[] = [{ text: prompt }];
    if (filePart) {
      parts.push({
        inlineData: {
          mimeType: filePart.mimeType,
          data: filePart.data
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: { parts },
      config: {
        responseJsonSchema: {
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
          required: ["isComplete", "toolFound", "followUpPrompt"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    
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
    console.error("Gemini Extraction Error:", error);
    return { error: error.message || "Failed to extract lead info" };
  }
}

export async function generateProposal(lead: any) {
  try {
    const ai = getAI();
    const tool = toolsDb.find(t => t.name === lead.toolName) || toolsDb[0];
    
    const prompt = `Generate a professional sales proposal for ${tool.name}.
      Lead: ${JSON.stringify(lead)}
      Tool Details: ${JSON.stringify(tool)}
      
      Pricing Logic: 
      - Base price: $${tool.price}/user/month.
      - Allowable discount range: ${tool.minDiscount}% to ${tool.maxDiscount}%.
      - Initial discount should be conservative (closer to ${tool.minDiscount}%).
      
      Return JSON with fields: basePrice, discountPercent, finalPrice, terms.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            basePrice: { type: Type.NUMBER },
            discountPercent: { type: Type.NUMBER },
            finalPrice: { type: Type.NUMBER },
            terms: { type: Type.STRING },
          },
          required: ["basePrice", "discountPercent", "finalPrice", "terms"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return { ...parsed, toolName: tool.name };
  } catch (error: any) {
    console.error("Gemini Proposal Error:", error);
    return { error: error.message || "Failed to generate proposal" };
  }
}

export async function negotiateProposal(proposal: any, userMessage: string, history: any[]) {
  try {
    const ai = getAI();
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

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            message: { type: Type.STRING },
            newDiscountPercent: { type: Type.NUMBER },
            newFinalPrice: { type: Type.NUMBER },
            status: { type: Type.STRING },
            actionTrigger: { type: Type.STRING },
          },
          required: ["message", "status", "newDiscountPercent", "newFinalPrice"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    return parsed;
  } catch (error: any) {
    console.error("Gemini Negotiation Error:", error);
    return { error: error.message || "Negotiation protocol failure" };
  }
}
