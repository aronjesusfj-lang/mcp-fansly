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
  media_likes_count: number;
  tips_amount: number;
  unlocks_count: number;
  posted_at: string;
  fetched_at?: string;
}

export interface PostMetricHistoryRow {
  post_id: string;
  date: string;
  likes_count: number;
  media_likes_count: number;
  tips_amount: number;
  unlocks_count: number;
  content_type: string;
}

export interface EarningsRow {
  date: string;
  tips_total: number;
  subs_income: number;
  ppv_income: number;
  wallet_balance: number;
}

export interface SubscribersRow {
  date: string;
  total_active: number;
  total_expired: number;
  total: number;
}

export interface HashtagMetricRow {
  hashtag: string;
  date: string;
  post_count: number;
  likes: number;
  media_likes: number;
  tips: number;
}

export interface VaultMediaRow {
  media_id: string;
  media_type: string;
  price: number;
  permission_flags: number;
  likes: number;
  unlocks: number;
  posted_at: string;
}

export interface PostHistoryRow {
  post_id: string;
  status: string;
  first_seen: string;
  last_seen: string;
}

export interface TrackingLink {
  link_id: string;
  label: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  post_id: string;
  clicks: number;
  conversions: number;
  revenue_generated: number;
  updated_at?: string;
}

export interface CompetitorRow {
  account_id: string;
  username: string;
  display_name: string;
  follow_count: number;
  subscriber_count: number;
  image_count: number;
  video_count: number;
  bundle_count: number;
  last_seen_at: number;
  niche: string;
  active: number;
}

export interface CompetitorSnapshotRow {
  account_id: string;
  date: string;
  follow_count: number;
  subscriber_count: number;
  image_count: number;
  video_count: number;
  bundle_count: number;
}

export interface FypTrackerRow {
  post_id: string;
  date: string;
  fyp_flags: number;
  likes: number;
  media_likes: number;
  tips: number;
}

type Db = InstanceType<typeof Database>;

const SCHEMA_VERSION = 3;

export class AnalyticsRepository {
  private db: Db;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    const version = (this.db.pragma("user_version", { simple: true }) as number) ?? 0;

