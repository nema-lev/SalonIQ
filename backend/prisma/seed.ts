/**
 * SalonIQ — Seed скрипт за локална разработка
 *
 * Създава:
 * - Тестов tenant: "Примерен бизнес" (slug: demo-business)
 * - 2 служители с работно разписание
 * - 6 услуги в 2 категории
 * - 1 собственик (owner@demo-business.local / password: demo123)
 * - 5 тестови клиента с резервации
 *
 * Използване:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register prisma/seed.ts
 */

import { Client as PgClient } from 'pg';
import * as bcrypt from 'bcryptjs';

const DB_URL = process.env.DATABASE_URL ||
  'postgresql://saloniq_user:dev_password_change_in_prod@localhost:5432/saloniq_db';
const DEMO_SLUG = 'demo-business';
const DEMO_SCHEMA = 'tenant_demo_business';
const DEMO_NAME = 'Примерен бизнес';
const DEMO_OWNER_EMAIL = 'owner@demo-business.local';
const DEMO_INFO_EMAIL = 'info@demo-business.local';

async function seed() {
  const client = new PgClient({ connectionString: DB_URL });
  await client.connect();
  console.log('🌱 Starting seed...');

  try {
    await client.query('BEGIN');

    // ─── 1. Tenant ───────────────────────────────────────────────────
    const tenantRes = await client.query(`
      INSERT INTO public.tenants (
        slug, schema_name, business_name, business_type,
        description, address, city, phone, email,
        telegram_bot_token, telegram_chat_id,
        theme_config, working_hours,
        requires_confirmation, cancellation_hours,
        min_advance_booking_hours, max_advance_booking_days,
        plan, plan_status
      ) VALUES (
        '${DEMO_SLUG}',
        '${DEMO_SCHEMA}',
        '${DEMO_NAME}',
        'SALON',
        'Вашият любим салон за красота в София. Предлагаме пълна гама от козметични услуги.',
        'ул. Витоша 42',
        'София',
        '+359 888 123 456',
        '${DEMO_INFO_EMAIL}',
        NULL,
        NULL,
        '{"primaryColor": "#7c3aed", "secondaryColor": "#a855f7", "accentColor": "#f59e0b", "borderRadius": "rounded"}',
        '{"mon":{"open":"09:00","close":"18:00","isOpen":true},"tue":{"open":"09:00","close":"18:00","isOpen":true},"wed":{"open":"09:00","close":"18:00","isOpen":true},"thu":{"open":"10:00","close":"19:00","isOpen":true},"fri":{"open":"09:00","close":"17:00","isOpen":true},"sat":{"open":"10:00","close":"15:00","isOpen":true},"sun":{"open":"00:00","close":"00:00","isOpen":false}}',
        false, 24, 1, 60,
        'PRO', 'TRIAL'
      )
      ON CONFLICT (slug) DO UPDATE SET business_name = EXCLUDED.business_name
      RETURNING id
    `);
    const tenantId = tenantRes.rows[0].id;
    console.log(`✅ Tenant: ${tenantId}`);

    // ─── 2. Owner ─────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('demo123', 12);
    await client.query(`
      INSERT INTO public.tenant_owners (tenant_id, name, email, password_hash, role)
      VALUES ($1, 'Елена Петрова', '${DEMO_OWNER_EMAIL}', $2, 'OWNER')
      ON CONFLICT (email) DO NOTHING
    `, [tenantId, passwordHash]);
    console.log(`✅ Owner: ${DEMO_OWNER_EMAIL} / demo123`);

    // ─── 3. Create tenant schema ──────────────────────────────────────
    await client.query(`SELECT create_tenant_schema('${DEMO_SCHEMA}')`);
    await client.query(`SET search_path TO ${DEMO_SCHEMA}, public`);
    console.log('✅ Schema created');

    // ─── 4. Staff ─────────────────────────────────────────────────────
    const workingHours = JSON.stringify({
      mon: { open: '09:00', close: '18:00', isOpen: true },
      tue: { open: '09:00', close: '18:00', isOpen: true },
      wed: { open: '09:00', close: '18:00', isOpen: true },
      thu: { open: '10:00', close: '19:00', isOpen: true },
      fri: { open: '09:00', close: '17:00', isOpen: true },
      sat: { open: '10:00', close: '15:00', isOpen: true },
      sun: { open: '00:00', close: '00:00', isOpen: false },
    });

    const staffRes = await client.query(`
      INSERT INTO ${DEMO_SCHEMA}.staff (name, role, color, bio, specialties, working_hours)
      VALUES
        ('Елена Петрова', 'owner', '#7c3aed',
         'Собственик и главен стилист с 10 години опит. Специалист по боядисване и прически.',
         ARRAY['Боядисване', 'Прически', 'Подстригване'], $1::jsonb),
        ('Мария Иванова', 'employee', '#ec4899',
         'Специалист по маникюр и педикюр. 5 години в бранша.',
         ARRAY['Маникюр', 'Педикюр', 'Гел лак'], $1::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `, [workingHours]);

    const [elena, maria] = staffRes.rows;
    console.log(`✅ Staff: ${elena?.name}, ${maria?.name}`);

    // ─── 5. Services ──────────────────────────────────────────────────
    const elenaId = elena?.id;
    const mariaId = maria?.id;

    if (elenaId && mariaId) {
      await client.query(`
        INSERT INTO ${DEMO_SCHEMA}.services
          (name, category, duration_minutes, price, color, staff_ids, display_order)
        VALUES
          ('Подстригване', 'Коса', 30, 25.00, '#8b5cf6', ARRAY[$1::uuid], 1),
          ('Боядисване', 'Коса', 120, 85.00, '#7c3aed', ARRAY[$1::uuid], 2),
          ('Боядисване + Подстригване', 'Коса', 150, 100.00, '#6d28d9', ARRAY[$1::uuid], 3),
          ('Маникюр', 'Нокти', 60, 30.00, '#ec4899', ARRAY[$2::uuid], 4),
          ('Педикюр', 'Нокти', 75, 35.00, '#f43f5e', ARRAY[$2::uuid], 5),
          ('Гел лак', 'Нокти', 45, 25.00, '#db2777', ARRAY[$2::uuid], 6)
        ON CONFLICT DO NOTHING
      `, [elenaId, mariaId]);
      console.log('✅ Services created (6)');
    }

    // ─── 6. Test clients ──────────────────────────────────────────────
    const testClients = [
      { name: 'Мария Стоянова', phone: '+359888111001', email: 'maria.s@test.bg' },
      { name: 'Ирена Димитрова', phone: '+359888111002', email: 'irena.d@test.bg' },
      { name: 'Петя Николова', phone: '+359888111003', email: null },
      { name: 'Снежана Георгиева', phone: '+359888111004', email: null },
      { name: 'Тодора Йорданова', phone: '+359888111005', email: null },
    ];

    for (const c of testClients) {
      await client.query(`
        INSERT INTO ${DEMO_SCHEMA}.clients (name, phone, email, notifications_consent, consent_given_at)
        VALUES ($1, $2, $3, true, NOW())
        ON CONFLICT DO NOTHING
      `, [c.name, c.phone, c.email]);
    }
    console.log('✅ Test clients created (5)');

    // ─── 7. Sample appointments (бъдещи) ─────────────────────────────
    if (elenaId) {
      const serviceRes = await client.query(`
        SELECT id FROM ${DEMO_SCHEMA}.services LIMIT 2
      `);
      const clientRes = await client.query(`
        SELECT id FROM ${DEMO_SCHEMA}.clients LIMIT 3
      `);

      if (serviceRes.rows.length && clientRes.rows.length) {
        const svc1 = serviceRes.rows[0].id;
        const svc2 = serviceRes.rows[1]?.id ?? svc1;
        const c1 = clientRes.rows[0].id;
        const c2 = clientRes.rows[1]?.id ?? c1;
        const c3 = clientRes.rows[2]?.id ?? c1;

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);

        const d2 = new Date(tomorrow);
        d2.setHours(12, 0, 0, 0);

        const d3 = new Date(tomorrow);
        d3.setHours(14, 30, 0, 0);

        await client.query(`
          INSERT INTO ${DEMO_SCHEMA}.appointments
            (client_id, staff_id, service_id, start_at, end_at, status, price, booked_by)
          VALUES
            ($1, $2, $3, $4, $4 + INTERVAL '30 min', 'confirmed', 25, 'client'),
            ($5, $2, $6, $7, $7 + INTERVAL '2 hours', 'pending', 85, 'client'),
            ($8, $2, $3, $9, $9 + INTERVAL '30 min', 'confirmed', 25, 'staff')
          ON CONFLICT DO NOTHING
        `, [c1, elenaId, svc1, tomorrow, c2, svc2, d2, c3, d3]);

        console.log('✅ Sample appointments created (3)');
      }
    }

    await client.query('COMMIT');
    console.log('\n🎉 Seed complete!');
    console.log('─────────────────────────────────────────');
    console.log('🌐 Booking: http://demo-business.localhost:3000');
    console.log('   (Добави "127.0.0.1 demo-business.localhost" в /etc/hosts)');
    console.log('🔐 Admin:   http://demo-business.localhost:3000/admin');
    console.log(`   Email:    ${DEMO_OWNER_EMAIL}`);
    console.log('   Парола:   demo123');
    console.log('─────────────────────────────────────────\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
