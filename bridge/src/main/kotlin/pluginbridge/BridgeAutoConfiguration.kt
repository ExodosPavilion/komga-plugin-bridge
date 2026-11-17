package pluginbridge

import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Bean

/**
 * Registers the Bridge's beans with Komga. Listed in
 * META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports. Each
 * Bridge feature adds its own bean here, in its own class.
 *
 * The class stays final: @AutoConfiguration already turns off CGLIB proxying of bean methods,
 * so the kotlin-spring plugin is not needed.
 */
@AutoConfiguration
class BridgeAutoConfiguration {
  @Bean
  fun pluginHostClient(): PluginHostClient = PluginHostClient(PluginHostClient.defaultConfigFile())

  @Bean
  fun pluginHostEventForwarder(client: PluginHostClient): PluginHostEventForwarder = PluginHostEventForwarder(client)

  @Bean
  fun pluginHostSeriesMetadataProvider(client: PluginHostClient): PluginHostSeriesMetadataProvider {
    println("[plugin-bridge] series metadata provider registered with Komga")
    return PluginHostSeriesMetadataProvider(client)
  }

  @Bean
  fun pluginHostBookMetadataProvider(client: PluginHostClient): PluginHostBookMetadataProvider {
    println("[plugin-bridge] book metadata provider registered with Komga")
    return PluginHostBookMetadataProvider(client)
  }
}
