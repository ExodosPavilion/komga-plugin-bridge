// THROWAWAY PROTOTYPE for issue #2. Not the production Bridge; delete once the Bridge exists.
package bridgeprototype;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;

/**
 * Listed in META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports,
 * so Komga's @SpringBootApplication picks it up from the class path without any change to Komga.
 */
@AutoConfiguration
public class PrototypeBridgeAutoConfiguration {
    @Bean
    public PrototypeSeriesMetadataProvider prototypeSeriesMetadataProvider() {
        System.out.println("[bridge-prototype] metadata provider bean registered with Komga");
        return new PrototypeSeriesMetadataProvider();
    }
}
