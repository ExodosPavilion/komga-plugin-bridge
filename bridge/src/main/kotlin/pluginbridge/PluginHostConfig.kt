package pluginbridge

import com.fasterxml.jackson.databind.ObjectMapper
import java.net.URI
import java.net.http.HttpRequest
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration

/**
 * How to reach the Plugin Host: `bridge.json`, which the Plugin Host writes beside this jar in the
 * shared volume. It is read on every request, so a restarted Plugin Host (new secret) is picked up
 * without restarting Komga. [PluginHostClient] and [PluginHostProxy] both build their requests here.
 */
class PluginHostConfig(
  private val file: Path,
) {
  private val mapper = ObjectMapper()

  /**
   * A request builder aimed at [path] on the Plugin Host, carrying the shared secret. [timeout]
   * defaults to the scan-time limit in `bridge.json`.
   */
  fun request(
    path: String,
    timeout: Duration? = null,
  ): HttpRequest.Builder {
    val config = mapper.readTree(Files.readAllBytes(file))
    return HttpRequest
      .newBuilder(URI.create(config.get("pluginHostUrl").asText() + path))
      .timeout(timeout ?: Duration.ofMillis(config.path("timeoutMillis").asLong(10_000)))
      .header("Authorization", "Bearer " + config.get("secret").asText())
  }

  companion object {
    /** bridge.json next to the jar this class was loaded from. */
    fun defaultFile(): Path =
      try {
        val jar = Path.of(PluginHostConfig::class.java.protectionDomain.codeSource.location.toURI())
        jar.resolveSibling("bridge.json")
      } catch (e: Exception) {
        Path.of("/plugin-bridge/bridge.json")
      }
  }
}
