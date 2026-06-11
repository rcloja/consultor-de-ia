// Validação centralizada dos payloads enviados ao endpoint
// https://admin.atendenteai.com.br/api/consultor.php
// e interpretação das respostas recebidas.

export type ValidationResult = { ok: true; motivo?: undefined } | { ok: false; motivo: string };

const AGENTE_REGEX = /^[A-Za-z0-9_-]{1,128}$/;

export function validarAgente(id: unknown): ValidationResult {
  if (typeof id !== "string" || !id.trim()) {
    return {
      ok: false,
      motivo:
        "ID do agente ausente. Acesse esta página pelo botão 'NOVO AGENTE' do AtendenteAI para que o ID seja informado via ?agente=.",
    };
  }
  if (!AGENTE_REGEX.test(id.trim())) {
    return {
      ok: false,
      motivo: "ID do agente em formato inválido (apenas letras, números, '-' e '_', até 128 caracteres).",
    };
  }
  return { ok: true };
}

export function validarBase(base: unknown): ValidationResult {
  if (!base || typeof base !== "object" || Array.isArray(base)) {
    return { ok: false, motivo: "Base de conhecimento ausente ou em formato inválido." };
  }
  const entries = Object.entries(base as Record<string, unknown>);
  if (!entries.length) {
    return { ok: false, motivo: "Base de conhecimento vazia — responda ao menos uma pergunta antes de enviar." };
  }
  const temConteudo = entries.some(([, v]) =>
    Array.isArray(v)
      ? v.some((x) => typeof x === "string" && x.trim().length > 0)
      : typeof v === "string" && (v as string).trim().length > 0,
  );
  if (!temConteudo) {
    return { ok: false, motivo: "Nenhuma resposta preenchida na base — não há conteúdo válido para enviar." };
  }
  return { ok: true };
}

export function validarPergunta(pergunta: unknown, etapa: unknown): ValidationResult {
  if (typeof pergunta !== "string" || !pergunta.trim()) {
    return { ok: false, motivo: "Pergunta vazia — etapa não pode ser registrada sem texto." };
  }
  if (typeof etapa !== "string" || !etapa.trim()) {
    return { ok: false, motivo: "Etapa atual não identificada." };
  }
  return { ok: true };
}

export interface PayloadBase {
  agente?: string | null;
  modo: string;
  base?: unknown;
  lacunas?: unknown;
  pergunta?: unknown;
  etapa_atual?: unknown;
}

const MODOS_COM_BASE = new Set([
  "criacao_finalizada",
  "criacao_parcial",
  "criacao_autosave",
  "atualizacao_finalizada",
]);

export function validarPayload(p: PayloadBase): ValidationResult {
  const a = validarAgenteExterno(p.agente_externo);
  if (!a.ok) return a;

  if (!p.modo || typeof p.modo !== "string") {
    return { ok: false, motivo: "Modo de envio não definido." };
  }

  if (MODOS_COM_BASE.has(p.modo)) {
    const b = validarBase(p.base);
    if (!b.ok) return b;
    if (p.lacunas !== undefined && !Array.isArray(p.lacunas)) {
      return { ok: false, motivo: "Campo 'lacunas' deve ser uma lista." };
    }
  }

  if (p.pergunta !== undefined) {
    const q = validarPergunta(p.pergunta, p.etapa_atual);
    if (!q.ok) return q;
  }

  return { ok: true };
}

// ---------- Interpretação da resposta do servidor ----------

export interface RespostaInterpretada {
  ok: boolean;
  motivo?: string;
  raw?: unknown;
  status?: number;
}

export async function interpretarResposta(resp: Response): Promise<RespostaInterpretada> {
  // Respostas opacas (no-cors) não podem ser lidas — não dá pra validar
  if (resp.type === "opaque") {
    return { ok: true, motivo: "Resposta opaca (sem CORS) — envio sem confirmação do servidor." };
  }
  if (!resp.ok) {
    let bodyTxt = "";
    try { bodyTxt = (await resp.text()).slice(0, 240); } catch { /* noop */ }
    return {
      ok: false,
      status: resp.status,
      motivo: `O servidor respondeu com erro HTTP ${resp.status}.${bodyTxt ? ` Detalhe: ${bodyTxt}` : ""}`,
    };
  }
  const ct = resp.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const data: unknown = await resp.json();
      if (data && typeof data === "object") {
        const d = data as Record<string, unknown>;
        const flag = d.success ?? d.ok ?? d.status;
        if (flag === false || flag === "error" || flag === "erro" || flag === "fail") {
          const msg = (d.message ?? d.erro ?? d.error) as string | undefined;
          return { ok: false, raw: data, motivo: msg || "O servidor reportou falha ao processar o envio." };
        }
      }
      return { ok: true, raw: data };
    }
    const txt = (await resp.text()).trim();
    if (!txt) return { ok: true, raw: "" };
    if (/^\s*(erro|error|fail|denied|invalid)/i.test(txt)) {
      return { ok: false, raw: txt, motivo: `Resposta do servidor sinaliza falha: ${txt.slice(0, 200)}` };
    }
    return { ok: true, raw: txt };
  } catch {
    return { ok: false, motivo: "Resposta do servidor em formato inválido (não foi possível interpretar)." };
  }
}
