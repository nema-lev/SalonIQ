#!/usr/bin/env node

/**
 * Calendar allocation backfill dry-run / integrity report.
 *
 * This script is intentionally read-only:
 * - it starts one READ ONLY transaction
 * - it runs inspection SELECTs only
 * - it rolls the transaction back before exit
 *
 * Usage:
 *   cd backend
 *   DATABASE_URL="postgresql://..." npm run report:calendar-allocation-backfill
 *   DATABASE_URL="postgresql://..." npm run report:calendar-allocation-backfill -- --schema=tenant_demo_business
 *   DATABASE_URL="postgresql://..." npm run report:calendar-allocation-backfill -- --json
 */

const { Client } = require('pg');

const ACTIVE_APPOINTMENT_STATUSES = ['pending', 'proposal_pending', 'confirmed'];
const TERMINAL_APPOINTMENT_STATUSES = ['cancelled', 'completed', 'no_show'];
const ACTIVE_APPOINTMENT_ALLOCATION_STATUSES = ['booked', 'held'];
const ACTIVE_EXCLUSIVE_ALLOCATION_STATUSES = ['booked', 'held', 'blocked'];
const DETAILS_LIMIT = 20;

function assertSafeSchemaName(schemaName) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }
}

function quoteIdentifier(identifier) {
  assertSafeSchemaName(identifier);
  return `"${identifier}"`;
}

function requiredAllocationIndexes(schemaName) {
  const normalizedSchemaName = schemaName.replace('.', '_');
  return [
    `idx_${normalizedSchemaName}_calendar_allocations_resource`,
    `idx_${normalizedSchemaName}_calendar_allocations_occupied_interval`,
    `idx_${normalizedSchemaName}_calendar_allocations_source`,
    `idx_${normalizedSchemaName}_calendar_allocations_status`,
  ];
}

function standardServicePredicate(alias, hasBookingModeColumn) {
  return hasBookingModeColumn
    ? `COALESCE(${alias}.booking_mode, 'standard') = 'standard'`
    : 'TRUE';
}

function bufferExpression(alias, columnName, columnExists) {
  return columnExists ? `COALESCE(${alias}.${columnName}, 0)` : '0';
}

function normalizeRowCount(rows) {
  return Array.isArray(rows) ? rows.length : 0;
}

function classifyTenantReadiness(report) {
  if (!report.infrastructure.ready) {
    return 'BLOCKED_BY_SCHEMA';
  }

  if (
    report.overlappingLegacyAppointmentPairs.length > 0 ||
    report.bufferOnlyConflictPairs.length > 0 ||
    report.existingAllocationOverlapPairs.length > 0
  ) {
    return 'BLOCKED_BY_OVERLAPS';
  }

  if (
    report.terminalAppointmentsWithActiveAllocations.length > 0 ||
    report.orphanAllocations.length > 0 ||
    report.duplicateActiveAllocations.length > 0
  ) {
    return 'NEEDS_MANUAL_REVIEW';
  }

  return 'READY_FOR_BACKFILL';
}

