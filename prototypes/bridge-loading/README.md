# Bridge loading prototype (THROWAWAY)

> **This is not the Bridge.** It is a throwaway prototype for issue #2. It answers one question and will be deleted once the real Bridge exists. Do not build on it.

**Question:** can a Java agent named in `JAVA_TOOL_OPTIONS` make an externally supplied Bridge available to the official Komga Docker image, so that Komga picks it up as a metadata provider, without rewriting any bytecode?

**Answer:** yes, on `gotson/komga:1.30.1`. The decision is recorded in [ADR-0003](../../docs/adr/0003-bridge-loads-as-a-java-agent-on-the-system-class-path.md).

## Contents

- `src/bridgeprototype/PrototypeAgent.java`: the `Premain-Class`. It only logs and registers no transformer.
- `src/bridgeprototype/PrototypeBridgeAutoConfiguration.java`: a Spring Boot auto-configuration, listed in `resources/META-INF/spring/…AutoConfiguration.imports`, that registers the provider bean.
- `src/bridgeprototype/PrototypeSeriesMetadataProvider.java`: implements Komga's `SeriesMetadataProvider` and returns a fixed summary.
- `fixture/MakeFixture.java`: writes a library with one series and one book.
- `Dockerfile`: compiles all of this against the jars inside the official image, so no JDK is needed on the host. The final stage copies the jar into the shared volume, standing in for the Plugin Host.
- `compose.yaml`: the admin's view. A stock Komga service whose only additions are the bridge volume and `JAVA_TOOL_OPTIONS`.
- `run.sh`: the end-to-end check. It brings up the compose project, claims Komga, creates a library and polls the REST API.

The prototype is Java rather than Kotlin only so that the build needs nothing but `javac`. Komga ships `kotlin-stdlib`, so a Kotlin Bridge loads the same way.

## Run it

```sh
sh prototypes/bridge-loading/run.sh   # needs Docker with Compose, and curl; KEEP=1 leaves Komga running on :25699
```

On Windows with the Docker engine inside WSL, run the script inside that WSL distribution.

The script then confirms the failure mode recorded in ADR-0003. When `JAVA_TOOL_OPTIONS` names a Bridge jar that is not there, Komga refuses to start.

Expected tail of the output:

```
Picked up JAVA_TOOL_OPTIONS: -javaagent:/plugin-bridge/bridge.jar
[bridge-prototype] agent loaded; jar is on the system class path (no transformer registered)
[bridge-prototype] metadata provider bean registered with Komga
[bridge-prototype] Komga asked for metadata of series 'Prototype Series'
PASS: stock Komga loaded the prototype Bridge and used it as a metadata provider
```

The script also checks that the summary `Supplied by the bridge-loading prototype` comes back from `GET /api/v1/series`.
