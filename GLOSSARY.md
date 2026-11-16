# Komga Plugin Bridge

A plugin system layered on top of Komga, the comic and manga server, without Komga's source code being changed. It is independent of the Komga project and never contributes to it.

## Language

**Plugin**:
One installable unit that extends Komga. A single plugin may make any mix of contributions.
_Avoid_: Extension, add-on, mod

**Contribution**:
One thing a plugin adds to Komga. Each contribution is of one kind: server behaviour, data and workflow, or web UI.
_Avoid_: Hook, feature

**Server behaviour contribution**:
A contribution that changes what Komga does while it scans or analyses a library, such as reading a custom metadata schema.

**Data and workflow contribution**:
A contribution that reads or changes Komga's data from the outside in response to events or a user action, such as fetching metadata from an online source.

**Web UI contribution**:
A contribution that changes what Komga's bundled web UI shows. Other Komga clients are never targeted.

**Plugin Host**:
The process, separate from Komga, in which every plugin runs. Plugins reach Komga only through it.
_Avoid_: Bridge container, plugin server, sidecar

**Bridge**:
The small fixed component loaded inside Komga that connects it to the Plugin Host. It contains no plugin code.
_Avoid_: Agent, shim, using "bridge" for the Plugin Host or its container

**Capability**:
A named permission a plugin declares it needs, such as writing metadata or reaching the network. A plugin can do nothing it has not declared.
_Avoid_: Permission, scope

**Plugin API**:
The only surface a plugin may use to do anything. It carries its own version, independent of Komga's, and is what a plugin declares compatibility with.
_Avoid_: SDK, plugin interface

**Reference plugin**:
The plugin kept in this repository to prove and test the plugin system. It is not meant for real use; real plugins live in their own repositories.
_Avoid_: Test plugin, sample plugin

**Plugin Manager**:
The admin screen where plugins are installed, removed, enabled and disabled, and where their status, errors and settings are shown. It is not a catalogue of plugins to browse.
_Avoid_: Marketplace, plugin store

**Response filtering**:
A web UI contribution that changes what Komga's API returns to the bundled web UI, without adding anything to the UI's screens.

**Stock Komga**:
An unmodified official Komga release, running exactly as upstream ships it.
_Avoid_: Vanilla, upstream build

**Supported Komga version**:
A Komga release that a given release of the plugin system has been verified against. On any other version the plugin system stays inactive and Komga runs as stock Komga.
