---
status: accepted
---

# Plugins run in a separate Plugin Host, with only a Bridge inside Komga

Komga has no plugin API, and this project must extend stock Komga without changing its source or involving upstream. We decided that every plugin runs in a separate Plugin Host process, and that the only code loaded into Komga is a small fixed Bridge containing no plugin code. Plugins use only the Plugin API and can do only what their declared capabilities allow.

We chose this for two reasons. First, code inside Komga's JVM cannot be isolated (the Java Security Manager is gone in the JDKs Komga runs on), so a plugin boundary that can ever be enforced has to sit outside Komga's process. Second, only the Bridge is compiled against Komga's internals, so a Komga release can break the Bridge but not the plugins.

## Considered Options

- **Purely external service over Komga's REST API and event stream** (the approach Komf takes). Rejected as the whole answer because it cannot take part in a library scan as a metadata provider, cannot see every internal event, and cannot change what the web UI shows. The REST API is still the preferred channel for everything it can do.
- **Plugins loaded directly into Komga's process.** Rejected because plugins could not be isolated from Komga or each other, and every plugin would be compiled against Komga's internals and break with them.
- **Reverse proxy in front of Komga.** Rejected because it adds a third moving part, forces users to change the address they use for Komga, and still cannot reach scan-time behaviour. The Bridge sees the same requests from inside.
- **Installer that patches the released jar.** Rejected because it must be re-run on every Komga release and does not fit the official Docker image.
- **Maintained fork.** Rejected because Komga ships about 13 releases a year and the merge cost never ends.

## Consequences

- Each scan-time call crosses a process boundary, so a library scan with plugins is slower than an in-process provider would be.
- The Bridge must fail safe: if the Plugin Host is down or slow, Komga carries on as stock Komga.
- The Bridge has to be re-verified against each Komga release and stays inactive on any version it has not been verified against.
- Users run a second container beside Komga, and Komga must restart to pick up a new Bridge.
- How the Bridge gets loaded into the official Docker image is a separate, not yet proven decision.
