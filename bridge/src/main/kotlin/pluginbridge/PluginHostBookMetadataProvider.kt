package pluginbridge

import com.fasterxml.jackson.databind.JsonNode
import org.gotson.komga.domain.model.Author
import org.gotson.komga.domain.model.BookMetadataPatch
import org.gotson.komga.domain.model.BookMetadataPatchCapability
import org.gotson.komga.domain.model.BookWithMedia
import org.gotson.komga.domain.model.Library
import org.gotson.komga.domain.model.MetadataPatchTarget
import org.gotson.komga.infrastructure.metadata.BookMetadataProvider
import java.time.LocalDate

/**
 * Asks the Plugin Host for book metadata during Komga's scan and metadata refresh. Never throws
 * (Komga's book-import preview calls providers without a try/catch): any failure yields null.
 * Absent fields stay null so they leave other providers' values alone.
 */
class PluginHostBookMetadataProvider(
  private val client: PluginHostClient,
) : BookMetadataProvider {
  override val capabilities: Set<BookMetadataPatchCapability> =
    setOf(
      BookMetadataPatchCapability.TITLE,
      BookMetadataPatchCapability.SUMMARY,
      BookMetadataPatchCapability.NUMBER,
      BookMetadataPatchCapability.RELEASE_DATE,
      BookMetadataPatchCapability.AUTHORS,
      BookMetadataPatchCapability.TAGS,
      BookMetadataPatchCapability.ISBN,
    )

  override fun shouldLibraryHandlePatch(
    library: Library,
    target: MetadataPatchTarget,
  ): Boolean = target == MetadataPatchTarget.BOOK

  override fun getBookMetadataFromBook(book: BookWithMedia): BookMetadataPatch? =
    try {
      val request =
        mapOf(
          "book" to
            mapOf(
              "id" to book.book.id,
              "name" to book.book.name,
              "path" to book.book.path.toString(),
              "seriesId" to book.book.seriesId,
              "libraryId" to book.book.libraryId,
            ),
        )
      val metadata = client.post("/bridge/book-metadata", request)?.path("metadata")
      if (metadata == null || !metadata.isObject) {
        null
      } else {
        val authors =
          metadata
            .path("authors")
            .filter { it.path("name").isTextual && it.path("role").isTextual }
            .map { Author(it.path("name").asText(), it.path("role").asText()) }
        val tags = metadata.path("tags").filter { it.isTextual }.map { it.asText() }.toSet()
        BookMetadataPatch(
          title = text(metadata, "title"),
          summary = text(metadata, "summary"),
          number = text(metadata, "number"),
          releaseDate = text(metadata, "releaseDate")?.let { LocalDate.parse(it) },
          authors = authors.ifEmpty { null },
          isbn = text(metadata, "isbn"),
          tags = tags.ifEmpty { null },
        )
      }
    } catch (e: Exception) {
      println("[plugin-bridge] book metadata skipped: $e")
      null
    }

  private fun text(
    node: JsonNode,
    field: String,
  ): String? = node.get(field)?.takeIf { it.isTextual }?.asText()
}
