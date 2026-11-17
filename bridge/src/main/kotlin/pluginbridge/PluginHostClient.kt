package pluginbridge

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Path
import java.time.Duration

/**
 * Calls the Plugin Host. Connection details come from bridge.json, which the Plugin Host writes
 * beside this jar in the shared volume. Every failure (file missing, host down, slow or
 * erroring) yields null: the Bridge must never make a scan fail.
 */
class PluginHostClient(
  configFile: Path,
) {
  private val mapper = ObjectMapper()
  private val host = PluginHostConfig(configFile)
  private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()

  /** POSTs a JSON body to the Plugin Host and returns the JSON answer, or null on any failure. */
  fun post(
    path: String,
    body: Any,
  ): JsonNode? {
    // After a transport failure (host down or too slow) skip the host for a moment, so a scan
    // of thousands of series does not pay the time limit for each one. Books skipped this way
    // get their plugin metadata on the next metadata refresh.
    if (System.nanoTime() < pausedUntilNanos) return null
    val answer = send(path, body)
    if (answer == null) pausedUntilNanos = System.nanoTime() + PAUSE_NANOS
    return answer
  }

  /** GETs from the Plugin Host and returns the JSON answer, or null on any failure. Not paused: callers poll. */
  fun get(path: String): JsonNode? = send(path, null)

  @Volatile private var pausedUntilNanos = System.nanoTime() - 1

  private fun send(
    path: String,
    body: Any?,
  ): JsonNode? =
    try {
      val builder = host.request(path)
      val request =
        if (body == null) {
          builder.GET().build()
        } else {
          builder
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
            .build()
        }
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
    private val PAUSE_NANOS = Duration.ofSeconds(3).toNanos()
  }
}
