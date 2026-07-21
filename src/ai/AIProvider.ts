/**
 * Abstracción del proveedor de IA para el "Copiloto DJ".
 *
 * DISEÑO GRATIS + PRIVADO:
 *   - Sin clave => el copiloto funciona igual con heurísticas DSP locales
 *     (BPM, tonalidad, rueda Camelot, energía). No hace falta IA externa.
 *   - Con clave (que el usuario introduce y se guarda SOLO en su navegador)
 *     => se habilitan sugerencias en lenguaje natural y descubrimiento de
 *     pistas de YouTube afines.
 *
 * La interfaz es agnóstica del vendor; se incluye una implementación para la
 * API de Claude usando acceso directo desde el navegador.
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AIProvider {
  readonly available: boolean;
  chat(system: string, messages: ChatMessage[], opts?: { json?: boolean }): Promise<string>;
}

/** Proveedor "nulo": no hay IA disponible; el copiloto usa solo heurísticas. */
export class NullProvider implements AIProvider {
  readonly available = false;
  async chat(): Promise<string> {
    throw new Error('IA no configurada');
  }
}

/**
 * Cliente para la API de mensajes de Claude, llamada directamente desde el
 * navegador (sin backend propio). Requiere la cabecera de acceso directo.
 *
 * Nota: la clave viaja solo a la API del proveedor elegido por el usuario;
 * DJMIX no la almacena en ningún servidor.
 */
export class AnthropicProvider implements AIProvider {
  readonly available = true;
  constructor(
    private readonly apiKey: string,
    private readonly model = 'claude-sonnet-5',
  ) {}

  async chat(system: string, messages: ChatMessage[], opts?: { json?: boolean }): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: opts?.json ? `${system}\nResponde SOLO con JSON válido, sin texto extra.` : system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Error IA (${res.status}): ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? '';
    return text;
  }
}

/** Fábrica: construye el proveedor adecuado según la clave disponible. */
export function makeAIProvider(apiKey: string, model?: string): AIProvider {
  if (!apiKey) return new NullProvider();
  return new AnthropicProvider(apiKey, model);
}
