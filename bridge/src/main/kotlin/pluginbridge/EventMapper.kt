package pluginbridge

import org.gotson.komga.domain.model.DomainEvent

/** An event as the Plugin Host receives it: Komga's event name plus a small, safe payload. */
data class ForwardedEvent(
  val type: String,
  val data: Map<String, Any?>,
)

/**
 * Turns Komga's domain events into plain payloads (ids and names only). Komga's domain objects
 * carry internals (a [org.gotson.komga.domain.model.KomgaUser] holds a password hash), so they
 * are never serialised whole. An event this mapper does not know is forwarded with no payload.
 */
object EventMapper {
  fun map(event: DomainEvent): ForwardedEvent = ForwardedEvent(event.javaClass.simpleName, data(event))

  private fun data(event: DomainEvent): Map<String, Any?> =
    when (event) {
      is DomainEvent.LibraryAdded -> mapOf("library" to named(event.library.id, event.library.name))
      is DomainEvent.LibraryUpdated -> mapOf("library" to named(event.library.id, event.library.name))
      is DomainEvent.LibraryDeleted -> mapOf("library" to named(event.library.id, event.library.name))
      is DomainEvent.LibraryScanned -> mapOf("library" to named(event.library.id, event.library.name))
      is DomainEvent.SeriesAdded -> mapOf("series" to series(event.series.id, event.series.name, event.series.libraryId))
      is DomainEvent.SeriesUpdated -> mapOf("series" to series(event.series.id, event.series.name, event.series.libraryId))
      is DomainEvent.SeriesDeleted -> mapOf("series" to series(event.series.id, event.series.name, event.series.libraryId))
      is DomainEvent.BookAdded -> mapOf("book" to book(event.book.id, event.book.name, event.book.seriesId, event.book.libraryId))
      is DomainEvent.BookUpdated -> mapOf("book" to book(event.book.id, event.book.name, event.book.seriesId, event.book.libraryId))
      is DomainEvent.BookDeleted -> mapOf("book" to book(event.book.id, event.book.name, event.book.seriesId, event.book.libraryId))
      is DomainEvent.BookImported ->
        mapOf(
          "book" to event.book?.let { book(it.id, it.name, it.seriesId, it.libraryId) },
          "sourceFile" to event.sourceFile.toString(),
          "success" to event.success,
          "message" to event.message,
        )
      is DomainEvent.CollectionAdded -> mapOf("collection" to named(event.collection.id, event.collection.name))
      is DomainEvent.CollectionUpdated -> mapOf("collection" to named(event.collection.id, event.collection.name))
      is DomainEvent.CollectionDeleted -> mapOf("collection" to named(event.collection.id, event.collection.name))
      is DomainEvent.ReadListAdded -> mapOf("readList" to named(event.readList.id, event.readList.name))
      is DomainEvent.ReadListUpdated -> mapOf("readList" to named(event.readList.id, event.readList.name))
      is DomainEvent.ReadListDeleted -> mapOf("readList" to named(event.readList.id, event.readList.name))
      is DomainEvent.ReadProgressChanged -> mapOf("bookId" to event.progress.bookId, "userId" to event.progress.userId)
      is DomainEvent.ReadProgressDeleted -> mapOf("bookId" to event.progress.bookId, "userId" to event.progress.userId)
      is DomainEvent.ReadProgressSeriesChanged -> mapOf("seriesId" to event.seriesId, "userId" to event.userId)
      is DomainEvent.ReadProgressSeriesDeleted -> mapOf("seriesId" to event.seriesId, "userId" to event.userId)
      is DomainEvent.ThumbnailBookAdded -> mapOf("thumbnailId" to event.thumbnail.id, "bookId" to event.thumbnail.bookId)
      is DomainEvent.ThumbnailBookDeleted -> mapOf("thumbnailId" to event.thumbnail.id, "bookId" to event.thumbnail.bookId)
      is DomainEvent.ThumbnailSeriesAdded -> mapOf("thumbnailId" to event.thumbnail.id, "seriesId" to event.thumbnail.seriesId)
      is DomainEvent.ThumbnailSeriesDeleted -> mapOf("thumbnailId" to event.thumbnail.id, "seriesId" to event.thumbnail.seriesId)
      is DomainEvent.ThumbnailSeriesCollectionAdded ->
        mapOf("thumbnailId" to event.thumbnail.id, "collectionId" to event.thumbnail.collectionId)
      is DomainEvent.ThumbnailSeriesCollectionDeleted ->
        mapOf("thumbnailId" to event.thumbnail.id, "collectionId" to event.thumbnail.collectionId)
      is DomainEvent.ThumbnailReadListAdded -> mapOf("thumbnailId" to event.thumbnail.id, "readListId" to event.thumbnail.readListId)
      is DomainEvent.ThumbnailReadListDeleted -> mapOf("thumbnailId" to event.thumbnail.id, "readListId" to event.thumbnail.readListId)
      is DomainEvent.UserUpdated -> mapOf("user" to mapOf("id" to event.user.id, "email" to event.user.email))
      is DomainEvent.UserDeleted -> mapOf("user" to mapOf("id" to event.user.id, "email" to event.user.email))
      else -> emptyMap()
    }

  private fun named(
    id: String,
    name: String,
  ) = mapOf("id" to id, "name" to name)

  private fun series(
    id: String,
    name: String,
    libraryId: String,
  ) = mapOf("id" to id, "name" to name, "libraryId" to libraryId)

  private fun book(
    id: String,
    name: String,
    seriesId: String,
    libraryId: String,
  ) = mapOf("id" to id, "name" to name, "seriesId" to seriesId, "libraryId" to libraryId)
}
