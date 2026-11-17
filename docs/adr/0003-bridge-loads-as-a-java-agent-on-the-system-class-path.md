---
status: accepted
---

# The Bridge loads into stock Komga as a Java agent named in JAVA_TOOL_OPTIONS

ADR-0001 left open how the Bridge gets into the official Docker image. We decided that the Bridge is a single jar, placed in a volume shared with Komga, and loaded by setting `JAVA_TOOL_OPTIONS=-javaagent:/plugin-bridge/bridge.jar` on the Komga container. The Komga service keeps the official image. Compared with an ordinary Komga install, which already has its config and library mounts and its port, the only additions are that volume and that variable.

"Java agent" here names only the JVM's loading mechanism, not the Bridge. The Bridge's `premain` entry point rewrites no bytecode and registers no transformer. It does not need to: the JVM appends every `-javaagent` jar to the system class path. The official image runs Komga as an extracted Spring Boot jar (`java -jar /app/application.jar`, with its dependencies in `/app/lib` named in the manifest's `Class-Path`), so Komga and all its libraries are loaded by that same system class loader. The Bridge can therefore implement Komga's internal interfaces directly. Komga is a `@SpringBootApplication`, so the Bridge's beans are registered through Spring Boot's standard `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` file, and Komga's own constructor injection of `List<SeriesMetadataProvider>` picks them up.

This was proven by the throwaway prototype in `prototypes/bridge-loading/` against `gotson/komga:1.30.1` (Java 25, Spring Boot 3.5.16). The prototype is compiled with `--release 21` against the jars inside that image. Komga did four things:

- It logged that the agent was loaded.
- It registered the prototype's `SeriesMetadataProvider` bean.
- It called that provider during a library scan.
- It returned the provider's fixed summary from `GET /api/v1/series`.

Komga's other provider lists (`BookMetadataProvider`, `SeriesMetadataFromBookProvider`) are injected the same way but were not exercised.

## Considered Options

- **Derived image built from the official one.** This was the fallback. It was not needed and was not tried. It would also have broken ADR-0001's requirement that Komga stays on the official image.
- **Agent that adds the jar to Spring Boot's own class loader, or that rewrites classes.** Not needed, because the official image does not use Spring Boot's nested-jar launcher. This would only be worth revisiting if the image changed (see Consequences).
- **Extra class path entries or `loader.path`.** Not possible. The image's entrypoint is a fixed `java -jar /app/application.jar` command, so its class path comes only from the jar's manifest. `loader.path` is read only by Spring Boot's `PropertiesLauncher`, which the image does not use.

## Consequences

- **The mechanism depends on how the image is packaged.** If a Komga release switched to running a nested "fat" jar through Spring Boot's `JarLauncher`, Komga's classes would move to a child class loader. The Bridge, still on the system class path, could no longer see them. The automated check against each new Komga release (spec #1, build order step 7) must therefore cover loading, and not only behaviour.
- **A missing Bridge jar stops Komga from starting.** When the file named by `-javaagent` is absent, the JVM aborts with `Error opening zip file or JAR manifest missing`. The prototype's `run.sh` checks this against the official image. The Bridge's fail-safe behaviour cannot cover this case. So:
  - The Plugin Host must have put the Bridge in the shared volume before Komga starts.
  - Removing the plugin system means removing `JAVA_TOOL_OPTIONS` as well as the Plugin Host.
  - Setup documentation must say both of these plainly.
- **`JAVA_TOOL_OPTIONS` applies to every JVM started in the container.** In the official image Komga is the only one. An admin who already sets the variable must add the agent to their existing value rather than replace it.
- **The Bridge runs inside Komga's class loader with Komga's libraries.** It must not bundle its own copies of Spring, Kotlin or Jackson. It compiles against the versions Komga ships and is re-verified with each Komga release, as ADR-0001 already requires.
- Komga prints `Picked up JAVA_TOOL_OPTIONS: …` at start. This is harmless, and it gives an early sign that the Bridge is configured.
