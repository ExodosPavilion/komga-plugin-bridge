package pluginbridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Optional;

/**
 * Calls the Plugin Host. Connection details come from bridge.json, which the Plugin Host writes
 * beside this jar in the shared volume. Every failure (file missing, host down, slow or
 * erroring) yields an empty result: the Bridge must never make a scan fail.
 */
public class PluginHostClient {
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private final Path configFile;

    public PluginHostClient(Path configFile) {
        this.configFile = configFile;
    }

    /** bridge.json next to the jar this class was loaded from. */
    public static Path defaultConfigFile() {
        try {
            Path jar = Path.of(PluginHostClient.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            return jar.resolveSibling("bridge.json");
        } catch (Exception e) {
            return Path.of("/plugin-bridge/bridge.json");
        }
    }

    /** POSTs a JSON body to the Plugin Host and returns the JSON answer, or empty on any failure. */
    public Optional<JsonNode> post(String path, Object body) {
        try {
            JsonNode config = mapper.readTree(Files.readAllBytes(configFile));
            HttpRequest request = HttpRequest.newBuilder(URI.create(config.get("pluginHostUrl").asText() + path))
                    .timeout(Duration.ofMillis(config.path("timeoutMillis").asLong(10_000)))
                    .header("Authorization", "Bearer " + config.get("secret").asText())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();
            HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200) {
                System.out.println("[plugin-bridge] plugin host answered " + response.statusCode() + " for " + path);
                return Optional.empty();
            }
            return Optional.of(mapper.readTree(response.body()));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (Exception e) {
            System.out.println("[plugin-bridge] plugin host unavailable for " + path + ": " + e);
            return Optional.empty();
        }
    }
}
