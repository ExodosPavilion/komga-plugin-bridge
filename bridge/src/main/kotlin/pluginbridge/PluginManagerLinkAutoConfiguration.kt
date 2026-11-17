package pluginbridge

import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean

/**
 * Registers the link to the Plugin Manager in both web UIs (see [PluginManagerLinkFilter]).
 * Exempt from the version gate, like the Plugin Manager route it points to (ADR-0004): Spring and
 * the JDK only.
 */
@AutoConfiguration
class PluginManagerLinkAutoConfiguration {
  @Bean
  fun pluginManagerLinkFilter(): FilterRegistrationBean<PluginManagerLinkFilter> =
    FilterRegistrationBean(PluginManagerLinkFilter()).apply {
      addUrlPatterns("/*")
      order = 0 // same position as the other Bridge filters, after Spring Security's chain
    }
}
