/**
 * SalonIQ — Seed Script
 *
 * Създава tenant "Примерен бизнес" с:
 *  - 2 служители
 *  - 6 услуги в 2 категории
 *  - 3 тестови клиента
 *  - 2 резервации (1 потвърдена, 1 чакаща)
 *
 * Изпълнение:
 *   node prisma/seed.js
 * или от package.json:
 *   npm run seed
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const DB_URL = process.env.DATABASE_URL ||
  'postgresql://saloniq_user:dev_password_change_in_prod@localhost:5432/saloniq_db';
const DEMO_SLUG = 'demo-business';
const DEMO_SCHEMA = 'tenant_demo_business';
const DEMO_NAME = 'Примерен бизнес';
const DEMO_INFO_EMAIL = 'info@demo-business.local';
const DEMO_OWNER_EMAIL = 'owner@demo-business.local';
const DEMO_ADMIN_EMAIL = 'admin@demo-business.local';
const DEMO_SECOND_OWNER_EMAIL = 'elena@demo-business.local';

async function seed() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('🌱 Starting seed...');

  try {
    // ─── 1. Tenant ──────────────────────────────────────────────────
    console.log('Creating demo tenant...');
    await client.query(`
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
        'Вашият любим салон за красота в София. Работим с любов към детайла.',
        'ул. Витоша 42',
        'София',
        '+359 888 123 456',
        '${DEMO_INFO_EMAIL}',
        '',
        '',
        '{"primaryColor":"#7c3aed","secondaryColor":"#a855f7","accentColor":"#f59e0b","borderRadius":"rounded"}',
        '{"mon":{"open":"09:00","close":"18:00","isOpen":true},"tue":{"open":"09:00","close":"18:00","isOpen":true},"wed":{"open":"09:00","close":"18:00","isOpen":true},"thu":{"open":"10:00","close":"19:00","isOpen":true},"fri":{"open":"09:00","close":"17:00","isOpen":true},"sat":{"open":"10:00","close":"15:00","isOpen":true},"sun":{"open":"00:00","close":"00:00","isOpen":false}}',
        false, 24, 1, 60,
        'PRO', 'ACTIVE'
      )
      ON CONFLICT (slug) DO UPDATE SET business_name = EXCLUDED.business_name
      RETURNING id
    `);

    const tenantRes = await client.query(
      `SELECT id, schema_name FROM public.tenants WHERE slug = '${DEMO_SLUG}'`
    );
    const tenant = tenantRes.rows[0];
    console.log(`  ✓ Tenant: ${tenant.id}`);

    // ─── 2. Owner акаунт ────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('demo1234', 12);
    await client.query(`
      INSERT INTO public.tenant_owners (tenant_id, name, email, password_hash, role)
      VALUES
        ($1, 'Елена Петрова', '${DEMO_SECOND_OWNER_EMAIL}', $2, 'OWNER'),
        ($1, 'Елена Петрова', '${DEMO_OWNER_EMAIL}', $2, 'OWNER'),
        ($1, 'Елена Петрова', '${DEMO_ADMIN_EMAIL}', $2, 'ADMIN')
      ON CONFLICT (email) DO NOTHING
    `, [tenant.id, passwordHash]);
    console.log(`  ✓ Owners: ${DEMO_SECOND_OWNER_EMAIL} / demo1234, ${DEMO_OWNER_EMAIL} / demo1234, ${DEMO_ADMIN_EMAIL} / demo1234`);

    // ─── 3. Създай tenant schema ─────────────────────────────────────
    await client.query(`SELECT create_tenant_schema($1)`, [tenant.schema_name]);
    console.log(`  ✓ Schema: ${tenant.schema_name}`);

    const schema = tenant.schema_name;
    await client.query(`SET search_path TO ${schema}, public`);

    // ─── 4. Персонал ────────────────────────────────────────────────
    console.log('Creating staff...');
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
      INSERT INTO staff (name, role, color, bio, specialties, working_hours)
      VALUES
        ('Елена Петрова', 'owner', '#7c3aed',
         'Майстор фризьор с 12 години опит. Специалист по боядисване и прически за специални поводи.',
         ARRAY['Боядисване','Прически','Кератин'], $1),
        ('Мария Стоянова', 'employee', '#ec4899',
         'Специалист по маникюр и педикюр. Работи само с висококачествени материали.',
         ARRAY['Маникюр','Педикюр','Гел нокти'], $1)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `, [workingHours]);
    const staff = staffRes.rows;
    console.log(`  ✓ Staff: ${staff.map(s => s.name).join(', ')}`);

    // ─── 5. Услуги ──────────────────────────────────────────────────
    console.log('Creating services...');
    const elena = staff.find(s => s.name === 'Елена Петрова')?.id;
    const maria = staff.find(s => s.name === 'Мария Стоянова')?.id;

    const servicesRes = await client.query(`
      INSERT INTO services (name, description, category, duration_minutes, price, color, staff_ids, display_order)
      VALUES
        ('Подстригване', 'Измиване, подстригване и оформяне', 'Коса', 45, 25.00, '#8b5cf6', ARRAY[$1::uuid], 1),
        ('Боядисване', 'Пълно боядисване с висококачествени продукти', 'Коса', 120, 85.00, '#7c3aed', ARRAY[$1::uuid], 2),
        ('Балеаж', 'Техника за естествено изсветляване', 'Коса', 150, 120.00, '#6d28d9', ARRAY[$1::uuid], 3),
        ('Маникюр', 'Класически маникюр с лак', 'Нокти', 60, 30.00, '#ec4899', ARRAY[$2::uuid], 4),
        ('Гел нокти', 'Изграждане или укрепване с гел', 'Нокти', 90, 55.00, '#db2777', ARRAY[$2::uuid], 5),
        ('Педикюр', 'Класически педикюр с лак', 'Нокти', 75, 35.00, '#be185d', ARRAY[$2::uuid], 6)
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `, [elena, maria]);
    const services = servicesRes.rows;
    console.log(`  ✓ Services: ${services.map(s => s.name).join(', ')}`);

    // ─── 6. Клиенти ─────────────────────────────────────────────────
    console.log('Creating clients...');
    const clientsRes = await client.query(`
      INSERT INTO clients (name, phone, email, notifications_consent, marketing_consent, consent_given_at)
      VALUES
        ('Ивана Георгиева', '+359888111222', 'ivana@example.com', true, true, NOW()),
        ('Петя Николова',   '+359888333444', 'petya@example.com',  true, false, NOW()),
        ('Стела Димитрова', '+359888555666', 'stela@example.com',  true, true, NOW())
      ON CONFLICT (phone) DO NOTHING
      RETURNING id, name
    `);
    const clients = clientsRes.rows;
    console.log(`  ✓ Clients: ${clients.map(c => c.name).join(', ')}`);

    // ─── 7. Тестови резервации ───────────────────────────────────────
    if (clients.length && services.length && staff.length) {
      console.log('Creating test appointments...');

      // Утре в 10:00
      const tomorrow10 = new Date();
      tomorrow10.setDate(tomorrow10.getDate() + 1);
      tomorrow10.setHours(10, 0, 0, 0);
      const tomorrow10End = new Date(tomorrow10);
      tomorrow10End.setMinutes(tomorrow10End.getMinutes() + 45);

      // Утре в 14:00
      const tomorrow14 = new Date(tomorrow10);
      tomorrow14.setHours(14, 0, 0, 0);
      const tomorrow14End = new Date(tomorrow14);
      tomorrow14End.setMinutes(tomorrow14End.getMinutes() + 120);

      // Вдругиден в 11:00
      const dayAfter11 = new Date();
      dayAfter11.setDate(dayAfter11.getDate() + 2);
      dayAfter11.setHours(11, 0, 0, 0);
      const dayAfter11End = new Date(dayAfter11);
      dayAfter11End.setMinutes(dayAfter11End.getMinutes() + 60);

      const hairService = services.find(s => s.name === 'Подстригване')?.id;
      const colorService = services.find(s => s.name === 'Боядисване')?.id;
      const nailService = services.find(s => s.name === 'Маникюр')?.id;

      await client.query(`
        INSERT INTO appointments (
          client_id, staff_id, service_id,
          start_at, end_at, status, price, currency, booked_by
        ) VALUES
          ($1, $2, $3, $4, $5, 'confirmed', 25.00, 'BGN', 'client'),
          ($6, $7, $8, $9, $10, 'pending',   85.00, 'BGN', 'client'),
          ($11, $12, $13, $14, $15, 'confirmed', 30.00, 'BGN', 'staff')
        ON CONFLICT DO NOTHING
      `, [
        clients[0]?.id, elena, hairService,
        tomorrow10.toISOString(), tomorrow10End.toISOString(),
        clients[1]?.id, elena, colorService,
        tomorrow14.toISOString(), tomorrow14End.toISOString(),
        clients[2]?.id, maria, nailService,
        dayAfter11.toISOString(), dayAfter11End.toISOString(),
      ]);
      console.log('  ✓ Appointments: 3 created');
    }

    console.log('');
    console.log('✅ Seed complete!');
    console.log('');
    console.log('Demo данни:');
    console.log(`  🌐 Booking: http://localhost:3000 (с header X-Tenant-Slug: ${DEMO_SLUG})`);
    console.log(`  🔐 Admin login: ${DEMO_SECOND_OWNER_EMAIL} / demo1234`);
    console.log('  📋 Swagger: http://localhost:3001/docs');

  } catch (err) {
    console.error('❌ Seed failed:', err);
    throw err;
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
