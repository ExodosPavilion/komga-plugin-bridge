// THROWAWAY PROTOTYPE for issue #2. Not the production Bridge; delete once the Bridge exists.
package bridgeprototype;

import java.util.Set;
import org.gotson.komga.domain.model.Library;
import org.gotson.komga.domain.model.MetadataPatchTarget;
import org.gotson.komga.domain.model.Series;
import org.gotson.komga.domain.model.SeriesMetadataPatch;
import org.gotson.komga.infrastructure.metadata.SeriesMetadataProvider;

/** Supplies a fixed series summary so the call is observable through Komga's REST API. */
public class PrototypeSeriesMetadataProvider implements SeriesMetadataProvider {
    public static final String SUMMARY = "Supplied by the bridge-loading prototype";

    @Override
    public boolean shouldLibraryHandlePatch(Library library, MetadataPatchTarget target) {
        return target == MetadataPatchTarget.SERIES;
    }

    @Override
    public SeriesMetadataPatch getSeriesMetadata(Series series) {
        System.out.println("[bridge-prototype] Komga asked for metadata of series '"
                + series.getName() + "'");
        return new SeriesMetadataPatch(
                null, null, null, SUMMARY, null, null, null, null, Set.of(), null, Set.of());
    }
}
