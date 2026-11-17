package pluginbridge

import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.servlet.FilterChain
import jakarta.servlet.ServletOutputStream
import jakarta.servlet.WriteListener
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.servlet.http.HttpServletResponseWrapper
import org.springframework.web.filter.OncePerRequestFilter
import java.io.ByteArrayOutputStream
import java.io.OutputStreamWriter
import java.io.PrintWriter

/**
 * Lets plugins filter Komga's JSON API responses, for the bundled web UI only. Third-party
 * apps and OPDS readers always get Komga's own response.
 *
 * A request is the web UI's when it carries `X-Requested-With: XMLHttpRequest` (both bundled
 * UIs send it on every API call) and is authenticated by the session cookie, with neither an
 * API key nor an Authorization header. That is a heuristic to tell clients apart, not security.
 *
 * Nothing is wrapped or buffered unless the request qualifies AND some plugin filters that
 * route (see [ResponseFilterRoutes]); every other request goes straight down the chain
 * untouched. Whatever goes wrong while filtering, the original response bytes are sent.
 */
class ResponseFilter(
  private val routes: ResponseFilterRoutes,
  private val client: PluginHostClient,
) : OncePerRequestFilter() {
  private val mapper = ObjectMapper()

  override fun shouldNotFilter(request: HttpServletRequest): Boolean {
    if (routes.isEmpty()) return true
    val path = request.requestURI.removePrefix(request.contextPath)
    return !path.startsWith("/api/") || !isWebUi(request) || !routes.matches(path)
  }

  override fun doFilterInternal(
    request: HttpServletRequest,
    response: HttpServletResponse,
    chain: FilterChain,
  ) {
    val buffered = BufferingResponse(response)
    chain.doFilter(request, buffered)
    val original = buffered.bytes()
    var output = original
    try {
      if (response.status == HttpServletResponse.SC_OK &&
        response.contentType?.startsWith("application/json") == true &&
        response.getHeader("Content-Encoding") == null &&
        !response.isCommitted
      ) {
        val path = request.requestURI.removePrefix(request.contextPath)
        val answer =
          client.post(
            "/bridge/response-filter",
            mapOf(
              "request" to mapOf("method" to request.method, "path" to path, "query" to (request.queryString ?: "")),
              "body" to mapper.readTree(original),
            ),
          )
        if (answer != null && answer.path("changed").asBoolean(false) && answer.has("body")) {
          output = mapper.writeValueAsBytes(answer.get("body"))
        }
      }
    } catch (e: Exception) {
      println("[plugin-bridge] response filter skipped: $e")
      output = original
    }
    if (!response.isCommitted) {
      response.setContentLength(output.size)
      response.outputStream.write(output)
    }
  }

  private fun isWebUi(request: HttpServletRequest): Boolean =
    "XMLHttpRequest".equals(request.getHeader("X-Requested-With"), ignoreCase = true) &&
      request.getHeader("X-API-Key") == null &&
      request.getHeader("Authorization") == null

  /** Collects the body instead of sending it, and hides Content-Length so it can be changed. */
  private class BufferingResponse(
    response: HttpServletResponse,
  ) : HttpServletResponseWrapper(response) {
    private val buffer = ByteArrayOutputStream()
    private var writer: PrintWriter? = null
    private val stream =
      object : ServletOutputStream() {
        override fun write(b: Int) = buffer.write(b)

        override fun write(
          b: ByteArray,
          off: Int,
          len: Int,
        ) = buffer.write(b, off, len)

        override fun isReady(): Boolean = true

        override fun setWriteListener(listener: WriteListener?) {}
      }

    fun bytes(): ByteArray {
      writer?.flush()
      return buffer.toByteArray()
    }

    override fun getOutputStream(): ServletOutputStream = stream

    override fun getWriter(): PrintWriter =
      writer ?: PrintWriter(OutputStreamWriter(buffer, characterEncoding)).also { writer = it }

    override fun flushBuffer() {}

    override fun resetBuffer() = buffer.reset()

    override fun reset() {
      buffer.reset()
      super.reset()
    }

    override fun setContentLength(len: Int) {}

    override fun setContentLengthLong(len: Long) {}

    override fun setHeader(
      name: String,
      value: String?,
    ) {
      if (!name.equals("Content-Length", ignoreCase = true)) super.setHeader(name, value)
    }

    override fun addHeader(
      name: String,
      value: String?,
    ) {
      if (!name.equals("Content-Length", ignoreCase = true)) super.addHeader(name, value)
    }
  }
}
