# The Plugin Host image. It carries the Bridge, compiled against the jars inside the official
# Komga image so no JDK is needed on the host. Build context is the repository root:
#   docker build -f plugin-host/Dockerfile -t plugin-host .
ARG KOMGA_IMAGE=gotson/komga:1.30.1

FROM ${KOMGA_IMAGE} AS komga

FROM eclipse-temurin:21-jdk AS bridge
# Kotlin 2.4.10 matches the kotlin-stdlib inside the Komga image. The stdlib, Spring and Jackson
# are NOT bundled: the Bridge uses Komga's own (ADR-0003).
ARG KOTLIN_VERSION=2.4.10
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl  && rm -rf /var/lib/apt/lists/*  && curl -fsSL -o /tmp/kotlinc.zip https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip  && unzip -q /tmp/kotlinc.zip -d /opt && rm /tmp/kotlinc.zip
COPY --from=komga /app /komga
WORKDIR /src
COPY bridge/ .
RUN mkdir classes  && CP="/komga/application.jar:$(find /komga/lib -name '*.jar' | tr '\n' ':')"  && /opt/kotlinc/bin/kotlinc -jvm-target 21 -no-stdlib -no-reflect -cp "$CP" -d classes src/main/kotlin  && cp -r src/main/resources/. classes/  && jar --create --file bridge.jar --manifest manifest.txt -C classes .

FROM denoland/deno:2.5.6
WORKDIR /app
COPY plugin-host/ /app/
COPY --from=bridge /src/bridge.jar /opt/bridge/bridge.jar
# Volumes mounted here start owned by the deno user. /plugin-bridge is shared with Komga,
# /state is the host's own volume, /plugins is where plugin folders are dropped.
RUN mkdir -p /plugin-bridge /state /plugins && chown deno:deno /plugin-bridge /state /plugins
USER deno
EXPOSE 8080
ENTRYPOINT ["deno", "run", "--allow-read", "--allow-write=/state,/plugin-bridge", "--allow-net", "--allow-env", "--allow-run", "src/main.ts"]
