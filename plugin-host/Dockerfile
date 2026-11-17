# The Plugin Host image. It carries the Bridge, compiled against the jars inside the official
# Komga image so no JDK is needed on the host. Build context is the repository root:
#   docker build -f plugin-host/Dockerfile -t plugin-host .
ARG KOMGA_IMAGE=gotson/komga:1.30.1

FROM ${KOMGA_IMAGE} AS komga

FROM eclipse-temurin:21-jdk AS bridge
COPY --from=komga /app /komga
WORKDIR /src
COPY bridge/ .
RUN mkdir classes \
 && javac --release 21 -cp "/komga/application.jar:/komga/lib/*" -d classes $(find src/main/java -name '*.java') \
 && cp -r src/main/resources/. classes/ \
 && jar --create --file bridge.jar --manifest manifest.txt -C classes .

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
