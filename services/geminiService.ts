
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT, MODEL_NAME } from "../constants.ts";
import { Language, ParseResponse, DocNode } from "../types.ts";

export interface FileData {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export const parseDocumentHierarchically = async (
  language: Language,
  text?: string, 
  file?: FileData
): Promise<ParseResponse> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const langLabel = language === 'en' ? 'English' : 'Arabic';
  
  const contents = {
    parts: [
      { text: `Target Language: ${langLabel}. Extract the structure from this UAE regulatory document. Return JSON only.` },
      ...(file ? [{ inlineData: file.inlineData }] : []),
      ...(text ? [{ text: `Reference Text (OCR):\n\n${text}` }] : [])
    ]
  };

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Gemini returned an empty response.");
    }

    const parsed: ParseResponse = JSON.parse(resultText);
    return parsed;
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    // Check for "Unauthorized" or 401 specifically
    if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
      throw new Error("API Key Unauthorized. Please ensure your project has the correct API permissions enabled.");
    }

    throw new Error(error.message || "An unexpected error occurred during processing.");
  }
};
