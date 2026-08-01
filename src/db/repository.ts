import Database from "better-sqlite3";

export interface DailySnapshot {
  date: string;
  total_followers: number;
  active_subscribers: number;
  gross_earnings: number;
  churned_subscribers: number;
  created_at?: string;
}

export interface PostMetrics {
  post_id: string;
  media_type: string;
  likes_count: number;
  tips_amount: number;
  unlocks_count: number;
  posted_at: string;
  fetched_at?: string;
}

export interface TrackingLink {
  link_id: string;
  label: string;
  clicks: number;
  conversions: number;
  revenue_generated: number;
  updated_at?: string;
}

type Db = InstanceType<typeof Database>;

export class AnalyticsRepository {
  private db: Db;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_snapshots (
        date TEXT PRIMARY KEY,
        total_followers INTEGER NOT NULL,
        active_subscribers INTEGER NOT NULL,
        gross_earnings REAL NOT NULL,
        churned_subscribers INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS post_metrics (
        post_id TEXT PRIMARY KEY,
        media_type TEXT NOT NULL,
        likes_count INTEGER DEFAULT 0,
        tips_amount REAL DEFAULT 0.0,
        unlocks_count INTEGER DEFAULT 0,
        posted_at TIMESTAMP NOT NULL,
        fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tracking_links (
        link_id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        clicks INTEGER DEFAULT 0,
        conversions INTEGER DEFAULT 0,
        revenue_generated REAL DEFAULT 0.0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  upsertDailySnapshot(snapshot: Omit<DailySnapshot, "created_at">): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO daily_snapshots
          (date, total_followers, active_subscribers, gross_earnings, churned_subscribers)
         VALUES (@date, @total_followers, @active_subscribers, @gross_earnings, @churned_subscribers)`
      )
      .run(snapshot);
  }

  getDailySnapshots(days: number): DailySnapshot[] {
    const rows = this.db
      .prepare(
        `SELECT date, total_followers, active_subscribers, gross_earnings, churned_subscribers, created_at
         FROM daily_snapshots ORDER BY date DESC LIMIT ?`
      )
      .all(days) as DailySnapshot[];
    return rows;
  }

  upsertPostMetrics(metrics: Omit<PostMetrics, "fetched_at">): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO post_metrics
          (post_id, media_type, likes_count, tips_amount, unlocks_count, posted_at)
         VALUES (@post_id, @media_type, @likes_count, @tips_amount, @unlocks_count, @posted_at)`
      )
      .run(metrics);
  }

  getPostMetrics(limit: number): PostMetrics[] {
    const rows = this.db
      .prepare(
        `SELECT post_id, media_type, likes_count, tips_amount, unlocks_count, posted_at, fetched_at
         FROM post_metrics ORDER BY posted_at DESC LIMIT ?`
      )
      .all(limit) as PostMetrics[];
    return rows;
  }

  upsertTrackingLink(link: Omit<TrackingLink, "updated_at">): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO tracking_links
          (link_id, label, clicks, conversions, revenue_generated)
         VALUES (@link_id, @label, @clicks, @conversions, @revenue_generated)`
      )
      .run(link);
  }

  getTrackingLinks(): TrackingLink[] {
    const rows = this.db
      .prepare(
        `SELECT link_id, label, clicks, conversions, revenue_generated, updated_at
         FROM tracking_links ORDER BY revenue_generated DESC`
      )
      .all() as TrackingLink[];
    return rows;
  }

  close(): void {
    this.db.close();
  }
}
