---
status: accepted
---

# The Plugin Manager and its link stay reachable while the Bridge is inactive

The spec says that on a Komga version not on the Bridge's supported list the Bridge "does nothing at all". We refine that: the Bridge still does nothing to Komga's data or behaviour, but the admin must be able to see why. So three parts stay loaded on every Komga version: the status reporter (`BridgeStatusAutoConfiguration`), the Plugin Manager route (`PluginManagerAutoConfiguration`) and the link to it in both web UIs (`PluginManagerLinkAutoConfiguration`). They are named in `BridgeGate.ALWAYS_ON`, which `BridgeGateFilter` does not filter out.

Everything else stays gated, so the "stock Komga" guarantee holds for what plugins can affect: book and series metadata, event forwarding, response filtering and Plugin Host calls into Komga.

## Rules for the exempt parts

- They may use only Spring, Spring Security and the JDK (plus the Jackson that Spring Boot brings, as the existing Plugin Host client already does), never Komga's own classes, so they load on versions whose internals differ.
- The Plugin Manager route keeps Komga's own security: it sits under `/api`, so anonymous gets 401 and a non-admin 403.
- The link is a script added to the pages that load the web UIs. It changes nothing else on Komga's screens.

## Consequences

- Ticket #20's criterion "With the Bridge inactive, no link is added" is replaced by the opposite: the link is present, and the Plugin Manager's Bridge section shows the inactive state and its reason.
- A new Bridge feature is exempt only if it is added to `ALWAYS_ON` on purpose, under the rules above.
