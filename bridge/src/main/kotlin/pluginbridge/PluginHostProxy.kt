package pluginbridge

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Path
import java.time.Duration

/**
 * Passes one servlet request through to the Plugin Host and streams the answer back. Adds the
 * shared secret (from bridge.json, see [PluginHostClient]) so the caller never sees it. When the
 * Plugin Host cannot be reached the answer is a plain 502.
 */
class PluginHostProxy(
  configFile: Path,
) {
  private val host = PluginHostConfig(configFile)
  private val http =
    HttpClient
      .newBuilder()
      .version(HttpClient.Version.HTTP_1_1)
      .connectTimeout(Duration.ofSeconds(2))
      .build()

  fun forward(
    request: HttpServletRequest,
    response: HttpServletResponse,
    hostPath: String,
  ) {
    try {
      val query = request.queryString?.let { "?$it" } ?: ""
      val builder = host.request(hostPath + query, Duration.ofMinutes(5))
      request.contentType?.let { builder.header("Content-Type", it) }
      request.getHeader("Accept")?.let { builder.header("Accept", it) }
      val hasBody = request.contentLengthLong != 0L && request.method in BODY_METHODS
      builder.method(
        request.method,
        if (hasBody) HttpRequest.BodyPublishers.ofInputStream { request.inputStream } else HttpRequest.BodyPublishers.noBody(),
      )

      val answer = http.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream())
      response.status = answer.statusCode()
      for (name in PASSED_HEADERS) {
        answer.headers().firstValue(name).ifPresent { response.setHeader(name, it) }
      }
      answer.body().use { it.transferTo(response.outputStream) }
    } catch (e: InterruptedException) {
      Thread.currentThread().interrupt()
      unavailable(response)
    } catch (e: Exception) {
      println("[plugin-bridge] plugin host unavailable for ${request.method} $hostPath: $e")
      unavailable(response)
    }
  }

  private fun unavailable(response: HttpServletResponse) {
    if (response.isCommitted) return
    response.reset()
    response.status = HttpServletResponse.SC_BAD_GATEWAY
    response.contentType = "application/json"
    response.writer.write("{\"error\":\"The Plugin Host is not reachable.\"}")
  }

  companion object {
    private val BODY_METHODS = setOf("POST", "PUT", "PATCH", "DELETE")
    private val PASSED_HEADERS = listOf("Content-Type", "Cache-Control", "Content-Disposition")
  }
}