    if (version < 1) {
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

    if (version < 2) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS post_metric_history (
          post_id TEXT NOT NULL,
          date TEXT NOT NULL,
          likes_count INTEGER DEFAULT 0,
          media_likes_count INTEGER DEFAULT 0,
          tips_amount REAL DEFAULT 0.0,
          unlocks_count INTEGER DEFAULT 0,
          content_type TEXT DEFAULT 'desconocido',
          PRIMARY KEY (post_id, date)
        );

        CREATE TABLE IF NOT EXISTS earnings_history (
          date TEXT PRIMARY KEY,
          tips_total REAL DEFAULT 0.0,
          subs_income REAL DEFAULT 0.0,
          ppv_income REAL DEFAULT 0.0,
          wallet_balance REAL DEFAULT 0.0
        );

        CREATE TABLE IF NOT EXISTS subscribers_history (
          date TEXT PRIMARY KEY,
          total_active INTEGER DEFAULT 0,
          total_expired INTEGER DEFAULT 0,
          total INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS hashtag_metrics (
          hashtag TEXT NOT NULL,
          date TEXT NOT NULL,
          post_count INTEGER DEFAULT 0,
          likes INTEGER DEFAULT 0,
          media_likes INTEGER DEFAULT 0,
          tips REAL DEFAULT 0.0,
          PRIMARY KEY (hashtag, date)
        );

        CREATE TABLE IF NOT EXISTS media_vault (
          media_id TEXT PRIMARY KEY,
          media_type TEXT DEFAULT 'desconocido',
          price REAL DEFAULT 0.0,
          permission_flags INTEGER DEFAULT 0,
          likes INTEGER DEFAULT 0,
          posted_at TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS post_history (
          post_id TEXT PRIMARY KEY,
          status TEXT DEFAULT 'activo',
          first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS competitors (
          account_id TEXT PRIMARY KEY,
          username TEXT DEFAULT '',
          display_name TEXT DEFAULT '',
          follow_count INTEGER DEFAULT 0,
          subscriber_count INTEGER DEFAULT 0,
          image_count INTEGER DEFAULT 0,
          video_count INTEGER DEFAULT 0,
          bundle_count INTEGER DEFAULT 0,
          last_seen_at INTEGER DEFAULT 0,
          niche TEXT DEFAULT 'desconocido',
          active INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS competitor_snapshots (
          account_id TEXT NOT NULL,
          date TEXT NOT NULL,
          follow_count INTEGER DEFAULT 0,
          subscriber_count INTEGER DEFAULT 0,
          image_count INTEGER DEFAULT 0,
          video_count INTEGER DEFAULT 0,
          bundle_count INTEGER DEFAULT 0,
          PRIMARY KEY (account_id, date)
        );

        CREATE TABLE IF NOT EXISTS competitor_hashtags (
          account_id TEXT NOT NULL,
          hashtag TEXT NOT NULL,
          date TEXT NOT NULL,
          frequency INTEGER DEFAULT 0,
          PRIMARY KEY (account_id, hashtag, date)
        );

        CREATE TABLE IF NOT EXISTS fyp_tracker (
          post_id TEXT NOT NULL,
          date TEXT NOT NULL,
          fyp_flags INTEGER DEFAULT 0,
          likes INTEGER DEFAULT 0,
          media_likes INTEGER DEFAULT 0,
          tips REAL DEFAULT 0.0,
          PRIMARY KEY (post_id, date)
        );

        CREATE INDEX IF NOT EXISTS idx_post_metric_history_date ON post_metric_history(date);
        CREATE INDEX IF NOT EXISTS idx_hashtag_metrics_tag ON hashtag_metrics(hashtag);
        CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_date ON competitor_snapshots(account_id, date);
      `);

      const trackingColumns = this.db.pragma("table_info(tracking_links)") as Array<{ name: string }>;
      const trackingColNames = new Set(trackingColumns.map((c) => c.name));
      if (!trackingColNames.has("utm_source")) {
        this.db.exec("ALTER TABLE tracking_links ADD COLUMN utm_source TEXT DEFAULT ''");
      }
      if (!trackingColNames.has("utm_medium")) {
        this.db.exec("ALTER TABLE tracking_links ADD COLUMN utm_medium TEXT DEFAULT ''");
      }
      if (!trackingColNames.has("utm_campaign")) {
        this.db.exec("ALTER TABLE tracking_links ADD COLUMN utm_campaign TEXT DEFAULT ''");
      }
      if (!trackingColNames.has("post_id")) {
        this.db.exec("ALTER TABLE tracking_links ADD COLUMN post_id TEXT DEFAULT ''");
      }
    }

    if (version < 3) {
      const vaultColumns = this.db.pragma("table_info(media_vault)") as Array<{ name: string }>;
      const vaultColNames = new Set(vaultColumns.map((c) => c.name));
      if (!vaultColNames.has("unlocks")) {
        this.db.exec("ALTER TABLE media_vault ADD COLUMN unlocks INTEGER DEFAULT 0");
      }
    }

    if (version < SCHEMA_VERSION) {
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    }
  }

  runInTransaction(work: () => void): void {
    this.db.transaction(work)();
  }

  upsertDailySnapshot(snapshot: Omit<DailySnapshot, "created_at">): void {
    this.db
      .prepare(
        `INSERT INTO daily_snapshots
          (date, total_followers, active_subscribers, gross_earnings, churned_subscribers)
         VALUES (@date, @total_followers, @active_subscribers, @gross_earnings, @churned_subscribers)
         ON CONFLICT(date) DO UPDATE SET
           total_followers = excluded.total_followers,
           active_subscribers = excluded.active_subscribers,
           gross_earnings = excluded.gross_earnings,
           churned_subscribers = excluded.churned_subscribers`
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
          (post_id, media_type, likes_count, media_likes_count, tips_amount, unlocks_count, posted_at)
         VALUES (@post_id, @media_type, @likes_count, @media_likes_count, @tips_amount, @unlocks_count, @posted_at)`
      )
      .run(metrics);
  }

  getPostMetrics(limit: number): PostMetrics[] {
    const rows = this.db
      .prepare(
        `SELECT post_id, media_type, likes_count, media_likes_count, tips_amount, unlocks_count, posted_at, fetched_at
         FROM post_metrics ORDER BY posted_at DESC LIMIT ?`
      )
      .all(limit) as PostMetrics[];
    return rows;
  }

  getPostMetricById(postId: string): PostMetrics | null {
    const row = this.db
      .prepare(
        `SELECT post_id, media_type, likes_count, media_likes_count, tips_amount, unlocks_count, posted_at, fetched_at
         FROM post_metrics WHERE post_id = ?`
      )
      .get(postId) as PostMetrics | undefined;
    return row ?? null;
  }

  upsertPostMetricHistory(row: Omit<PostMetricHistoryRow, never>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO post_metric_history
          (post_id, date, likes_count, media_likes_count, tips_amount, unlocks_count, content_type)
         VALUES (@post_id, @date, @likes_count, @media_likes_count, @tips_amount, @unlocks_count, @content_type)`
      )
      .run(row);
  }

  getPostMetricHistory(postId: string): PostMetricHistoryRow[] {
    const rows = this.db
      .prepare(
        `SELECT post_id, date, likes_count, media_likes_count, tips_amount, unlocks_count, content_type
         FROM post_metric_history WHERE post_id = ? ORDER BY date ASC`
      )
      .all(postId) as PostMetricHistoryRow[];
    return rows;
  }

  upsertEarnings(row: Omit<EarningsRow, never>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO earnings_history (date, tips_total, subs_income, ppv_income, wallet_balance)
         VALUES (@date, @tips_total, @subs_income, @ppv_income, @wallet_balance)`
      )
      .run(row);
  }

  getEarnings(days: number): EarningsRow[] {
    const rows = this.db
      .prepare(
        `SELECT date, tips_total, subs_income, ppv_income, wallet_balance
         FROM earnings_history ORDER BY date DESC LIMIT ?`
      )
      .all(days) as EarningsRow[];
    return rows;
  }

  upsertSubscribers(row: Omit<SubscribersRow, never>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO subscribers_history (date, total_active, total_expired, total)
         VALUES (@date, @total_active, @total_expired, @total)`
      )
      .run(row);
  }

  getSubscribersHistory(days: number): SubscribersRow[] {
    const rows = this.db
      .prepare(
        `SELECT date, total_active, total_expired, total
         FROM subscribers_history ORDER BY date DESC LIMIT ?`
      )
      .all(days) as SubscribersRow[];
    return rows;
  }

  upsertHashtagMetric(row: Omit<HashtagMetricRow, never>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO hashtag_metrics (hashtag, date, post_count, likes, media_likes, tips)
         VALUES (@hashtag, @date, @post_count, @likes, @media_likes, @tips)`
      )
      .run(row);
  }

  getHashtagMetrics(hashtag: string): HashtagMetricRow[] {
    const rows = this.db
      .prepare(
        `SELECT hashtag, date, post_count, likes, media_likes, tips
         FROM hashtag_metrics WHERE hashtag = ? ORDER BY date ASC`
      )
      .all(hashtag) as HashtagMetricRow[];
    return rows;
  }

  getAllHashtagMetrics(): HashtagMetricRow[] {
    const rows = this.db
      .prepare(
        `SELECT hashtag, date, post_count, likes, media_likes, tips
         FROM hashtag_metrics ORDER BY date DESC LIMIT 2000`
      )
      .all() as HashtagMetricRow[];
    return rows;
  }

  upsertVaultMedia(row: Omit<VaultMediaRow, never>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO media_vault (media_id, media_type, price, permission_flags, likes, unlocks, posted_at)
         VALUES (@media_id, @media_type, @price, @permission_flags, @likes, @unlocks, @posted_at)`
      )
      .run(row);
  }

  getVaultMedia(): VaultMediaRow[] {
    const rows = this.db
      .prepare(
        `SELECT media_id, media_type, price, permission_flags, likes, unlocks, posted_at
         FROM media_vault ORDER BY posted_at DESC`
      )
      .all() as VaultMediaRow[];
    return rows;
  }

  upsertPostHistory(row: Omit<PostHistoryRow, "last_seen"> & { last_seen?: string }): void {
    this.db
      .prepare(
        `INSERT INTO post_history (post_id, status, first_seen, last_seen)
         VALUES (@post_id, @status, @first_seen, COALESCE(@last_seen, CURRENT_TIMESTAMP))
         ON CONFLICT(post_id) DO UPDATE SET
           status = excluded.status,
           last_seen = excluded.last_seen`
      )
      .run(row);
  }

  getPostHistory(): PostHistoryRow[] {
    const rows = this.db
      .prepare(
        `SELECT post_id, status, first_seen, last_seen
         FROM post_history ORDER BY last_seen DESC`
      )
      .all() as PostHistoryRow[];
    return rows;
  }

  upsertTrackingLink(link: Omit<TrackingLink, "updated_at">): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO tracking_links
          (link_id, label, utm_source, utm_medium, utm_campaign, post_id, clicks, conversions, revenue_generated)
         VALUES (@link_id, @label, @utm_source, @utm_medium, @utm_campaign, @post_id, @clicks, @conversions, @revenue_generated)`
      )
      .run(link);
  }

