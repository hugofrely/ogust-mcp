import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

async function connect(t, mode, withKeys) {
  const client = new Client({ name: "ogust-mcp-smoke-test", version: "0.1.0" });
  t.after(() => client.close());
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "./test/mock-ogust.mjs", "dist/index.js"],
    env: {
      OGUST_ACCESS: mode,
      OGUST_PUBLIC_KEY: withKeys ? "fixture-public" : "",
      OGUST_PRIVATE_KEY: withKeys ? "fixture-private" : "",
    },
  }));
  return {
    client,
    call: (name, args = {}) => client.callTool({ name, arguments: args }),
  };
}

function success(result) {
  assert.ok(!result.isError, JSON.stringify(result.content));
  assert.ok(!JSON.stringify(result).includes("fixture-token-"));
  return result.structuredContent;
}

test("stdio, signature, jeton partagé, renouvellement et routage des outils", { timeout: 10_000 }, async (t) => {
  const { client, call } = await connect(t, "full", true);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "ogust_catalog", "ogust_get", "ogust_get_list", "ogust_remove",
    "ogust_search", "ogust_set", "ogust_verify_auth",
  ]);
  assert.equal(tools.find((tool) => tool.name === "ogust_remove").annotations.destructiveHint, true);
  assert.equal(success(await call("ogust_catalog")).resources.length, 62);
  assert.deepEqual(success(await call("ogust_catalog", { resource: "historyLog" })).methods,
    ["getHistoryLog", "searchHistoryLog"]);
  assert.deepEqual(success(await call("ogust_catalog", { resource: "list" })).methods, ["getList"]);

  const auth = await Promise.all([call("ogust_verify_auth"), call("ogust_verify_auth")]);
  for (const response of auth) assert.deepEqual(success(response), { authenticated: true });

  const page = success(await call("ogust_search", {
    resource: "customer", filters: { last_name: "Dup%" }, pagenum: 2, nbperpage: 5,
  }));
  assert.deepEqual(page.pagination, { pagenum: 2, nbperpage: 5, count: 7 });
  const id_customer = page.data[0].id_customer;
  assert.equal(success(await call("ogust_get", { resource: "customer", params: { id_customer } })).data.last_name, "Dupont");
  assert.deepEqual(success(await call("ogust_get_list", { key: "customer.method_of_payment" })).data, ["Virement"]);

  const update = {
    resource: "customer",
    params: { id_customer, main_address: { line: "10 rue Exemple" }, secondary_address: [{ zip: "75001" }], mode: false, comment: null },
  };
  const expiredWrite = await call("ogust_set", update);
  assert.equal(expiredWrite.isError, true);
  assert.match(expiredWrite.content[0].text, /Token expiré/);
  assert.equal(success(await call("ogust_set", update)).data, "42");
  assert.equal(success(await call("ogust_remove", { resource: "customer", params: { id_customer } })).status, "OK");

  const reserved = await call("ogust_get", { resource: "customer", params: { id_customer, token: "injection" } });
  assert.equal(reserved.isError, true);
  assert.match(reserved.content[0].text, /réservé/);
});

test("lecture seule et découverte disponibles sans clé", { timeout: 10_000 }, async (t) => {
  const { client, call } = await connect(t, "read", false);
  const { tools } = await client.listTools();
  assert.ok(!tools.some((tool) => ["ogust_set", "ogust_remove"].includes(tool.name)));
  const catalog = success(await call("ogust_catalog", { resource: "customer" }));
  assert.deepEqual(catalog.methods, ["getCustomer", "searchCustomer"]);
  assert.ok(catalog.requiredForCreate.includes("last_name"));
  const auth = await call("ogust_verify_auth");
  assert.equal(auth.isError, true);
  assert.match(auth.content[0].text, /OGUST_PUBLIC_KEY et OGUST_PRIVATE_KEY/);
});
