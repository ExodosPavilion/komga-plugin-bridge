package pluginbridge

import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Bean

/** Registers the Plugin Manager route (see [PluginManagerController]). */
@AutoConfiguration
class PluginManagerAutoConfiguration {
  @Bean
  fun pluginManagerController(): PluginManagerController = PluginManagerController(PluginHostProxy(PluginHostConfig.defaultFile()))
}