async function inspectTenant(client, schemaName, options) {
  assertSafeSchemaName(schemaName);

  const quotedSchema = quoteIdentifier(schemaName);
  const serviceColumnsResult = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'services'
      AND column_name IN ('booking_mode', 'buffer_before_min', 'buffer_after_min')
    `,
    [schemaName],
  );
  const serviceColumns = new Set(serviceColumnsResult.rows.map((row) => row.column_name));
  const hasBookingModeColumn = serviceColumns.has('booking_mode');
  const hasBufferBeforeColumn = serviceColumns.has('buffer_before_min');
  const hasBufferAfterColumn = serviceColumns.has('buffer_after_min');

  const tableResult = await client.query(
    `
    SELECT to_regclass($1) IS NOT NULL AS exists
    `,
    [`${schemaName}.calendar_allocations`],
  );
  const tableExists = Boolean(tableResult.rows[0]?.exists);

  let exclusionConstraintExists = false;
  let presentIndexes = [];

  if (tableExists) {
    const constraintResult = await client.query(
      `
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = $1
          AND t.relname = 'calendar_allocations'
          AND c.conname = 'calendar_allocations_no_active_exclusive_overlap'
      ) AS exists
      `,
      [schemaName],
    );
    exclusionConstraintExists = Boolean(constraintResult.rows[0]?.exists);

    const indexesResult = await client.query(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = $1
        AND tablename = 'calendar_allocations'
      ORDER BY indexname ASC
      `,
      [schemaName],
    );
    presentIndexes = indexesResult.rows.map((row) => row.indexname);
  }

  const requiredIndexes = requiredAllocationIndexes(schemaName);
  const missingIndexes = requiredIndexes.filter((indexName) => !presentIndexes.includes(indexName));
  const infrastructure = {
    tableExists,
    exclusionConstraintExists,
    requiredIndexes,
    presentIndexes,
    missingIndexes,
    btreeGistInstalled: options.btreeGistInstalled,
    ready:
      tableExists &&
      exclusionConstraintExists &&
      missingIndexes.length === 0 &&
      options.btreeGistInstalled,
  };

  const activeStandardAppointmentsResult = await client.query(
    `
    SELECT
      a.id::text AS appointment_id,
      a.staff_id::text AS staff_id,
      a.service_id::text AS service_id,
      a.status,
      a.start_at::text AS start_at,
      a.end_at::text AS end_at
    FROM ${quotedSchema}.appointments a
    JOIN ${quotedSchema}.services sv ON sv.id = a.service_id
    WHERE a.status = ANY($1::text[])
      AND ${standardServicePredicate('sv', hasBookingModeColumn)}
    ORDER BY a.start_at ASC, a.id ASC
    `,
    [ACTIVE_APPOINTMENT_STATUSES],
  );
  const activeStandardAppointments = activeStandardAppointmentsResult.rows;

  let activeAppointmentsMissingAllocations = activeStandardAppointments;
  let terminalAppointmentsWithActiveAllocations = [];
  let orphanAllocations = [];
  let duplicateActiveAllocations = [];
  let existingAllocationOverlapPairs = [];

  if (tableExists) {
    const missingAllocationsResult = await client.query(
      `
      SELECT
        a.id::text AS appointment_id,
        a.staff_id::text AS staff_id,
        a.service_id::text AS service_id,
        a.status,
        a.start_at::text AS start_at,
        a.end_at::text AS end_at
      FROM ${quotedSchema}.appointments a
      JOIN ${quotedSchema}.services sv ON sv.id = a.service_id
      LEFT JOIN ${quotedSchema}.calendar_allocations ca
        ON ca.source_type = 'appointment'
       AND ca.source_id = a.id
       AND ca.status = ANY($2::text[])
      WHERE a.status = ANY($1::text[])
        AND ${standardServicePredicate('sv', hasBookingModeColumn)}
        AND ca.id IS NULL
      ORDER BY a.start_at ASC, a.id ASC
      `,
      [ACTIVE_APPOINTMENT_STATUSES, ACTIVE_APPOINTMENT_ALLOCATION_STATUSES],
    );
    activeAppointmentsMissingAllocations = missingAllocationsResult.rows;

    const terminalAllocationsResult = await client.query(
      `
      SELECT
        a.id::text AS appointment_id,
        a.status AS appointment_status,
        ca.id::text AS allocation_id,
        ca.status AS allocation_status,
        ca.resource_id::text AS staff_id,
        ca.display_start_at::text AS display_start_at,
        ca.display_end_at::text AS display_end_at
      FROM ${quotedSchema}.appointments a
      JOIN ${quotedSchema}.services sv ON sv.id = a.service_id
      JOIN ${quotedSchema}.calendar_allocations ca
        ON ca.source_type = 'appointment'
       AND ca.source_id = a.id
      WHERE a.status = ANY($1::text[])
        AND ca.status = ANY($2::text[])
        AND ${standardServicePredicate('sv', hasBookingModeColumn)}
      ORDER BY a.id ASC, ca.id ASC
      `,
      [TERMINAL_APPOINTMENT_STATUSES, ACTIVE_APPOINTMENT_ALLOCATION_STATUSES],
    );
    terminalAppointmentsWithActiveAllocations = terminalAllocationsResult.rows;

    const orphanAllocationsResult = await client.query(
      `
      SELECT
        ca.id::text AS allocation_id,
        ca.source_id::text AS source_id,
        ca.resource_id::text AS staff_id,
        ca.status,
        ca.display_start_at::text AS display_start_at,
        ca.display_end_at::text AS display_end_at
      FROM ${quotedSchema}.calendar_allocations ca
      LEFT JOIN ${quotedSchema}.appointments a ON a.id = ca.source_id
      WHERE ca.source_type = 'appointment'
        AND ca.status = ANY($1::text[])
        AND a.id IS NULL
      ORDER BY ca.id ASC
      `,
      [ACTIVE_EXCLUSIVE_ALLOCATION_STATUSES],
    );
    orphanAllocations = orphanAllocationsResult.rows;

    const duplicateAllocationsResult = await client.query(
      `
      SELECT
        ca.source_id::text AS appointment_id,
        COUNT(*)::integer AS active_allocation_count,
        ARRAY_AGG(ca.id::text ORDER BY ca.id) AS allocation_ids
      FROM ${quotedSchema}.calendar_allocations ca
      JOIN ${quotedSchema}.appointments a ON a.id = ca.source_id
      JOIN ${quotedSchema}.services sv ON sv.id = a.service_id
      WHERE ca.source_type = 'appointment'
        AND ca.status = ANY($1::text[])
        AND ${standardServicePredicate('sv', hasBookingModeColumn)}
      GROUP BY ca.source_id
      HAVING COUNT(*) > 1
      ORDER BY ca.source_id ASC
      `,
      [ACTIVE_EXCLUSIVE_ALLOCATION_STATUSES],
    );
    duplicateActiveAllocations = duplicateAllocationsResult.rows;

    const allocationOverlapResult = await client.query(
      `
      SELECT
        ca1.id::text AS first_allocation_id,
        ca2.id::text AS second_allocation_id,
        ca1.resource_type,
        ca1.resource_id::text AS resource_id,
        ca1.occupied_start_at::text AS first_occupied_start_at,
        ca1.occupied_end_at::text AS first_occupied_end_at,
        ca2.occupied_start_at::text AS second_occupied_start_at,
        ca2.occupied_end_at::text AS second_occupied_end_at
      FROM ${quotedSchema}.calendar_allocations ca1
      JOIN ${quotedSchema}.calendar_allocations ca2
        ON ca1.id < ca2.id
       AND ca1.resource_type = ca2.resource_type
       AND ca1.resource_id = ca2.resource_id
       AND ca1.exclusive = true
       AND ca2.exclusive = true
       AND ca1.status = ANY($1::text[])
       AND ca2.status = ANY($1::text[])
       AND ca1.occupied_start_at < ca2.occupied_end_at
       AND ca1.occupied_end_at > ca2.occupied_start_at
      ORDER BY ca1.resource_type ASC, ca1.resource_id ASC, ca1.occupied_start_at ASC, ca1.id ASC
      `,
      [ACTIVE_EXCLUSIVE_ALLOCATION_STATUSES],
    );
    existingAllocationOverlapPairs = allocationOverlapResult.rows;
  }

  const activeAllocationJoinFirst = tableExists
    ? `
      LEFT JOIN ${quotedSchema}.calendar_allocations ca1
        ON ca1.source_type = 'appointment'
       AND ca1.source_id = a1.id
       AND ca1.status = ANY($2::text[])
      LEFT JOIN ${quotedSchema}.calendar_allocations ca2
        ON ca2.source_type = 'appointment'
       AND ca2.source_id = a2.id
       AND ca2.status = ANY($2::text[])
    `
    : '';
  const missingAllocationPairPredicate = tableExists ? 'AND (ca1.id IS NULL OR ca2.id IS NULL)' : '';
  const overlapParams = tableExists
    ? [ACTIVE_APPOINTMENT_STATUSES, ACTIVE_APPOINTMENT_ALLOCATION_STATUSES]
    : [ACTIVE_APPOINTMENT_STATUSES];

  const overlappingLegacyAppointmentsResult = await client.query(
    `
    SELECT
      a1.id::text AS first_appointment_id,
      a2.id::text AS second_appointment_id,
      a1.staff_id::text AS staff_id,
      a1.service_id::text AS first_service_id,
      a2.service_id::text AS second_service_id,
      a1.start_at::text AS first_start_at,
      a1.end_at::text AS first_end_at,
      a2.start_at::text AS second_start_at,
      a2.end_at::text AS second_end_at
    FROM ${quotedSchema}.appointments a1
    JOIN ${quotedSchema}.appointments a2
      ON a1.id < a2.id
     AND a1.staff_id = a2.staff_id
     AND a1.start_at < a2.end_at
     AND a1.end_at > a2.start_at
    JOIN ${quotedSchema}.services sv1 ON sv1.id = a1.service_id
    JOIN ${quotedSchema}.services sv2 ON sv2.id = a2.service_id
    ${activeAllocationJoinFirst}
    WHERE a1.status = ANY($1::text[])
      AND a2.status = ANY($1::text[])
      AND ${standardServicePredicate('sv1', hasBookingModeColumn)}
      AND ${standardServicePredicate('sv2', hasBookingModeColumn)}
      ${missingAllocationPairPredicate}
    ORDER BY a1.staff_id ASC, a1.start_at ASC, a1.id ASC, a2.id ASC
    `,
    overlapParams,
  );
  const overlappingLegacyAppointmentPairs = overlappingLegacyAppointmentsResult.rows;

  let bufferOnlyConflictPairs = [];
  if (hasBufferBeforeColumn || hasBufferAfterColumn) {
    const bufferOnlyConflictsResult = await client.query(
      `
      SELECT
        a1.id::text AS first_appointment_id,
        a2.id::text AS second_appointment_id,
        a1.staff_id::text AS staff_id,
        a1.service_id::text AS first_service_id,
        a2.service_id::text AS second_service_id,
        a1.start_at::text AS first_display_start_at,
        a1.end_at::text AS first_display_end_at,
        a2.start_at::text AS second_display_start_at,
        a2.end_at::text AS second_display_end_at,
        (
          a1.start_at - (${bufferExpression('sv1', 'buffer_before_min', hasBufferBeforeColumn)} * INTERVAL '1 minute')
        )::text AS first_occupied_start_at,
        (
          a1.end_at + (${bufferExpression('sv1', 'buffer_after_min', hasBufferAfterColumn)} * INTERVAL '1 minute')
        )::text AS first_occupied_end_at,
        (
          a2.start_at - (${bufferExpression('sv2', 'buffer_before_min', hasBufferBeforeColumn)} * INTERVAL '1 minute')
        )::text AS second_occupied_start_at,
        (
          a2.end_at + (${bufferExpression('sv2', 'buffer_after_min', hasBufferAfterColumn)} * INTERVAL '1 minute')
        )::text AS second_occupied_end_at
      FROM ${quotedSchema}.appointments a1
      JOIN ${quotedSchema}.appointments a2
        ON a1.id < a2.id
       AND a1.staff_id = a2.staff_id
      JOIN ${quotedSchema}.services sv1 ON sv1.id = a1.service_id
      JOIN ${quotedSchema}.services sv2 ON sv2.id = a2.service_id
      ${activeAllocationJoinFirst}
      WHERE a1.status = ANY($1::text[])
        AND a2.status = ANY($1::text[])
        AND ${standardServicePredicate('sv1', hasBookingModeColumn)}
        AND ${standardServicePredicate('sv2', hasBookingModeColumn)}
        AND NOT (
          a1.start_at < a2.end_at
          AND a1.end_at > a2.start_at
        )
        AND (
          a1.start_at - (${bufferExpression('sv1', 'buffer_before_min', hasBufferBeforeColumn)} * INTERVAL '1 minute')
        ) < (
          a2.end_at + (${bufferExpression('sv2', 'buffer_after_min', hasBufferAfterColumn)} * INTERVAL '1 minute')
        )
        AND (
          a1.end_at + (${bufferExpression('sv1', 'buffer_after_min', hasBufferAfterColumn)} * INTERVAL '1 minute')
        ) > (
          a2.start_at - (${bufferExpression('sv2', 'buffer_before_min', hasBufferBeforeColumn)} * INTERVAL '1 minute')
        )
        ${missingAllocationPairPredicate}
      ORDER BY a1.staff_id ASC, a1.start_at ASC, a1.id ASC, a2.id ASC
      `,
      overlapParams,
    );
    bufferOnlyConflictPairs = bufferOnlyConflictsResult.rows;
  }

  const report = {
    schemaName,
    serviceColumns: {
      bookingMode: hasBookingModeColumn,
      bufferBefore: hasBufferBeforeColumn,
      bufferAfter: hasBufferAfterColumn,
    },
    infrastructure,
    activeStandardAppointments,
    activeAppointmentsMissingAllocations,
    terminalAppointmentsWithActiveAllocations,
    orphanAllocations,
    duplicateActiveAllocations,
    overlappingLegacyAppointmentPairs,
    bufferOnlyConflictPairs,
    existingAllocationOverlapPairs,
  };

  return {
    ...report,
    readiness: classifyTenantReadiness(report),
  };
}

