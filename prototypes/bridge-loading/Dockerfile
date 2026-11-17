# THROWAWAY PROTOTYPE for issue #2. Builds the prototype Bridge jar against the jars inside the
# official Komga image, so no JDK is needed on the host.
ARG KOMGA_IMAGE=gotson/komga:1.30.1

FROM ${KOMGA_IMAGE} AS komga

FROM eclipse-temurin:21-jdk AS build
COPY --from=komga /app /komga
WORKDIR /src
COPY src/ src/
COPY resources/ resources/
COPY fixture/ fixture/
COPY manifest.txt .
RUN javac --release 21 -cp "/komga/application.jar:/komga/lib/*" -d classes $(find src -name '*.java') \
 && cp -r resources/. classes/ \
 && jar --create --file bridge.jar --manifest manifest.txt -C classes . \
 && java -Djava.awt.headless=true fixture/MakeFixture.java /library

# Stands in for the Plugin Host's start-up step: copies the Bridge into the volume shared with
# Komga. It also seeds the fixture library volume.
FROM busybox:1.37 AS installer
COPY --from=build /src/bridge.jar /bridge.jar
COPY --from=build /library /library-fixture
CMD ["sh", "-c", "cp /bridge.jar /plugin-bridge/bridge.jar && cp -r /library-fixture/. /library/"]
