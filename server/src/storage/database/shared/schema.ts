import { pgTable, serial, varchar, text, timestamp, uuid, index } from "drizzle-orm/pg-core"

export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const translationHistory = pgTable(
  "translation_history",
  {
    id: serial().primaryKey(),
    user_id: uuid("user_id").notNull(),
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
    index("translation_history_user_id_idx").on(table.user_id),
  ]
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial().primaryKey(),
    user_id: uuid("user_id").notNull(),
    plan: varchar("plan", { length: 20 }).notNull().default("free"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    trial_start_at: timestamp("trial_start_at", { withTimezone: true }),
    trial_end_at: timestamp("trial_end_at", { withTimezone: true }),
    subscription_start_at: timestamp("subscription_start_at", { withTimezone: true }),
    subscription_end_at: timestamp("subscription_end_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);
