package pluginbridge

import com.fasterxml.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

/**
 * The secret the Plugin Host generated at first start, read from bridge.json in the shared
 * volume. Used to check calls from the Plugin Host. Fails closed: if the secret cannot be read,
 * nothing is accepted.
 */
class SharedSecret(
  private val configFile: Path,
) {
  private val mapper = ObjectMapper()

  /** The current secret, or null when bridge.json is missing or unreadable. Read each time, so a host restart is picked up. */
  fun current(): String? =
    try {
      mapper.readTree(Files.readAllBytes(configFile)).get("secret")?.asText()?.takeIf { it.isNotEmpty() }
    } catch (e: Exception) {
      null
    }

  /** True when [authorization] (an Authorization header value) is `Bearer <secret>`. Constant time. */
  fun accepts(authorization: String?): Boolean {
    val secret = current() ?: return false
    if (authorization == null) return false
    return MessageDigest.isEqual(
      authorization.toByteArray(StandardCharsets.UTF_8),
      "Bearer $secret".toByteArray(StandardCharsets.UTF_8),
    )
  }
}
