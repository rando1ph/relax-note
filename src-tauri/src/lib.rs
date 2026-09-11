use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_sql::{Migration, MigrationKind};

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
    ];

    tauri::Builder::default()
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