async function runReadOnlyReport(client, options = {}) {
  await client.query('BEGIN READ ONLY');

  try {
    const tenantSchemasResult = await client.query(
      `
      SELECT t.schema_name
      FROM public.tenants t
      JOIN information_schema.schemata s ON s.schema_name = t.schema_name
      WHERE ($1::text IS NULL OR t.schema_name = $1::text)
      ORDER BY t.schema_name ASC
      `,
      [options.schemaName || null],
    );
    const extensionResult = await client.query(
      `
      SELECT EXISTS (
        SELECT 1
        FROM pg_extension
        WHERE extname = 'btree_gist'
      ) AS exists
      `,
    );
    const btreeGistInstalled = Boolean(extensionResult.rows[0]?.exists);
    const tenants = [];

    for (const row of tenantSchemasResult.rows) {
      tenants.push(
        await inspectTenant(client, row.schema_name, {
          btreeGistInstalled,
        }),
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      tenants,
    };
  } finally {
    await client.query('ROLLBACK');
  }
}

function formatBoolean(value) {
  return value ? 'yes' : 'no';
}

function formatFindingRows(rows, formatter) {
  if (!rows.length) {
    return [];
  }

  const visibleRows = rows.slice(0, DETAILS_LIMIT);
  const lines = visibleRows.map((row) => `    - ${formatter(row)}`);
  if (rows.length > DETAILS_LIMIT) {
    lines.push(`    - ... ${rows.length - DETAILS_LIMIT} more not shown`);
  }
  return lines;
}

function formatReport(report) {
  const lines = [
    'Calendar allocation backfill dry-run report',
    `Generated at: ${report.generatedAt}`,
    'Mode: READ ONLY (BEGIN READ ONLY; ROLLBACK)',
    `Tenants inspected: ${report.tenants.length}`,
  ];

  for (const tenant of report.tenants) {
    lines.push('');
    lines.push(`Tenant: ${tenant.schemaName}`);
    lines.push(`  Total active standard appointments: ${normalizeRowCount(tenant.activeStandardAppointments)}`);
    lines.push(`  Active appointments missing allocations: ${normalizeRowCount(tenant.activeAppointmentsMissingAllocations)}`);
    lines.push(`  Terminal appointments with active allocations: ${normalizeRowCount(tenant.terminalAppointmentsWithActiveAllocations)}`);
    lines.push(`  Orphan active appointment allocations: ${normalizeRowCount(tenant.orphanAllocations)}`);
    lines.push(`  Duplicate active allocations: ${normalizeRowCount(tenant.duplicateActiveAllocations)}`);
    lines.push(`  Overlapping legacy appointment pairs: ${normalizeRowCount(tenant.overlappingLegacyAppointmentPairs)}`);
    lines.push(`  Buffer-only conflict pairs: ${normalizeRowCount(tenant.bufferOnlyConflictPairs)}`);
    lines.push(`  Existing active exclusive allocation overlap pairs: ${normalizeRowCount(tenant.existingAllocationOverlapPairs)}`);
    lines.push('  Allocation infrastructure:');
    lines.push(`    calendar_allocations table: ${formatBoolean(tenant.infrastructure.tableExists)}`);
    lines.push(`    exclusion constraint: ${formatBoolean(tenant.infrastructure.exclusionConstraintExists)}`);
    lines.push(`    btree_gist extension: ${formatBoolean(tenant.infrastructure.btreeGistInstalled)}`);
    lines.push(
      `    required indexes: ${
        tenant.infrastructure.missingIndexes.length === 0
          ? 'ok'
          : `missing ${tenant.infrastructure.missingIndexes.join(', ')}`
      }`,
    );
    lines.push(`  Readiness: ${tenant.readiness}`);

    const findingLines = [
      ...formatFindingRows(
        tenant.activeAppointmentsMissingAllocations,
        (row) =>
          `missing allocation appointment=${row.appointment_id} staff=${row.staff_id} service=${row.service_id} status=${row.status} display=[${row.start_at}, ${row.end_at})`,
      ),
      ...formatFindingRows(
        tenant.terminalAppointmentsWithActiveAllocations,
        (row) =>
          `terminal appointment with active allocation appointment=${row.appointment_id} appointment_status=${row.appointment_status} allocation=${row.allocation_id} allocation_status=${row.allocation_status}`,
      ),
      ...formatFindingRows(
        tenant.orphanAllocations,
        (row) =>
          `orphan allocation=${row.allocation_id} source_id=${row.source_id} staff=${row.staff_id} status=${row.status}`,
      ),
      ...formatFindingRows(
        tenant.duplicateActiveAllocations,
        (row) =>
          `duplicate appointment=${row.appointment_id} active_allocations=${row.active_allocation_count} allocation_ids=${row.allocation_ids.join(',')}`,
      ),
      ...formatFindingRows(
        tenant.overlappingLegacyAppointmentPairs,
        (row) =>
          `legacy overlap appointments=${row.first_appointment_id},${row.second_appointment_id} staff=${row.staff_id}`,
      ),
      ...formatFindingRows(
        tenant.bufferOnlyConflictPairs,
        (row) =>
          `buffer-only conflict appointments=${row.first_appointment_id},${row.second_appointment_id} staff=${row.staff_id}`,
      ),
      ...formatFindingRows(
        tenant.existingAllocationOverlapPairs,
        (row) =>
          `allocation overlap allocations=${row.first_allocation_id},${row.second_allocation_id} resource=${row.resource_type}:${row.resource_id}`,
      ),
    ];

    if (findingLines.length > 0) {
      lines.push('  Findings:');
      lines.push(...findingLines);
    }
  }

  return lines.join('\n');
}

function parseArgs(argv) {
  const options = {
    json: false,
    schemaName: null,
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg.startsWith('--schema=')) {
      options.schemaName = arg.slice('--schema='.length);
      assertSafeSchemaName(options.schemaName);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const report = await runReadOnlyReport(client, options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(formatReport(report));
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Calendar allocation backfill dry-run failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  ACTIVE_APPOINTMENT_STATUSES,
  ACTIVE_APPOINTMENT_ALLOCATION_STATUSES,
  ACTIVE_EXCLUSIVE_ALLOCATION_STATUSES,
  TERMINAL_APPOINTMENT_STATUSES,
  classifyTenantReadiness,
  formatReport,
  inspectTenant,
  parseArgs,
  runReadOnlyReport,
};
