package pluginbridge

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * The Plugin Manager at Komga's address: everything under [BASE] is forwarded to the Plugin Host
 * and only Komga admins get through.
 *
 * The route sits under the /api prefix on purpose: Komga's own security chain covers that prefix, so the
 * admin's normal login (session cookie, Basic or API key) applies, an anonymous request gets 401,
 * and a user without the ADMIN role gets 403 from @PreAuthorize. No separate login exists.
 *
 * Forwarding: [BASE]/api/... goes to the Plugin Host's /api/... (its plugin data), everything
 * else to its /manager/... (the page and its files). A request that changes state must carry
 * `X-Requested-With`, which the Plugin Manager's own page always sends; browsers will not add it
 * to a cross-site form post, so a page on another site cannot act as the admin.
 *
 * The class and method are `open` so Spring can proxy them for @PreAuthorize.
 */
@RestController
open class PluginManagerController(
  private val proxy: PluginHostProxy,
) {
  @RequestMapping(BASE, "$BASE/**")
  @PreAuthorize("hasRole('ADMIN')")
  open fun handle(
    request: HttpServletRequest,
    response: HttpServletResponse,
  ) {
    val rest = request.requestURI.removePrefix(request.contextPath).removePrefix(BASE)
    when {
      rest.isEmpty() -> {
        // The page uses relative links, so it must be served from a path ending in a slash.
        response.status = HttpServletResponse.SC_MOVED_TEMPORARILY
        response.setHeader("Location", request.requestURI + "/" + (request.queryString?.let { "?$it" } ?: ""))
      }
      rest.contains("..") || rest.contains("%2e", ignoreCase = true) || rest.contains("\\") ->
        response.status = HttpServletResponse.SC_BAD_REQUEST
      request.method !in SAFE_METHODS && request.getHeader("X-Requested-With").isNullOrEmpty() ->
        response.status = HttpServletResponse.SC_FORBIDDEN
      else -> proxy.forward(request, response, if (rest.startsWith("/api/")) rest else "/manager$rest")
    }
  }

  companion object {
    const val BASE = "/api/v1/plugin-manager"
    private val SAFE_METHODS = setOf("GET", "HEAD", "OPTIONS")
  }
}
