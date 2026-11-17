package pluginbridge

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration

/**
 * Calls the Plugin Host. Connection details come from bridge.json, which the Plugin Host writes
 * beside this jar in the shared volume. Every failure (file missing, host down, slow or
 * erroring) yields null: the Bridge must never make a scan fail.
 */
class PluginHostClient(
  private val configFile: Path,
) {
  private val mapper = ObjectMapper()
  private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()

  /** POSTs a JSON body to the Plugin Host and returns the JSON answer, or null on any failure. */
  fun post(
    path: String,
    body: Any,
  ): JsonNode? =
    try {
      val config = mapper.readTree(Files.readAllBytes(configFile))
      val request =
        HttpRequest
          .newBuilder(URI.create(config.get("pluginHostUrl").asText() + path))
          .timeout(Duration.ofMillis(config.path("timeoutMillis").asLong(10_000)))
          .header("Authorization", "Bearer " + config.get("secret").asText())
          .header("Content-Type", "application/json")
          .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
          .build()
      val response = http.send(request, HttpResponse.BodyHandlers.ofByteArray())
      if (response.statusCode() != 200) {
        println("[plugin-bridge] plugin host answered ${response.statusCode()} for $path")
        null
      } else {
        mapper.readTree(response.body())
      }
    } catch (e: InterruptedException) {
      Thread.currentThread().interrupt()
      null
    } catch (e: Exception) {
      println("[plugin-bridge] plugin host unavailable for $path: $e")
      null
    }

  companion object {
    /** bridge.json next to the jar this class was loaded from. */
    fun defaultConfigFile(): Path =
      try {
        val jar = Path.of(PluginHostClient::class.java.protectionDomain.codeSource.location.toURI())
        jar.resolveSibling("bridge.json")
      } catch (e: Exception) {
        Path.of("/plugin-bridge/bridge.json")
      }
  }
}
