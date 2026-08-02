// Generated from src/app/api/external route handlers. Keep this file in sync when external API routes change.
export const externalApiEndpointCatalog = [
  {
    "category": "Konto",
    "title": "Account Circle",
    "path": "/api/external/account/circle",
    "methods": [
      "GET",
      "DELETE"
    ],
    "description": "Konto: Account Circle. Methoden: GET, DELETE."
  },
  {
    "category": "Konto",
    "title": "Account Deletion Status",
    "path": "/api/external/account/deletion-status",
    "methods": [
      "GET"
    ],
    "description": "Konto: Account Deletion Status. Methoden: GET."
  },
  {
    "category": "Konto",
    "title": "Account Export",
    "path": "/api/external/account/export",
    "methods": [
      "GET"
    ],
    "description": "Konto: Account Export. Methoden: GET."
  },
  {
    "category": "Konto",
    "title": "Account Privacy Settings",
    "path": "/api/external/account/privacy-settings",
    "methods": [
      "GET",
      "PATCH"
    ],
    "description": "Konto: Account Privacy Settings. Methoden: GET, PATCH."
  },
  {
    "category": "Konto",
    "title": "Account",
    "path": "/api/external/account",
    "methods": [
      "DELETE"
    ],
    "description": "Konto: Account. Methoden: DELETE."
  },
  {
    "category": "Konto",
    "title": "Account Sessions Id",
    "path": "/api/external/account/sessions/{id}",
    "methods": [
      "DELETE"
    ],
    "description": "Konto: Account Sessions Id. Methoden: DELETE."
  },
  {
    "category": "Konto",
    "title": "Account Sessions",
    "path": "/api/external/account/sessions",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Konto: Account Sessions. Methoden: GET, POST."
  },
  {
    "category": "Administration",
    "title": "Admin Legal Documents Publish",
    "path": "/api/external/admin/legal-documents/publish",
    "methods": [
      "POST"
    ],
    "description": "Administration: Admin Legal Documents Publish. Methoden: POST."
  },
  {
    "category": "Administration",
    "title": "Admin Legal Documents",
    "path": "/api/external/admin/legal-documents",
    "methods": [
      "GET",
      "POST",
      "PATCH"
    ],
    "description": "Administration: Admin Legal Documents. Methoden: GET, POST, PATCH."
  },
  {
    "category": "Administration",
    "title": "Admin View Context",
    "path": "/api/external/admin/view-context",
    "methods": [
      "POST"
    ],
    "description": "Administration: Admin View Context. Methoden: POST."
  },
  {
    "category": "Authentifizierung",
    "title": "Auth Login",
    "path": "/api/external/auth/login",
    "methods": [
      "POST"
    ],
    "description": "Authentifizierung: Auth Login. Methoden: POST."
  },
  {
    "category": "Authentifizierung",
    "title": "Auth Web Session",
    "path": "/api/external/auth/web-session",
    "methods": [
      "POST"
    ],
    "description": "Authentifizierung: Auth Web Session. Methoden: POST."
  },
  {
    "category": "Blockierungen",
    "title": "Blocks UserId",
    "path": "/api/external/blocks/{userId}",
    "methods": [
      "DELETE"
    ],
    "description": "Blockierungen: Blocks UserId. Methoden: DELETE."
  },
  {
    "category": "Blockierungen",
    "title": "Blocks",
    "path": "/api/external/blocks",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Blockierungen: Blocks. Methoden: GET, POST."
  },
  {
    "category": "Bondage-System",
    "title": "Bondage System Id",
    "path": "/api/external/bondage-system/{id}",
    "methods": [
      "GET",
      "PATCH"
    ],
    "description": "Bondage-System: Bondage System Id. Methoden: GET, PATCH."
  },
  {
    "category": "Bondage-System",
    "title": "Bondage System",
    "path": "/api/external/bondage-system",
    "methods": [
      "GET"
    ],
    "description": "Bondage-System: Bondage System. Methoden: GET."
  },
  {
    "category": "Bondage-System",
    "title": "Bondage System Sync",
    "path": "/api/external/bondage-system/sync",
    "methods": [
      "POST"
    ],
    "description": "Bondage-System: Bondage System Sync. Methoden: POST."
  },
  {
    "category": "Kalender",
    "title": "Calendar Events Id Check In",
    "path": "/api/external/calendar-events/{id}/check-in",
    "methods": [
      "POST",
      "DELETE"
    ],
    "description": "Kalender: Calendar Events Id Check In. Methoden: POST, DELETE."
  },
  {
    "category": "Kalender",
    "title": "Calendar Events Id",
    "path": "/api/external/calendar-events/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Kalender: Calendar Events Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Kalender",
    "title": "Calendar Events",
    "path": "/api/external/calendar-events",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Kalender: Calendar Events. Methoden: GET, POST."
  },
  {
    "category": "Fähigkeiten",
    "title": "Capabilities",
    "path": "/api/external/capabilities",
    "methods": [
      "GET"
    ],
    "description": "Fähigkeiten: Capabilities. Methoden: GET."
  },
  {
    "category": "Katalog",
    "title": "Catalog Categories",
    "path": "/api/external/catalog/categories",
    "methods": [
      "GET"
    ],
    "description": "Katalog: Catalog Categories. Methoden: GET."
  },
  {
    "category": "Katalog",
    "title": "Catalog Position Categories Id",
    "path": "/api/external/catalog/position-categories/{id}",
    "methods": [
      "PATCH"
    ],
    "description": "Katalog: Catalog Position Categories Id. Methoden: PATCH."
  },
  {
    "category": "Katalog",
    "title": "Catalog Position Categories",
    "path": "/api/external/catalog/position-categories",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Katalog: Catalog Position Categories. Methoden: GET, POST."
  },
  {
    "category": "Katalog",
    "title": "Catalog Positions Id Favorite",
    "path": "/api/external/catalog/positions/{id}/favorite",
    "methods": [
      "POST",
      "DELETE"
    ],
    "description": "Katalog: Catalog Positions Id Favorite. Methoden: POST, DELETE."
  },
  {
    "category": "Katalog",
    "title": "Catalog Positions Id",
    "path": "/api/external/catalog/positions/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Katalog: Catalog Positions Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Katalog",
    "title": "Catalog Positions",
    "path": "/api/external/catalog/positions",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Katalog: Catalog Positions. Methoden: GET, POST."
  },
  {
    "category": "Katalog",
    "title": "Catalog Reorder",
    "path": "/api/external/catalog/reorder",
    "methods": [
      "POST"
    ],
    "description": "Katalog: Catalog Reorder. Methoden: POST."
  },
  {
    "category": "Katalog",
    "title": "Catalog Toy Categories Id",
    "path": "/api/external/catalog/toy-categories/{id}",
    "methods": [
      "PATCH"
    ],
    "description": "Katalog: Catalog Toy Categories Id. Methoden: PATCH."
  },
  {
    "category": "Katalog",
    "title": "Catalog Toy Categories",
    "path": "/api/external/catalog/toy-categories",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Katalog: Catalog Toy Categories. Methoden: GET, POST."
  },
  {
    "category": "Katalog",
    "title": "Catalog Toys Id Favorite",
    "path": "/api/external/catalog/toys/{id}/favorite",
    "methods": [
      "POST",
      "DELETE"
    ],
    "description": "Katalog: Catalog Toys Id Favorite. Methoden: POST, DELETE."
  },
  {
    "category": "Katalog",
    "title": "Catalog Toys Id",
    "path": "/api/external/catalog/toys/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Katalog: Catalog Toys Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Katalog",
    "title": "Catalog Toys",
    "path": "/api/external/catalog/toys",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Katalog: Catalog Toys. Methoden: GET, POST."
  },
  {
    "category": "Chat",
    "title": "Chat Circle MessageId",
    "path": "/api/external/chat/circle/{messageId}",
    "methods": [
      "DELETE"
    ],
    "description": "Chat: Chat Circle MessageId. Methoden: DELETE."
  },
  {
    "category": "Chat",
    "title": "Chat Circle Read",
    "path": "/api/external/chat/circle/read",
    "methods": [
      "POST"
    ],
    "description": "Chat: Chat Circle Read. Methoden: POST."
  },
  {
    "category": "Chat",
    "title": "Chat Circle",
    "path": "/api/external/chat/circle",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Chat: Chat Circle. Methoden: GET, POST."
  },
  {
    "category": "Chat",
    "title": "Chat Circle Stream",
    "path": "/api/external/chat/circle/stream",
    "methods": [
      "GET"
    ],
    "description": "Chat: Chat Circle Stream. Methoden: GET."
  },
  {
    "category": "Chat",
    "title": "Chat Circles Id",
    "path": "/api/external/chat/circles/{id}",
    "methods": [
      "PATCH",
      "DELETE"
    ],
    "description": "Chat: Chat Circles Id. Methoden: PATCH, DELETE."
  },
  {
    "category": "Chat",
    "title": "Chat Circles",
    "path": "/api/external/chat/circles",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Chat: Chat Circles. Methoden: GET, POST."
  },
  {
    "category": "Chat",
    "title": "Chat Transcribe",
    "path": "/api/external/chat/transcribe",
    "methods": [
      "POST"
    ],
    "description": "Chat: Chat Transcribe. Methoden: POST."
  },
  {
    "category": "Zustimmungen",
    "title": "Compliance Accept",
    "path": "/api/external/compliance/accept",
    "methods": [
      "POST"
    ],
    "description": "Zustimmungen: Compliance Accept. Methoden: POST."
  },
  {
    "category": "Zustimmungen",
    "title": "Compliance Consents",
    "path": "/api/external/compliance/consents",
    "methods": [
      "PATCH"
    ],
    "description": "Zustimmungen: Compliance Consents. Methoden: PATCH."
  },
  {
    "category": "Zustimmungen",
    "title": "Compliance Status",
    "path": "/api/external/compliance/status",
    "methods": [
      "GET"
    ],
    "description": "Zustimmungen: Compliance Status. Methoden: GET."
  },
  {
    "category": "Inhaltsbereiche",
    "title": "Content Spaces SpaceId Entries EntryId Attachments AttachmentId",
    "path": "/api/external/content-spaces/{spaceId}/entries/{entryId}/attachments/{attachmentId}",
    "methods": [
      "DELETE"
    ],
    "description": "Inhaltsbereiche: Content Spaces SpaceId Entries EntryId Attachments AttachmentId. Methoden: DELETE."
  },
  {
    "category": "Inhaltsbereiche",
    "title": "Content Spaces SpaceId Entries EntryId Attachments",
    "path": "/api/external/content-spaces/{spaceId}/entries/{entryId}/attachments",
    "methods": [
      "POST"
    ],
    "description": "Inhaltsbereiche: Content Spaces SpaceId Entries EntryId Attachments. Methoden: POST."
  },
  {
    "category": "Inhaltsbereiche",
    "title": "Content Spaces SpaceId Entries EntryId",
    "path": "/api/external/content-spaces/{spaceId}/entries/{entryId}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Inhaltsbereiche: Content Spaces SpaceId Entries EntryId. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Inhaltsbereiche",
    "title": "Content Spaces SpaceId Entries EntryId Transcribe",
    "path": "/api/external/content-spaces/{spaceId}/entries/{entryId}/transcribe",
    "methods": [
      "POST"
    ],
    "description": "Inhaltsbereiche: Content Spaces SpaceId Entries EntryId Transcribe. Methoden: POST."
  },
  {
    "category": "Inhaltsbereiche",
    "title": "Content Spaces SpaceId Entries",
    "path": "/api/external/content-spaces/{spaceId}/entries",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Inhaltsbereiche: Content Spaces SpaceId Entries. Methoden: GET, POST."
  },
  {
    "category": "Inhaltsbereiche",
    "title": "Content Spaces SpaceId",
    "path": "/api/external/content-spaces/{spaceId}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Inhaltsbereiche: Content Spaces SpaceId. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Inhaltsbereiche",
    "title": "Content Spaces SpaceId Transcribe",
    "path": "/api/external/content-spaces/{spaceId}/transcribe",
    "methods": [
      "POST"
    ],
    "description": "Inhaltsbereiche: Content Spaces SpaceId Transcribe. Methoden: POST."
  },
  {
    "category": "Inhaltsbereiche",
    "title": "Content Spaces",
    "path": "/api/external/content-spaces",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Inhaltsbereiche: Content Spaces. Methoden: GET, POST."
  },
  {
    "category": "Inhaltsbereiche",
    "title": "Content Spaces Share Targets",
    "path": "/api/external/content-spaces/share-targets",
    "methods": [
      "GET"
    ],
    "description": "Inhaltsbereiche: Content Spaces Share Targets. Methoden: GET."
  },
  {
    "category": "Ereignisse",
    "title": "Events EventId Comments CommentId",
    "path": "/api/external/events/{eventId}/comments/{commentId}",
    "methods": [
      "DELETE"
    ],
    "description": "Ereignisse: Events EventId Comments CommentId. Methoden: DELETE."
  },
  {
    "category": "Ereignisse",
    "title": "Events EventId Comments",
    "path": "/api/external/events/{eventId}/comments",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Ereignisse: Events EventId Comments. Methoden: GET, POST."
  },
  {
    "category": "Ereignisse",
    "title": "Events EventId Dismiss",
    "path": "/api/external/events/{eventId}/dismiss",
    "methods": [
      "POST",
      "DELETE"
    ],
    "description": "Ereignisse: Events EventId Dismiss. Methoden: POST, DELETE."
  },
  {
    "category": "Ereignisse",
    "title": "Events EventId Like",
    "path": "/api/external/events/{eventId}/like",
    "methods": [
      "POST",
      "DELETE"
    ],
    "description": "Ereignisse: Events EventId Like. Methoden: POST, DELETE."
  },
  {
    "category": "Ereignisse",
    "title": "Events Actions",
    "path": "/api/external/events/actions",
    "methods": [
      "GET"
    ],
    "description": "Ereignisse: Events Actions. Methoden: GET."
  },
  {
    "category": "Ereignisse",
    "title": "Events By Entity EntityType EntityId Like",
    "path": "/api/external/events/by-entity/{entityType}/{entityId}/like",
    "methods": [
      "POST",
      "DELETE"
    ],
    "description": "Ereignisse: Events By Entity EntityType EntityId Like. Methoden: POST, DELETE."
  },
  {
    "category": "Ereignisse",
    "title": "Events",
    "path": "/api/external/events",
    "methods": [
      "GET"
    ],
    "description": "Ereignisse: Events. Methoden: GET."
  },
  {
    "category": "Dateien",
    "title": "Files Id",
    "path": "/api/external/files/{id}",
    "methods": [
      "GET"
    ],
    "description": "Dateien: Files Id. Methoden: GET."
  },
  {
    "category": "Ideen",
    "title": "Ideas Id Images ImageId",
    "path": "/api/external/ideas/{id}/images/{imageId}",
    "methods": [
      "DELETE"
    ],
    "description": "Ideen: Ideas Id Images ImageId. Methoden: DELETE."
  },
  {
    "category": "Ideen",
    "title": "Ideas Id Images",
    "path": "/api/external/ideas/{id}/images",
    "methods": [
      "POST"
    ],
    "description": "Ideen: Ideas Id Images. Methoden: POST."
  },
  {
    "category": "Ideen",
    "title": "Ideas Id Like",
    "path": "/api/external/ideas/{id}/like",
    "methods": [
      "POST"
    ],
    "description": "Ideen: Ideas Id Like. Methoden: POST."
  },
  {
    "category": "Ideen",
    "title": "Ideas Id",
    "path": "/api/external/ideas/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Ideen: Ideas Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Ideen",
    "title": "Ideas",
    "path": "/api/external/ideas",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Ideen: Ideas. Methoden: GET, POST."
  },
  {
    "category": "Bilder",
    "title": "Images",
    "path": "/api/external/images",
    "methods": [
      "GET"
    ],
    "description": "Bilder: Images. Methoden: GET."
  },
  {
    "category": "Einladungen",
    "title": "Invites",
    "path": "/api/external/invites",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Einladungen: Invites. Methoden: GET, POST."
  },
  {
    "category": "Bilder",
    "title": "Media Id Comments",
    "path": "/api/external/media/{id}/comments",
    "methods": [
      "POST"
    ],
    "description": "Bilder: Media Id Comments. Methoden: POST."
  },
  {
    "category": "Bilder",
    "title": "Media Id",
    "path": "/api/external/media/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Bilder: Media Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Bilder",
    "title": "Media Albums Id",
    "path": "/api/external/media/albums/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Bilder: Media Albums Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Bilder",
    "title": "Media Albums",
    "path": "/api/external/media/albums",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Bilder: Media Albums. Methoden: GET, POST."
  },
  {
    "category": "Bilder",
    "title": "Media",
    "path": "/api/external/media",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Bilder: Media. Methoden: GET, POST."
  },
  {
    "category": "Moderation",
    "title": "Moderation Reports Id",
    "path": "/api/external/moderation/reports/{id}",
    "methods": [
      "PATCH"
    ],
    "description": "Moderation: Moderation Reports Id. Methoden: PATCH."
  },
  {
    "category": "Moderation",
    "title": "Moderation Reports",
    "path": "/api/external/moderation/reports",
    "methods": [
      "GET"
    ],
    "description": "Moderation: Moderation Reports. Methoden: GET."
  },
  {
    "category": "Aufträge",
    "title": "Orders Id",
    "path": "/api/external/orders/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Aufträge: Orders Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Aufträge",
    "title": "Orders Id Status",
    "path": "/api/external/orders/{id}/status",
    "methods": [
      "POST"
    ],
    "description": "Aufträge: Orders Id Status. Methoden: POST."
  },
  {
    "category": "Aufträge",
    "title": "Orders",
    "path": "/api/external/orders",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Aufträge: Orders. Methoden: GET, POST."
  },
  {
    "category": "Packlisten",
    "title": "Packing Events Id",
    "path": "/api/external/packing/events/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Packlisten: Packing Events Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Packlisten",
    "title": "Packing Events",
    "path": "/api/external/packing/events",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Packlisten: Packing Events. Methoden: GET, POST."
  },
  {
    "category": "Packlisten",
    "title": "Packing Lists Id Items ItemId",
    "path": "/api/external/packing/lists/{id}/items/{itemId}",
    "methods": [
      "PATCH"
    ],
    "description": "Packlisten: Packing Lists Id Items ItemId. Methoden: PATCH."
  },
  {
    "category": "Packlisten",
    "title": "Packing Lists Id Items",
    "path": "/api/external/packing/lists/{id}/items",
    "methods": [
      "POST"
    ],
    "description": "Packlisten: Packing Lists Id Items. Methoden: POST."
  },
  {
    "category": "Packlisten",
    "title": "Packing Lists Id",
    "path": "/api/external/packing/lists/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Packlisten: Packing Lists Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Packlisten",
    "title": "Packing Lists",
    "path": "/api/external/packing/lists",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Packlisten: Packing Lists. Methoden: GET, POST."
  },
  {
    "category": "Spielampel",
    "title": "Play Ready",
    "path": "/api/external/play-ready",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Spielampel: Play Ready. Methoden: GET, POST."
  },
  {
    "category": "Punkte",
    "title": "Points",
    "path": "/api/external/points",
    "methods": [
      "GET"
    ],
    "description": "Punkte: Points. Methoden: GET."
  },
  {
    "category": "Punkte",
    "title": "Points Rules",
    "path": "/api/external/points/rules",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Punkte: Points Rules. Methoden: GET, POST."
  },
  {
    "category": "Profil",
    "title": "Profile",
    "path": "/api/external/profile",
    "methods": [
      "GET",
      "PATCH"
    ],
    "description": "Profil: Profile. Methoden: GET, PATCH."
  },
  {
    "category": "Push",
    "title": "Push Devices Id",
    "path": "/api/external/push/devices/{id}",
    "methods": [
      "DELETE"
    ],
    "description": "Push: Push Devices Id. Methoden: DELETE."
  },
  {
    "category": "Push",
    "title": "Push Devices",
    "path": "/api/external/push/devices",
    "methods": [
      "GET",
      "POST",
      "DELETE"
    ],
    "description": "Push: Push Devices. Methoden: GET, POST, DELETE."
  },
  {
    "category": "Push",
    "title": "Push Logs",
    "path": "/api/external/push/logs",
    "methods": [
      "GET"
    ],
    "description": "Push: Push Logs. Methoden: GET."
  },
  {
    "category": "Push",
    "title": "Push Test",
    "path": "/api/external/push/test",
    "methods": [
      "POST"
    ],
    "description": "Push: Push Test. Methoden: POST."
  },
  {
    "category": "Meldungen",
    "title": "Reports",
    "path": "/api/external/reports",
    "methods": [
      "POST"
    ],
    "description": "Meldungen: Reports. Methoden: POST."
  },
  {
    "category": "Spielplanung",
    "title": "Sessions Id Comments CommentId",
    "path": "/api/external/sessions/{id}/comments/{commentId}",
    "methods": [
      "DELETE"
    ],
    "description": "Spielplanung: Sessions Id Comments CommentId. Methoden: DELETE."
  },
  {
    "category": "Spielplanung",
    "title": "Sessions Id Comments",
    "path": "/api/external/sessions/{id}/comments",
    "methods": [
      "POST"
    ],
    "description": "Spielplanung: Sessions Id Comments. Methoden: POST."
  },
  {
    "category": "Spielplanung",
    "title": "Sessions Id Images ImageId",
    "path": "/api/external/sessions/{id}/images/{imageId}",
    "methods": [
      "DELETE"
    ],
    "description": "Spielplanung: Sessions Id Images ImageId. Methoden: DELETE."
  },
  {
    "category": "Spielplanung",
    "title": "Sessions Id Images",
    "path": "/api/external/sessions/{id}/images",
    "methods": [
      "POST"
    ],
    "description": "Spielplanung: Sessions Id Images. Methoden: POST."
  },
  {
    "category": "Spielplanung",
    "title": "Sessions Id",
    "path": "/api/external/sessions/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Spielplanung: Sessions Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Spielplanung",
    "title": "Sessions",
    "path": "/api/external/sessions",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Spielplanung: Sessions. Methoden: GET, POST."
  },
  {
    "category": "Teilen",
    "title": "Share",
    "path": "/api/external/share",
    "methods": [
      "POST"
    ],
    "description": "Teilen: Share. Methoden: POST."
  },
  {
    "category": "Portal",
    "title": "Status",
    "path": "/api/external/status",
    "methods": [
      "GET"
    ],
    "description": "Portal: Status. Methoden: GET."
  },
  {
    "category": "Seiten",
    "title": "Tenants Id",
    "path": "/api/external/tenants/{id}",
    "methods": [
      "GET",
      "PATCH"
    ],
    "description": "Seiten: Tenants Id. Methoden: GET, PATCH."
  },
  {
    "category": "Seiten",
    "title": "Tenants",
    "path": "/api/external/tenants",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Seiten: Tenants. Methoden: GET, POST."
  },
  {
    "category": "Tracker",
    "title": "Trackers TrackerKey Start",
    "path": "/api/external/trackers/{trackerKey}/start",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Tracker: Trackers TrackerKey Start. Methoden: GET, POST."
  },
  {
    "category": "Tracker",
    "title": "Trackers TrackerKey Stop",
    "path": "/api/external/trackers/{trackerKey}/stop",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Tracker: Trackers TrackerKey Stop. Methoden: GET, POST."
  },
  {
    "category": "Tracker",
    "title": "Trackers History Id Images ImageId",
    "path": "/api/external/trackers/history/{id}/images/{imageId}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Tracker: Trackers History Id Images ImageId. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Tracker",
    "title": "Trackers History Id Images",
    "path": "/api/external/trackers/history/{id}/images",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Tracker: Trackers History Id Images. Methoden: GET, POST."
  },
  {
    "category": "Tracker",
    "title": "Trackers History Id",
    "path": "/api/external/trackers/history/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Tracker: Trackers History Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Tracker",
    "title": "Trackers History",
    "path": "/api/external/trackers/history",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Tracker: Trackers History. Methoden: GET, POST."
  },
  {
    "category": "Tracker",
    "title": "Trackers Quotas",
    "path": "/api/external/trackers/quotas",
    "methods": [
      "GET"
    ],
    "description": "Tracker: Trackers Quotas. Methoden: GET."
  },
  {
    "category": "Tracker",
    "title": "Trackers Stream",
    "path": "/api/external/trackers/stream",
    "methods": [
      "GET"
    ],
    "description": "Tracker: Trackers Stream. Methoden: GET."
  },
  {
    "category": "Benutzer",
    "title": "Users Id",
    "path": "/api/external/users/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Benutzer: Users Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Benutzer",
    "title": "Users",
    "path": "/api/external/users",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Benutzer: Users. Methoden: GET, POST."
  },
  {
    "category": "Wiki",
    "title": "Wiki Id Attachments AttachmentId",
    "path": "/api/external/wiki/{id}/attachments/{attachmentId}",
    "methods": [
      "DELETE"
    ],
    "description": "Wiki: Wiki Id Attachments AttachmentId. Methoden: DELETE."
  },
  {
    "category": "Wiki",
    "title": "Wiki Id Attachments",
    "path": "/api/external/wiki/{id}/attachments",
    "methods": [
      "POST"
    ],
    "description": "Wiki: Wiki Id Attachments. Methoden: POST."
  },
  {
    "category": "Wiki",
    "title": "Wiki Id",
    "path": "/api/external/wiki/{id}",
    "methods": [
      "GET",
      "PATCH",
      "DELETE"
    ],
    "description": "Wiki: Wiki Id. Methoden: GET, PATCH, DELETE."
  },
  {
    "category": "Wiki",
    "title": "Wiki",
    "path": "/api/external/wiki",
    "methods": [
      "GET",
      "POST"
    ],
    "description": "Wiki: Wiki. Methoden: GET, POST."
  },
  {
    "category": "Wiki",
    "title": "Wiki Transcribe",
    "path": "/api/external/wiki/transcribe",
    "methods": [
      "POST"
    ],
    "description": "Wiki: Wiki Transcribe. Methoden: POST."
  }
];
