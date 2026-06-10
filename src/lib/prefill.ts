import { supabase } from "@/integrations/supabase/client";

export interface PrefillDoc {
  name: string;
  text: string;
}

export interface PrefillResponse {
  base: Record<string, string[]>;
  summary: string;
  sources: string[];
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function chamarPrefill(payload: {
  url?: string;
  documents?: PrefillDoc[];
}): Promise<PrefillResponse> {
  const { data, error } = await supabase.functions.invoke("implantador-prefill", {
    body: payload,
  });
  if (error) {
    throw new Error(error.message ?? "Falha ao processar material.");
  }
  if (!data || typeof (data as { base?: unknown }).base !== "object") {
    throw new Error("Resposta inesperada do servidor de pré-preenchimento.");
  }
  return data as PrefillResponse;
}

/** Lê um arquivo como texto. Suporta PDF, DOCX, MD, TXT. */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return await file.text();
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value ?? "";
  }
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    // pdfjs-dist legacy build funciona melhor para extração de texto em browser
    const pdfjs: typeof import("pdfjs-dist") = await import(
      "pdfjs-dist/legacy/build/pdf.mjs" as unknown as string
    );
    // worker via CDN para evitar configuração de bundler
    // @ts-ignore - GlobalWorkerOptions disponível em runtime
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let out = "";
    const maxPages = Math.min(doc.numPages, 50);
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strs = content.items
        .map((it: { str?: string }) => (typeof it.str === "string" ? it.str : ""))
        .filter(Boolean);
      out += strs.join(" ") + "\n\n";
    }
    return out.trim();
  }
  throw new Error(`Formato não suportado: ${file.name}`);
}
