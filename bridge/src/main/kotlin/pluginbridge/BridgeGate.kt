package pluginbridge

import org.springframework.boot.autoconfigure.AutoConfigurationImportFilter
import org.springframework.boot.autoconfigure.AutoConfigurationMetadata
import org.springframework.context.EnvironmentAware
import org.springframework.core.env.Environment

/**
 * The one check that decides whether the Bridge does anything. It is true only on a Komga version
 * listed in supported-komga-versions.txt.
 *
 * Every feature is gated by this, without having to opt in: [BridgeGateFilter] stops Spring Boot
 * from importing ANY auto-configuration of this jar (other than the status reporter) on an
 * unsupported version, so none of its beans exist and none of its classes are loaded. A feature
 * added to the Bridge later needs nothing beyond being a normal auto-configuration listed in
 * AutoConfiguration.imports. Code that is not a bean can ask [BridgeGate.evaluate] directly.
 *
 * This file may use only Spring and the JDK, never Komga's classes: it must load on versions
 * whose internals differ.
 */
object BridgeGate {
  /** Name of the optional property that replaces the supported list (used by tests). */
  const val OVERRIDE_PROPERTY = "plugin-bridge.supported-versions"

  /** The auto-configuration that must run on every Komga version, to report the state. */
  const val ALWAYS_ON = "pluginbridge.BridgeStatusAutoConfiguration"

  class Result(
    val active: Boolean,
    val komgaVersion: String?,
    val supportedVersions: List<String>,
    val reason: String?,
  )

  fun evaluate(environment: Environment): Result {
    val override = environment.getProperty(OVERRIDE_PROPERTY)
    val supported = if (override != null) parse(override) else SupportedKomgaVersions.fromResource()
    return evaluate(environment.getProperty("application.version"), supported)
  }

  fun evaluate(
    komgaVersion: String?,
    supported: List<String>,
  ): Result =
    when {
      komgaVersion == null ->
        Result(false, null, supported, "The Komga version could not be determined (supported: ${supported.joinToString()})")
      komgaVersion in supported -> Result(true, komgaVersion, supported, null)
      else ->
        Result(
          false,
          komgaVersion,
          supported,
          "Komga $komgaVersion is not on the Bridge's supported list (${supported.joinToString()}); plugins are off until the Plugin Host is upgraded",
        )
    }

  fun parse(text: String): List<String> =
    text
      .lineSequence()
      .flatMap { it.split(',').asSequence() }
      .map { it.trim() }
      .filter { it.isNotEmpty() && !it.startsWith("#") }
      .toList()
}

object SupportedKomgaVersions {
  fun fromResource(): List<String> {
    val stream = SupportedKomgaVersions::class.java.getResourceAsStream("/supported-komga-versions.txt") ?: return emptyList()
    return stream.use { BridgeGate.parse(String(it.readBytes(), Charsets.UTF_8)) }
  }
}

/** Registered in META-INF/spring.factories. See [BridgeGate]. */
class BridgeGateFilter :
  AutoConfigurationImportFilter,
  EnvironmentAware {
  private var active = false

  override fun setEnvironment(environment: Environment) {
    active = BridgeGate.evaluate(environment).active
  }

  override fun match(
    autoConfigurationClasses: Array<String?>,
    autoConfigurationMetadata: AutoConfigurationMetadata,
  ): BooleanArray =
    BooleanArray(autoConfigurationClasses.size) { i ->
      val name = autoConfigurationClasses[i] ?: ""
      active || !name.startsWith("pluginbridge.") || name == BridgeGate.ALWAYS_ON
    }
}
