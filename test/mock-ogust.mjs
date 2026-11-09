import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

let tokens = 0;
let searchCalls = 0;
let writeCalls = 0;

globalThis.fetch = async (url, options) => {
  assert.equal(url.origin, "https://api.ogust.app");
  assert.equal(url.pathname, "/api/v2/apiogust.php");
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  const body = options.body;
  const method = url.searchParams.get("method");
  const ok = (data) => Response.json({ status: "OK", ...data });

  if (method === "getToken") {
    assert.ok(body instanceof FormData);
    assert.equal(body.get("key"), "fixture-public");
    assert.equal(body.get("request"), "GET_TOKEN");
    assert.match(body.get("time"), /^[0-9]{14}\.[0-9]{6}$/);
    const signature = createHmac("sha1", "fixture-private")
      .update(`fixture-public+GET_TOKEN+${body.get("time")}`).digest("hex").toUpperCase();
    assert.equal(body.get("api_signature"), signature);
    return ok({ token: `fixture-token-${++tokens}` });
  }

  assert.ok(body instanceof URLSearchParams);
  assert.equal(body.get("token"), `fixture-token-${tokens}`);
  if (method === "searchCustomer") {
    assert.equal(body.get("last_name"), "Dup%");
    assert.equal(body.get("pagenum"), "2");
    assert.equal(body.get("nbperpage"), "5");
    if (++searchCalls === 1) return Response.json({ status: "KO", message: "Token invalide" });
    assert.equal(tokens, 2);
    return ok({ data: [{ id_customer: "42" }], pagination: { pagenum: 2, nbperpage: 5, count: 7 } });
  }
  if (method === "getCustomer") {
    assert.equal(body.get("id_customer"), "42");
    return ok({ data: { id_customer: "42", last_name: "Dupont" } });
  }
  if (method === "getList") {
    assert.equal(body.get("key"), "customer.method_of_payment");
    return ok({ data: ["Virement"] });
  }
  if (method === "setCustomer") {
    assert.equal(body.get("main_address[line]"), "10 rue Exemple");
    assert.equal(body.get("secondary_address[0][zip]"), "75001");
    assert.equal(body.get("mode"), "0");
    assert.equal(body.get("comment"), null);
    if (++writeCalls === 1) return Response.json({ status: "KO", message: "Token expiré" });
    return ok({ data: "42" });
  }
  if (method === "remCustomer") {
    assert.equal(body.get("id_customer"), "42");
    return ok({});
  }
  throw new Error(`Méthode Ogust inattendue dans le test : ${method}`);
};
