import { createHmac, randomInt } from "node:crypto";

const endpoint = "https://api.ogust.app/api/v2/apiogust.php";
const tokenLifetimeMs = 9 * 60_000;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

class OgustError extends Error {
  constructor(message: string, readonly invalidToken = false) {
    super(message);
  }
}

function formData(params: JsonObject): URLSearchParams {
  const form = new URLSearchParams();

  function append(name: string, value: Json): void {
    if (value === null) return;
    if (typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
          throw new OgustError("Les noms de champs Ogust ne peuvent contenir que des lettres ASCII, chiffres, tirets et underscores.");
        }
        append(`${name}[${key}]`, child);
      }
      return;
    }
    form.append(name, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }

  for (const [key, value] of Object.entries(params)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new OgustError("Passez les paramètres imbriqués sous forme d’objets ou de tableaux JSON.");
    }
    append(key, value);
  }
  return form;
}

type Token = { value: string; expiresAt: number };

export class OgustApi {
  private token?: Token;
  private pendingToken?: Promise<Token>;

  constructor(
    private readonly publicKey: string | undefined,
    private readonly privateKey: string | undefined,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async verifyAuthentication(): Promise<void> {
    await this.getToken();
  }

  async call(method: string, params: JsonObject, readOnly: boolean, signal: AbortSignal): Promise<JsonObject> {
    for (const key of Object.keys(params)) {
      if (["token", "api_signature", "method"].includes(key.toLowerCase())) {
        throw new OgustError(`Le paramètre ${key} est réservé au serveur.`);
      }
    }
    const form = formData(params);
    signal.throwIfAborted();

    let token = await this.getToken();
    for (let attempt = 0; ; attempt++) {
      form.set("token", token.value);
      try {
        return await this.request(method, form, signal, token.value);
      } catch (error) {
        if (!(error instanceof OgustError) || !error.invalidToken) throw error;
        if (this.token === token) this.token = undefined;
        if (!readOnly || attempt > 0) throw error;
        signal.throwIfAborted();
        token = await this.getToken();
      }
    }
  }

  private async getToken(): Promise<Token> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token;
    this.pendingToken ??= this.issueToken().finally(() => { this.pendingToken = undefined; });
    return this.pendingToken;
  }

  private async issueToken(): Promise<Token> {
    if (!this.publicKey || !this.privateKey) {
      throw new OgustError("Configurez OGUST_PUBLIC_KEY et OGUST_PRIVATE_KEY dans l’environnement ou le fichier .env local.");
    }
    const issuedAt = Date.now();
    const timestamp = new Date(issuedAt).toISOString().slice(0, 19).replace(/\D/g, "");
    const time = `${timestamp}.${randomInt(100_000, 1_000_000)}`;
    const fields = { key: this.publicKey, request: "GET_TOKEN", time };
    const signature = createHmac("sha1", this.privateKey)
      .update(Object.values(fields).join("+"))
      .digest("hex")
      .toUpperCase();
    const form = new FormData();
    for (const [key, value] of Object.entries({ ...fields, api_signature: signature })) form.set(key, value);

    const result = await this.request("getToken", form, undefined, signature);
    const value = result.token;
    if ((typeof value !== "string" && typeof value !== "number") || value === "") {
      throw new OgustError("Ogust a répondu sans jeton exploitable.");
    }
    const token = { value: String(value), expiresAt: issuedAt + tokenLifetimeMs };
    this.token = token;
    return token;
  }

  private async request(method: string, body: FormData | URLSearchParams, signal?: AbortSignal, secret?: string): Promise<JsonObject> {
    const timeout = AbortSignal.timeout(30_000);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const url = new URL(endpoint);
    url.searchParams.set("method", method);

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "POST",
        body,
        headers: { accept: "application/json" },
        redirect: "error",
        signal: requestSignal,
      });
    } catch {
      if (signal?.aborted) throw new OgustError("Appel Ogust annulé.");
      if (timeout.aborted) throw new OgustError("Ogust n’a pas répondu dans les 30 secondes.");
      throw new OgustError("Connexion HTTPS à Ogust impossible.");
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new OgustError(`Ogust a répondu HTTP ${response.status} à ${method}.`, response.status === 401);
    }

    let result: JsonObject;
    try {
      const json: unknown = await response.json();
      if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error();
      result = json as JsonObject;
    } catch {
      if (signal?.aborted) throw new OgustError("Appel Ogust annulé.");
      if (timeout.aborted) throw new OgustError("Ogust n’a pas terminé sa réponse dans les 30 secondes.");
      throw new OgustError(`Réponse JSON Ogust invalide pour ${method}.`);
    }

    if (result.status !== "OK") {
      const message = typeof result.message === "string" ? result.message : "Statut inattendu.";
      const invalidToken = /^token (invalide|expir[ée]|non renseign[ée])(?:[.!:]|\s|$)/i.test(message.trim());
      let detail = message;
      for (const value of [this.publicKey, this.privateKey, secret]) {
        if (value) detail = detail.replaceAll(value, "[masqué]");
      }
      throw new OgustError(`${method} refusé par Ogust. ${detail.slice(0, 500)}`, invalidToken);
    }

    if (method !== "getToken") {
      delete result.token;
      delete result.api_signature;
    }
    return result;
  }
}
