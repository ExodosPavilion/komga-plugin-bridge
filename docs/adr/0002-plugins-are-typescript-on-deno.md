---
status: accepted
---

# Plugins are written in TypeScript and the Plugin Host runs on Deno

The Bridge has to be Kotlin on the JVM because it lives inside Komga, but the Plugin Host and plugins were a free choice. We decided that plugins are TypeScript and the Plugin Host runs on Deno, with each plugin in its own Deno process. Deno starts a process with only the file, network and environment access it is given, so a plugin's approved capabilities can be enforced by the runtime rather than trusted.

## Considered Options

- **Kotlin/JVM Plugin Host.** One language across the project, but the JVM offers no way to isolate plugins from each other or from the host, so capabilities would be declarations only.
- **One container per plugin, any language.** The strongest isolation, but installing a plugin would mean managing containers, which is too heavy for a single-admin home server and would need access to the Docker daemon.
- **Node.js.** Same language, but its permission model is less mature than Deno's for per-process limits.

## Consequences

- The project has two toolchains: Gradle/Kotlin for the Bridge and Deno/TypeScript for everything else.
- Plugin authors must write TypeScript (or something that compiles to it).
- Capabilities for file and network access map onto Deno's process permissions. Capabilities about Komga's data (such as writing metadata) are not covered by Deno and are enforced by the Plugin Host when a plugin calls the Plugin API.
- One process per plugin costs memory for each enabled plugin.
