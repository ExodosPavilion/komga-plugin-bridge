package pluginbridge

import com.fasterxml.jackson.databind.JsonNode
import org.gotson.komga.domain.model.Library
import org.gotson.komga.domain.model.MetadataPatchTarget
import org.gotson.komga.domain.model.Series
import org.gotson.komga.domain.model.SeriesMetadataPatch
import org.gotson.komga.infrastructure.metadata.SeriesMetadataProvider

/** Asks the Plugin Host for series metadata during Komga's scan and metadata refresh. */
class PluginHostSeriesMetadataProvider(
  private val client: PluginHostClient,
) : SeriesMetadataProvider {
  override fun shouldLibraryHandlePatch(
    library: Library,
    target: MetadataPatchTarget,
  ): Boolean = target == MetadataPatchTarget.SERIES

  override fun getSeriesMetadata(series: Series): SeriesMetadataPatch? =
    try {
      val request =
        mapOf(
          "series" to
            mapOf(
              "id" to series.id,
              "name" to series.name,
              "path" to series.path.toString(),
              "libraryId" to series.libraryId,
            ),
        )
      val metadata = client.post("/bridge/series-metadata", request)?.path("metadata")
      if (metadata == null || !metadata.isObject) {
        null
      } else {
        val genres = LinkedHashSet<String>()
        metadata.path("genres").forEach { genres.add(it.asText()) }
        SeriesMetadataPatch(
          text(metadata, "title"), null, null, text(metadata, "summary"), null,
          text(metadata, "publisher"), null, text(metadata, "language"),
          // Komga applies any non-null set, so an empty one would wipe genres other providers set.
          genres.ifEmpty { null }, null, emptySet(),
        )
      }
    } catch (e: Exception) {
      println("[plugin-bridge] series metadata skipped: $e")
      null
    }

  private fun text(
    node: JsonNode,
    field: String,
  ): String? = node.get(field)?.takeIf { it.isTextual }?.asText()
}
