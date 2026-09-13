use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_sql::{Migration, MigrationKind};

mod ai;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_documents_table",
            sql: "CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL,
            title TEXT,
            content_hash TEXT NOT NULL,
            page_count INTEGER,
            created_at INTEGER NOT NULL,
            modified_at INTEGER NOT NULL
        );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_last_opened_at",
            sql: "ALTER TABLE documents ADD COLUMN last_opened_at INTEGER;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_last_page",
            sql: "ALTER TABLE documents ADD COLUMN last_page INTEGER NOT NULL DEFAULT 1;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add_zoom",
            sql: "ALTER TABLE documents ADD COLUMN zoom REAL;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_reading_mode",
            sql: "ALTER TABLE documents ADD COLUMN reading_mode TEXT NOT NULL DEFAULT 'continuous';",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_scroll_offset",
            sql: "ALTER TABLE documents ADD COLUMN scroll_offset REAL;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_annotations_table",
            sql: "CREATE TABLE IF NOT EXISTS annotations (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                type TEXT NOT NULL DEFAULT 'highlight',
                color TEXT NOT NULL DEFAULT '#ffd400',
                source_text TEXT NOT NULL DEFAULT '',
                title TEXT,
                note TEXT NOT NULL DEFAULT '',
                is_complete INTEGER NOT NULL DEFAULT 0 CHECK (is_complete IN (0, 1)),
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_annotations_document ON annotations(document_id);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_annotation_rects_table",
            sql: "CREATE TABLE IF NOT EXISTS annotation_rects (
                id TEXT PRIMARY KEY,
                annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
                page_number INTEGER NOT NULL CHECK (page_number >= 1),
                seq INTEGER NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                width REAL NOT NULL CHECK (width > 0),
                height REAL NOT NULL CHECK (height > 0),
                UNIQUE (annotation_id, seq)
            );
            CREATE INDEX IF NOT EXISTS idx_annotation_rects_annotation ON annotation_rects(annotation_id);
            CREATE INDEX IF NOT EXISTS idx_annotation_rects_page ON annotation_rects(page_number);",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "create_app_settings_table",
            sql: "CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "create_vocabulary_table",
            sql: "CREATE TABLE IF NOT EXISTS vocabulary (
                annotation_id TEXT PRIMARY KEY REFERENCES annotations(id) ON DELETE CASCADE,
                source_sentence TEXT NOT NULL DEFAULT '',
                context_before TEXT NOT NULL DEFAULT '',
                context_after TEXT NOT NULL DEFAULT '',
                section_heading TEXT,
                created_at INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "create_vocabulary_enrichment_table",
            sql: "CREATE TABLE IF NOT EXISTS vocabulary_enrichment (
                annotation_id TEXT PRIMARY KEY REFERENCES annotations(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
                lemma TEXT NOT NULL DEFAULT '',
                display_term TEXT NOT NULL DEFAULT '',
                part_of_speech TEXT NOT NULL DEFAULT '',
                ipa_uk TEXT NOT NULL DEFAULT '',
                meaning_zh TEXT NOT NULL DEFAULT '',
                definition_en TEXT NOT NULL DEFAULT '',
                contextual_explanation TEXT NOT NULL DEFAULT '',
                domain TEXT NOT NULL DEFAULT '',
                domain_specific INTEGER NOT NULL DEFAULT 0 CHECK (domain_specific IN (0, 1)),
                user_edited INTEGER NOT NULL DEFAULT 0 CHECK (user_edited IN (0, 1)),
                error_message TEXT,
                model TEXT,
                prompt_version TEXT,
                generated_at INTEGER,
                updated_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_vocabulary_enrichment_status ON vocabulary_enrichment(status);",
            kind: MigrationKind::Up,
        },
    ];

    let ai_state = ai::AiState::new().expect("failed to initialize AI transport");

    tauri::Builder::default()
        .manage(ai_state)
        .invoke_handler(tauri::generate_handler![
            ai::ai_credential_store_available,
            ai::ai_set_api_key,
            ai::ai_clear_api_key,
            ai::ai_has_api_key,
            ai::ai_chat,
            ai::ai_test_connection,
            ai::ai_cancel,
        ])
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Trace)
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:relax-note.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
