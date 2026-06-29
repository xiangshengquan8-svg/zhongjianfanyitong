import { pgTable, serial, varchar, text, timestamp, index } from "drizzle-orm/pg-core"

export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const translationHistory = pgTable(
  "translation_history",
  {
    id: serial().primaryKey(),
    source_lang: varchar("source_lang", { length: 10 }).notNull(),
    target_lang: varchar("target_lang", { length: 10 }).notNull(),
    source_text: text("source_text").notNull(),
    translated_text: text("translated_text").notNull(),
    audio_url: text("audio_url"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("translation_history_created_at_idx").on(table.created_at),
    index("translation_history_source_lang_idx").on(table.source_lang),
  ]
);
