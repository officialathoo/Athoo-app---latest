export type LegacyReferencedMediaQueryResult<Row> = {
  rows: Row[];
  rowCount: number | null;
};

export type LegacyReferencedMediaQueryClient = {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<
    LegacyReferencedMediaQueryResult<Row>
  >;

  release(): void;
};

export type LegacyReferencedMediaSourceRowLock = {
  source:
    | "bookings.video_url"
    | "broadcast_requests.video_url"
    | "commission_payments.screenshot_url"
    | "provider_documents.url"
    | "support_tickets.media_urls";

  sql: string;
};

function normalizedObjectPathSql(
  referenceExpression: string,
): string {
  return `
    CASE
      WHEN BTRIM(${referenceExpression})
        LIKE '/objects/%'
        THEN BTRIM(${referenceExpression})

      WHEN BTRIM(${referenceExpression})
        LIKE 'objects/%'
        THEN '/' ||
          BTRIM(${referenceExpression})

      WHEN BTRIM(${referenceExpression})
        LIKE 'uploads/%'
        THEN '/objects/' ||
          BTRIM(${referenceExpression})

      ELSE NULL
    END
  `;
}

function directReferenceLockSql(
  table: string,
  alias: string,
  column: string,
): string {
  const normalized =
    normalizedObjectPathSql(
      `${alias}.${column}`,
    );

  return `
    SELECT
      ${alias}.ctid
    FROM public.${table}
      AS ${alias}
    WHERE (
      ${normalized}
    ) = $1
    ORDER BY
      ${alias}.ctid
    FOR UPDATE OF
      ${alias}
  `;
}

const supportTicketReference =
  normalizedObjectPathSql(
    "extracted.value #>> '{}'",
  );

const supportTicketLockSql = `
  SELECT
    ticket.ctid
  FROM public.support_tickets
    AS ticket
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_path_query(
      COALESCE(
        ticket.media_urls,
        'null'::jsonb
      ),
      '$.** ? (@.type() == "string")'
    ) AS extracted(value)
    WHERE (
      ${supportTicketReference}
    ) = $1
  )
  ORDER BY
    ticket.ctid
  FOR UPDATE OF
    ticket
`;

export const
  LEGACY_REFERENCED_MEDIA_SOURCE_ROW_LOCKS:
    readonly LegacyReferencedMediaSourceRowLock[] =
  [
    {
      source:
        "bookings.video_url",

      sql:
        directReferenceLockSql(
          "bookings",
          "booking",
          "video_url",
        ),
    },
    {
      source:
        "broadcast_requests.video_url",

      sql:
        directReferenceLockSql(
          "broadcast_requests",
          "broadcast",
          "video_url",
        ),
    },
    {
      source:
        "commission_payments.screenshot_url",

      sql:
        directReferenceLockSql(
          "commission_payments",
          "commission",
          "screenshot_url",
        ),
    },
    {
      source:
        "provider_documents.url",

      sql:
        directReferenceLockSql(
          "provider_documents",
          "document",
          "url",
        ),
    },
    {
      source:
        "support_tickets.media_urls",

      sql:
        supportTicketLockSql,
    },
  ];

export async function
lockLegacyReferencedMediaSourceRows(
  client:
    LegacyReferencedMediaQueryClient,

  objectPath:
    string,
): Promise<number> {
  let lockedRowCount = 0;

  for (
    const sourceLock of
      LEGACY_REFERENCED_MEDIA_SOURCE_ROW_LOCKS
  ) {
    const locked =
      await client.query(
        sourceLock.sql,
        [objectPath],
      );

    lockedRowCount +=
      locked.rowCount ??
      locked.rows.length;
  }

  return lockedRowCount;
}
