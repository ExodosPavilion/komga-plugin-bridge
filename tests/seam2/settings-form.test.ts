import assert from "node:assert/strict";
import { startTestHost, type TestHost } from "./support/host.ts";
import { FakeBridge } from "./support/fake-bridge.ts";
// @ts-ignore plain JavaScript: the form's logic as the Plugin Manager page runs it
import { buildValues, errorMessages, secretHint } from "../../plugin-host/src/manager/ui/settings-form.js";
import { withHost as withStartedHost } from "./support/with-host.ts";

// The settings form of the Plugin Manager: its logic, driven by what the host really sends.

const withHost = (body: (bridge: FakeBridge) => Promise<void>) =>
  withStartedHost({ plugins: ["settings-user"] }, (_host, bridge) => body(bridge));

const fieldsOf = async (bridge: FakeBridge) => (await bridge.pluginSettings("settings-user")).body.fields;

Deno.test("the page serves the settings section and its logic, listed from the manifest's fields", () =>
  withHost(async (bridge) => {
    const sections: string[] = await (await bridge.request("/manager/sections.json")).json();
    assert.ok(sections.includes("sections/30-settings.js"));
    for (const file of ["sections/30-settings.js", "settings-form.js"]) {
      const response = await bridge.request(`/manager/${file}`);
      assert.equal(response.status, 200, file);
      await response.body?.cancel();
    }
    const fields = await fieldsOf(bridge);
    assert.deepEqual(fields.map((f: { name: string }) => f.name), ["greeting", "retries", "loud", "token"]);
    assert.equal(fields[0].help, "What to say");
    assert.equal(fields[0].value, "hello", "the default fills the form");
  }));

Deno.test("only changed fields are sent, and an unchanged form sends nothing", () =>
  withHost(async (bridge) => {
    const fields = await fieldsOf(bridge);
    const same = {
      greeting: { text: "hello" },
      retries: { text: "3" },
      loud: { checked: false },
      token: { text: "", clear: false },
    };
    assert.deepEqual(buildValues(fields, same), { values: {}, errors: [] });
    const changed = buildValues(fields, { ...same, retries: { text: "5" }, loud: { checked: true } });
    assert.deepEqual(changed.values, { retries: 5, loud: true });
    const saved = await bridge.saveSettings("settings-user", changed.values);
    assert.equal(saved.status, 200);
  }));

Deno.test("invalid input shows the host's validation message", () =>
  withHost(async (bridge) => {
    const fields = await fieldsOf(bridge);
    // not a number: caught before sending
    const local = buildValues(fields, { retries: { text: "many" } });
    assert.deepEqual(local.errors, ['Setting "retries" must be a number.']);
    // a value the page lets through but the host refuses: its message is what is shown
    const refused = await bridge.saveSettings("settings-user", { retries: "many" });
    assert.equal(refused.status, 400);
    assert.deepEqual(errorMessages(refused.body), ['Setting "retries" must be a number, but got a string.']);
    assert.deepEqual(errorMessages({ error: "boom" }), ["boom"]);
  }));

Deno.test("a secret is never in the form data, a blank secret keeps it, and clearing resets it", () =>
  withHost(async (bridge) => {
    await bridge.saveSettings("settings-user", { token: "s3cr3t-value" });
    const fields = await fieldsOf(bridge);
    assert.ok(!JSON.stringify(fields).includes("s3cr3t-value"));
    const token = fields.find((f: { name: string }) => f.name === "token");
    assert.equal(token.isSet, true);
    assert.match(secretHint(token), /Saved/);

    const untouched = { greeting: { text: "hello" }, retries: { text: "3" }, loud: { checked: false } };
    assert.deepEqual(buildValues(fields, { ...untouched, token: { text: "", clear: false } }).values, {});
    assert.deepEqual(buildValues(fields, { ...untouched, token: { text: "new", clear: false } }).values, { token: "new" });
    assert.deepEqual(buildValues(fields, { ...untouched, token: { text: "", clear: true } }).values, { token: null });

    await bridge.saveSettings("settings-user", { token: null });
    const after = (await fieldsOf(bridge)).find((f: { name: string }) => f.name === "token");
    assert.equal(after.isSet, false);
  }));

Deno.test("a blank field goes back to the manifest default", () =>
  withHost(async (bridge) => {
    await bridge.saveSettings("settings-user", { greeting: "hi" });
    const fields = await fieldsOf(bridge);
    const { values } = buildValues(fields, { greeting: { text: "" }, retries: { text: "3" }, loud: { checked: false } });
    assert.deepEqual(values, { greeting: null });
    await bridge.saveSettings("settings-user", values);
    assert.equal((await fieldsOf(bridge))[0].value, "hello");
  }));
