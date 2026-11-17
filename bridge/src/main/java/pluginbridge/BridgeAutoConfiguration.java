package pluginbridge;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * Registers the Bridge's beans with Komga. Listed in
 * META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports. Each
 * Bridge feature adds its own bean here, in its own class.
 */
@AutoConfiguration
public class BridgeAutoConfiguration {
    @Bean
    public PluginHostClient pluginHostClient() {
        return new PluginHostClient(PluginHostClient.defaultConfigFile());
    }

    @Bean
    public PluginHostSeriesMetadataProvider pluginHostSeriesMetadataProvider(PluginHostClient client) {
        System.out.println("[plugin-bridge] series metadata provider registered with Komga");
        return new PluginHostSeriesMetadataProvider(client);
    }
}
