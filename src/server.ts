import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { OgustApi, type JsonObject } from "./api.js";
import catalog from "./catalog.json" with { type: "json" };

const documentation = "https://login.ogust.app/api/v2/documentation.php";
const resources = Object.keys(catalog) as Array<keyof typeof catalog>;
const dataResources = resources.filter((resource) => resource !== "list");
const writableResources = dataResources.filter((resource) => resource !== "historyLog" && resource !== "communication");
const params = z.record(z.string(), z.json());
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const mutation = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

function method(verb: string, resource: string): string {
  return verb + resource.charAt(0).toUpperCase() + resource.slice(1);
}

function result(data: JsonObject) {
  return {
    structuredContent: data,
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  };
}

function failure(error: unknown) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: error instanceof Error ? error.message : "Appel Ogust impossible." }],
  };
}

export function createServer(api: OgustApi, fullAccess: boolean): McpServer {
  const server = new McpServer(
    { name: "ogust-mcp-server", version: "0.1.0" },
    { instructions: "Consultez ogust_catalog pour trouver les champs, puis utilisez les outils de recherche, lecture ou modification Ogust. Demandez une confirmation explicite avant une suppression." },
  );

  server.registerTool("ogust_catalog", {
    description: "Liste les objets Ogust ou détaille les champs et méthodes routées par le MCP. Ogust détermine les opérations disponibles pour le compte.",
    inputSchema: z.strictObject({ resource: z.enum(resources).optional() }),
    outputSchema: params,
    annotations: { ...readOnly, openWorldHint: false },
  }, ({ resource }) => {
    const access = fullAccess ? "full" : "read";
    if (!resource) return result({ access, resources, documentation });
    const methods = resource === "list" ? ["getList"] : [method("get", resource), method("search", resource)];
    if (fullAccess && resource !== "list" && resource !== "communication" && resource !== "historyLog") {
      methods.push(method("set", resource), method("rem", resource));
    }
    return result({ access, resource, methods, ...catalog[resource], documentation: `${documentation}#${resource}` });
  });

  server.registerTool("ogust_verify_auth", {
    description: "Vérifie que le serveur peut obtenir un jeton Ogust valide, sans retourner le jeton ni les clés.",
    inputSchema: z.strictObject({}),
    outputSchema: z.strictObject({ authenticated: z.boolean() }),
    annotations: readOnly,
  }, async () => {
    try {
      await api.verifyAuthentication();
      return result({ authenticated: true });
    } catch (error) {
      return failure(error);
    }
  });

  async function call(name: string, fields: JsonObject, reading: boolean, signal: AbortSignal) {
    try {
      return result(await api.call(name, fields, reading, signal));
    } catch (error) {
      return failure(error);
    }
  }

  server.registerTool("ogust_search", {
    description: "Recherche des objets Ogust par champs et retourne une page avec les métadonnées Ogust. Exemple de filtre : {last_name: 'Dup%'} ou {status: '@=|Actif'}.",
    inputSchema: z.strictObject({
      resource: z.enum(dataResources),
      filters: params.default({}).describe("Filtres Ogust. Utilisez des objets ou tableaux JSON pour les champs imbriqués."),
      pagenum: z.number().int().positive().default(1),
      nbperpage: z.number().int().positive().default(20),
    }),
    outputSchema: params,
    annotations: readOnly,
  }, ({ resource, filters, pagenum, nbperpage }, ctx) =>
    call(method("search", resource), { ...filters, pagenum, nbperpage }, true, ctx.mcpReq.signal));

  server.registerTool("ogust_get", {
    description: "Lit un objet Ogust. Passez l’identifiant ou les champs de la clé composite documentés pour cet objet.",
    inputSchema: z.strictObject({
      resource: z.enum(dataResources),
      params: params.describe("Par exemple {id_customer: '123456'} pour customer."),
    }),
    outputSchema: params,
    annotations: readOnly,
  }, ({ resource, params }, ctx) => call(method("get", resource), params, true, ctx.mcpReq.signal));

  server.registerTool("ogust_get_list", {
    description: "Lit les valeurs autorisées d’un champ Ogust via getList.",
    inputSchema: z.strictObject({ key: z.string().min(1).describe("Par exemple customer.method_of_payment.") }),
    outputSchema: params,
    annotations: readOnly,
  }, ({ key }, ctx) => call("getList", { key }, true, ctx.mcpReq.signal));

  if (fullAccess) {
    server.registerTool("ogust_set", {
      description: "Crée ou met à jour un objet Ogust. Passez son identifiant pour une mise à jour et les champs requis pour une création.",
      inputSchema: z.strictObject({
        resource: z.enum(writableResources),
        params: params.describe("Champs à envoyer à Ogust. Les objets et tableaux imbriqués sont acceptés."),
      }),
      outputSchema: params,
      annotations: mutation,
    }, ({ resource, params }, ctx) => call(method("set", resource), params, false, ctx.mcpReq.signal));

    server.registerTool("ogust_remove", {
      description: "Supprime un objet Ogust. Utilisez l’identifiant ou la clé composite documentée. Cette opération peut être irréversible.",
      inputSchema: z.strictObject({
        resource: z.enum(writableResources),
        params: params.describe("Par exemple {id_customer: '123456'} pour customer."),
      }),
      outputSchema: params,
      annotations: mutation,
    }, ({ resource, params }, ctx) => call(method("rem", resource), params, false, ctx.mcpReq.signal));
  }
  return server;
}