  getTrackingLinks(): TrackingLink[] {
    const rows = this.db
      .prepare(
        `SELECT link_id, label, utm_source, utm_medium, utm_campaign, post_id, clicks, conversions, revenue_generated, updated_at
         FROM tracking_links ORDER BY revenue_generated DESC`
      )
      .all() as TrackingLink[];
    return rows;
  }

  incrementTrackingLink(linkId: string, clicksDelta: number, conversionsDelta: number, revenueDelta: number): void {
    this.db
      .prepare(
        `UPDATE tracking_links SET
           clicks = clicks + @clicks,
           conversions = conversions + @conversions,
           revenue_generated = revenue_generated + @revenue,
           updated_at = CURRENT_TIMESTAMP
         WHERE link_id = @link_id`
      )
      .run({ link_id: linkId, clicks: clicksDelta, conversions: conversionsDelta, revenue: revenueDelta });
  }

  upsertCompetitor(row: Omit<CompetitorRow, never>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO competitors
          (account_id, username, display_name, follow_count, subscriber_count,
           image_count, video_count, bundle_count, last_seen_at, niche, active)
         VALUES (@account_id, @username, @display_name, @follow_count, @subscriber_count,
           @image_count, @video_count, @bundle_count, @last_seen_at, @niche, @active)`
      )
      .run(row);
  }

  getCompetitors(): CompetitorRow[] {
    const rows = this.db
      .prepare(
        `SELECT account_id, username, display_name, follow_count, subscriber_count,
           image_count, video_count, bundle_count, last_seen_at, niche, active
         FROM competitors ORDER BY follow_count DESC`
      )
      .all() as CompetitorRow[];
    return rows;
  }

  removeCompetitor(accountId: string): void {
    this.db.prepare("DELETE FROM competitors WHERE account_id = ?").run(accountId);
  }

  upsertCompetitorSnapshot(row: Omit<CompetitorSnapshotRow, never>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO competitor_snapshots
          (account_id, date, follow_count, subscriber_count, image_count, video_count, bundle_count)
         VALUES (@account_id, @date, @follow_count, @subscriber_count, @image_count, @video_count, @bundle_count)`
      )
      .run(row);
  }

  getCompetitorSnapshots(accountId: string): CompetitorSnapshotRow[] {
    const rows = this.db
      .prepare(
        `SELECT account_id, date, follow_count, subscriber_count, image_count, video_count, bundle_count
         FROM competitor_snapshots WHERE account_id = ? ORDER BY date ASC`
      )
      .all(accountId) as CompetitorSnapshotRow[];
    return rows;
  }

  getLatestCompetitorSnapshots(accountId: string, limit: number): CompetitorSnapshotRow[] {
    const rows = this.db
      .prepare(
        `SELECT account_id, date, follow_count, subscriber_count, image_count, video_count, bundle_count
         FROM competitor_snapshots WHERE account_id = ? ORDER BY date DESC LIMIT ?`
      )
      .all(accountId, limit) as CompetitorSnapshotRow[];
    return rows.reverse();
  }

  upsertCompetitorHashtag(accountId: string, hashtag: string, date: string, frequency: number): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO competitor_hashtags (account_id, hashtag, date, frequency)
         VALUES (@account_id, @hashtag, @date, @frequency)`
      )
      .run({ account_id: accountId, hashtag, date, frequency });
  }

  getCompetitorHashtags(accountId: string): Array<{ hashtag: string; frequency: number }> {
    const rows = this.db
      .prepare(
        `SELECT hashtag, MAX(frequency) as frequency
         FROM competitor_hashtags WHERE account_id = ? GROUP BY hashtag ORDER BY frequency DESC`
      )
      .all(accountId) as Array<{ hashtag: string; frequency: number }>;
    return rows;
  }

  getCompetitorHashtagTrends(sinceDate: string): Array<{ hashtag: string; date: string; frequency: number }> {
    const rows = this.db
      .prepare(
        `SELECT hashtag, date, SUM(frequency) as frequency
         FROM competitor_hashtags WHERE date >= ? GROUP BY hashtag, date ORDER BY date ASC`
      )
      .all(sinceDate) as Array<{ hashtag: string; date: string; frequency: number }>;
    return rows;
  }

  upsertFypTracker(row: Omit<FypTrackerRow, never>): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO fyp_tracker (post_id, date, fyp_flags, likes, media_likes, tips)
         VALUES (@post_id, @date, @fyp_flags, @likes, @media_likes, @tips)`
      )
      .run(row);
  }

  getFypTracker(postId?: string): FypTrackerRow[] {
    const rows = postId
      ? (this.db
          .prepare(
            `SELECT post_id, date, fyp_flags, likes, media_likes, tips
             FROM fyp_tracker WHERE post_id = ? ORDER BY date ASC`
          )
          .all(postId) as FypTrackerRow[])
      : (this.db
          .prepare(
            `SELECT post_id, date, fyp_flags, likes, media_likes, tips
             FROM fyp_tracker ORDER BY date DESC LIMIT 500`
          )
          .all() as FypTrackerRow[]);
    return rows;
  }

  close(): void {
    this.db.close();
  }
}
