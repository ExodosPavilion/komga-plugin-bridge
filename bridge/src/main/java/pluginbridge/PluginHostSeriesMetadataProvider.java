package pluginbridge;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.gotson.komga.domain.model.Library;
import org.gotson.komga.domain.model.MetadataPatchTarget;
import org.gotson.komga.domain.model.Series;
import org.gotson.komga.domain.model.SeriesMetadataPatch;
import org.gotson.komga.infrastructure.metadata.SeriesMetadataProvider;

/** Asks the Plugin Host for series metadata during Komga's scan and metadata refresh. */
public class PluginHostSeriesMetadataProvider implements SeriesMetadataProvider {
    private final PluginHostClient client;

    public PluginHostSeriesMetadataProvider(PluginHostClient client) {
        this.client = client;
    }

    @Override
    public boolean shouldLibraryHandlePatch(Library library, MetadataPatchTarget target) {
        return target == MetadataPatchTarget.SERIES;
    }

    @Override
    public SeriesMetadataPatch getSeriesMetadata(Series series) {
        try {
            Map<String, Object> request = Map.of("series", Map.of(
                    "id", series.getId(),
                    "name", series.getName(),
                    "path", series.getPath().toString(),
                    "libraryId", series.getLibraryId()));
            Optional<JsonNode> answer = client.post("/bridge/series-metadata", request);
            if (answer.isEmpty()) return null;
            JsonNode metadata = answer.get().path("metadata");
            if (!metadata.isObject()) return null;

            Set<String> genres = new LinkedHashSet<>();
            metadata.path("genres").forEach(g -> genres.add(g.asText()));
            return new SeriesMetadataPatch(
                    text(metadata, "title"), null, null, text(metadata, "summary"), null,
                    text(metadata, "publisher"), null, text(metadata, "language"),
                    genres, null, Set.of());
        } catch (Exception e) {
            System.out.println("[plugin-bridge] series metadata skipped: " + e);
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isTextual() ? value.asText() : null;
    }
}
