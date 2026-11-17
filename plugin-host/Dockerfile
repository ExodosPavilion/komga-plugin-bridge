# The Plugin Host image. It carries the Bridge, compiled against the jars inside the official
# Komga image so no JDK is needed on the host. Build context is the repository root:
#   docker build -f plugin-host/Dockerfile -t plugin-host .
# The Komga version is a build argument: the Bridge is compiled against the image named here, and
# the release check builds each new Komga that way (scripts/komga-release-check/):
#   docker build -f plugin-host/Dockerfile --build-arg KOMGA_IMAGE=gotson/komga:<version> .
ARG KOMGA_IMAGE=gotson/komga:1.30.1

FROM ${KOMGA_IMAGE} AS komga

FROM eclipse-temurin:21-jdk AS bridge
# The Kotlin compiler matches the kotlin-stdlib inside the Komga image: its version is read from
# that jar, so a Komga release that moves Kotlin needs no change here (KOTLIN_VERSION overrides).
# The stdlib, Spring and Jackson are NOT bundled: the Bridge uses Komga's own (ADR-0003).
ARG KOTLIN_VERSION=
COPY --from=komga /app /komga
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl && rm -rf /var/lib/apt/lists/*
RUN set -e; V="${KOTLIN_VERSION}"; \
  if [ -z "$V" ]; then V="$(ls /komga/lib | sed -n 's/^kotlin-stdlib-\([0-9][0-9.]*\)\.jar$/\1/p' | head -1)"; fi; \
  [ -n "$V" ] || { echo "no kotlin-stdlib jar in the Komga image"; exit 1; }; \
  echo "Compiling the Bridge with Kotlin $V"; \
  curl -fsSL -o /tmp/kotlinc.zip "https://github.com/JetBrains/kotlin/releases/download/v$V/kotlin-compiler-$V.zip"; \
  unzip -q /tmp/kotlinc.zip -d /opt && rm /tmp/kotlinc.zip
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
