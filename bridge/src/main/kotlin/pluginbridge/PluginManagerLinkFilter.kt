package pluginbridge

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
import java.nio.charset.Charset

/**
 * Adds the one element the Bridge puts on Komga's screens: a link to the Plugin Manager in the
 * settings of the legacy and the newer web UI. It does so by adding a small script
 * (plugin-manager-link.js) before `</body>` of the pages that load those UIs; the script adds the
 * link to the settings navigation for admins once the single-page app has drawn it.
 *
 * Only page loads are touched: GET requests that accept HTML and are not under /api, /opds or
 * /sse. Everything else goes down the chain unwrapped. If the response is not an HTML page with a
 * `</body>`, or anything fails, the original bytes are sent.
 *
 * Active on every Komga version (ADR-0004), so it may use only Spring and the JDK.
 */
class PluginManagerLinkFilter : OncePerRequestFilter() {
  private val script: String =
    PluginManagerLinkFilter::class.java
      .getResourceAsStream("/plugin-manager-link.js")
      ?.use { String(it.readBytes(), Charsets.UTF_8) }
      ?: ""

  override fun shouldNotFilter(request: HttpServletRequest): Boolean {
    if (script.isEmpty() || request.method != "GET") return true
    if (request.getHeader("Accept")?.contains("text/html") != true) return true
    val path = request.requestURI.removePrefix(request.contextPath)
    return PREFIXES_SKIPPED.any { path == it || path.startsWith("$it/") }
  }

  override fun doFilterInternal(
    request: HttpServletRequest,
    response: HttpServletResponse,
    chain: FilterChain,
  ) {
    val buffered = BufferingResponse(response)
    chain.doFilter(request, buffered)
    var output = buffered.bytes()
    try {
      val charset = charsetOf(response)
      if (response.status == HttpServletResponse.SC_OK &&
        response.contentType?.startsWith("text/html") == true &&
        response.getHeader("Content-Encoding") == null &&
        !response.isCommitted
      ) {
        val html = String(output, charset)
        val end = html.lastIndexOf("</body>")
        if (end >= 0 && !html.contains(MARKER)) {
          output = (html.substring(0, end) + "<script>$script</script>" + html.substring(end)).toByteArray(charset)
        }
      }
    } catch (e: Exception) {
      println("[plugin-bridge] link injection skipped: $e")
    }
    if (!response.isCommitted) {
      response.setContentLength(output.size)
      response.outputStream.write(output)
    }
  }

  private fun charsetOf(response: HttpServletResponse): Charset =
    try {
      Charset.forName(response.characterEncoding ?: "UTF-8")
    } catch (e: Exception) {
      Charsets.UTF_8
    }

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

    override fun getWriter(): PrintWriter = writer ?: PrintWriter(OutputStreamWriter(buffer, characterEncoding)).also { writer = it }

    override fun flushBuffer() {}

    override fun resetBuffer() = buffer.reset()

    override fun reset() {
      buffer.reset()
      super.reset()
    }

    override fun setContentLength(len: Int) {}

    override fun setContentLengthLong(len: Long) {}
  }

  companion object {
    private val PREFIXES_SKIPPED = listOf("/api", "/opds", "/sse")

    /** Present in the injected script, so a page is never injected twice. */
    const val MARKER = "data-plugin-manager-link"
  }
}
