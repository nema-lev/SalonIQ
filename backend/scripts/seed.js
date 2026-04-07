#!/usr/bin/env node
/**
 * SalonIQ — Seed скрипт за тестови данни
 *
 * Създава примерен салон "Салон Аврора" с:
 * - 3 услуги, 2 служители
 * - 5 тест клиента
 * - 10 примерни резервации
 *
 * Използване:
 *   cd backend
 *   node scripts/seed.js
 *
 * Изисква: DATABASE_URL в .env, PostgreSQL да е достъпен
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_URL = process.env.DATABASE_URL || 'postgresql://saloniq_user:dev_password@localhost:5432/saloniq_db';

async function seed() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('✅ Connected to PostgreSQL');

  try {
    // ─── 1. Tenant ────────────────────────────────────────────────────
    console.log('\n📦 Creating tenant...');
    await client.query(`
      INSERT INTO public.tenants (
        slug, schema_name, business_name, business_type,
        description, address, city, phone, email,
        telegram_bot_token, telegram_chat_id,
        theme_config, working_hours,
        requires_confirmation, cancellation_hours,
        min_advance_booking_hours, max_advance_booking_days,
        plan, plan_status, is_active
      ) VALUES (
        'salon-aurora',
        'tenant_salon_aurora',
        'Салон Аврора',
        'SALON',
        'Вашият любим салон за красота в центъра на София',
        'ул. Витоша 42',
        'София',
        '+359 888 100 200',
        'salon.aurora@test.bg',
        'TEST_BOT_TOKEN_REPLACE_ME',
        'TEST_CHAT_ID_REPLACE_ME',
        '{"primaryColor": "#7c3aed", "secondaryColor": "#a855f7", "accentColor": "#f59e0b", "borderRadius": "rounded"}',
        '{"mon":{"open":"09:00","close":"18:00","isOpen":true},"tue":{"open":"09:00","close":"18:00","isOpen":true},"wed":{"open":"09:00","close":"18:00","isOpen":true},"thu":{"open":"10:00","close":"19:00","isOpen":true},"fri":{"open":"09:00","close":"17:00","isOpen":true},"sat":{"open":"10:00","close":"15:00","isOpen":true},"sun":{"open":"00:00","close":"00:00","isOpen":false}}',
        false, 24, 1, 60,
        'BASIC', 'TRIAL', true
      )
      ON CONFLICT (slug) DO UPDATE SET updated_at = NOW()
      RETURNING id
    `);

    const tenantRes = await client.query(`SELECT id FROM public.tenants WHERE slug = 'salon-aurora'`);
    const tenantId = tenantRes.rows[0].id;
    console.log(`   Tenant ID: ${tenantId}`);

    // ─── 2. Owner account ─────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('admin123', 12);
    await client.query(`
      INSERT INTO public.tenant_owners (tenant_id, name, email, password_hash, role)
      VALUES ($1, 'Елена Петрова', 'admin@salon-aurora.bg', $2, 'OWNER')
      ON CONFLICT (email) DO NOTHING
    `, [tenantId, passwordHash]);
    console.log('   Owner: admin@salon-aurora.bg / admin123');

    // ─── 3. Tenant schema ─────────────────────────────────────────────
    console.log('\n🏗️  Creating tenant schema...');
    await client.query(`SELECT create_tenant_schema('tenant_salon_aurora')`);
    console.log('   Schema: tenant_salon_aurora ✓');

    // ─── 4. Staff ─────────────────────────────────────────────────────
    console.log('\n👤 Creating staff...');
    await client.query(`SET search_path TO tenant_salon_aurora, public`);

    const staff1Res = await client.query(`
      INSERT INTO staff (name, role, color, bio, specialties, working_hours, is_active, accepts_online)
      VALUES (
        'Елена Петрова', 'owner', '#7c3aed',
        'Старши стилист с над 10 години опит. Специализирана в боядисване и сложни прически.',
        ARRAY['Боядисване', 'Балаж', 'Прически'],
        '{"mon":{"open":"09:00","close":"18:00","isOpen":true},"tue":{"open":"09:00","close":"18:00","isOpen":true},"wed":{"open":"09:00","close":"18:00","isOpen":true},"thu":{"open":"10:00","close":"19:00","isOpen":true},"fri":{"open":"09:00","close":"17:00","isOpen":true},"sat":{"open":"10:00","close":"15:00","isOpen":true},"sun":{"open":"00:00","close":"00:00","isOpen":false}}',
        true, true
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const staff2Res = await client.query(`
      INSERT INTO staff (name, role, color, bio, specialties, working_hours, is_active, accepts_online)
      VALUES (
        'Мария Стоянова', 'employee', '#ec4899',
        'Специалист по маникюр и педикюр. Обича да работи с гел и акрил.',
        ARRAY['Маникюр', 'Педикюр', 'Гел нокти'],
        '{"mon":{"open":"10:00","close":"18:00","isOpen":true},"tue":{"open":"10:00","close":"18:00","isOpen":true},"wed":{"open":"00:00","close":"00:00","isOpen":false},"thu":{"open":"10:00","close":"18:00","isOpen":true},"fri":{"open":"10:00","close":"18:00","isOpen":true},"sat":{"open":"10:00","close":"15:00","isOpen":true},"sun":{"open":"00:00","close":"00:00","isOpen":false}}',
        true, true
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const staff1Id = staff1Res.rows[0]?.id || (await client.query(`SELECT id FROM staff WHERE name='Елена Петрова'`)).rows[0].id;
    const staff2Id = staff2Res.rows[0]?.id || (await client.query(`SELECT id FROM staff WHERE name='Мария Стоянова'`)).rows[0].id;
    console.log(`   Staff: Елена (${staff1Id}), Мария (${staff2Id})`);

    // ─── 5. Services ──────────────────────────────────────────────────
    console.log('\n✂️  Creating services...');
    await client.query(`
      INSERT INTO services (name, category, description, duration_minutes, price, color, staff_ids, is_public, display_order)
      VALUES
        ('Подстригване', 'Коса', 'Класическо подстригване с измиване и сешоар', 45, 30, '#8b5cf6', ARRAY[$1::uuid], true, 1),
        ('Боядисване', 'Коса', 'Пълно боядисване с висококачествени бои', 120, 85, '#7c3aed', ARRAY[$1::uuid], true, 2),
        ('Балаж / Омбре', 'Коса', 'Модерни техники за цветни ефекти', 150, 120, '#6d28d9', ARRAY[$1::uuid], true, 3),
        ('Маникюр', 'Нокти', 'Класически маникюр с лак', 60, 25, '#ec4899', ARRAY[$2::uuid], true, 4),
        ('Педикюр', 'Нокти', 'Педикюр с масаж на ходилата', 75, 35, '#f43f5e', ARRAY[$2::uuid], true, 5),
        ('Гел нокти', 'Нокти', 'UV гел покритие с траен ефект до 3 седмици', 90, 55, '#db2777', ARRAY[$2::uuid], true, 6)
      ON CONFLICT DO NOTHING
    `, [staff1Id, staff2Id]);
    console.log('   6 услуги създадени');

    // ─── 6. Clients ───────────────────────────────────────────────────
    console.log('\n👥 Creating test clients...');
    const clientsData = [
      { name: 'Иванка Димитрова', phone: '+359888111001', email: 'ivanka@test.bg', visits: 5, spent: 250 },
      { name: 'Петя Колева',      phone: '+359888111002', email: null,              visits: 2, spent: 115 },
      { name: 'Диана Тодорова',   phone: '+359888111003', email: 'diana@test.bg',  visits: 8, spent: 430 },
      { name: 'Николай Иванов',   phone: '+359888111004', email: null,              visits: 1, spent: 30  },
      { name: 'Стела Маринова',   phone: '+359888111005', email: 'stela@test.bg',  visits: 3, spent: 165 },
    ];

    const clientIds: string[] = [];
    for (const c of clientsData) {
      const res = await client.query(`
        INSERT INTO clients (name, phone, email, total_visits, total_spent, notifications_consent, consent_given_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [c.name, c.phone, c.email, c.visits, c.spent]);
      const id = res.rows[0]?.id || (await client.query(`SELECT id FROM clients WHERE phone = $1`, [c.phone])).rows[0].id;
      clientIds.push(id);
    }
    console.log(`   ${clientIds.length} клиента създадени`);

    // ─── 7. Sample appointments ───────────────────────────────────────
    console.log('\n📅 Creating sample appointments...');
    const servicesRes = await client.query(`SELECT id, name FROM services ORDER BY display_order`);
    const services = servicesRes.rows;

    const now = new Date();
    const appointments = [
      // Днес
      { clientIdx: 0, staffId: staff1Id, serviceIdx: 0, hoursFromNow: 2,   status: 'confirmed' },
      { clientIdx: 2, staffId: staff1Id, serviceIdx: 1, hoursFromNow: 5,   status: 'confirmed' },
      { clientIdx: 1, staffId: staff2Id, serviceIdx: 3, hoursFromNow: 3,   status: 'pending'   },
      // Утре
      { clientIdx: 3, staffId: staff1Id, serviceIdx: 0, hoursFromNow: 26,  status: 'confirmed' },
      { clientIdx: 4, staffId: staff2Id, serviceIdx: 4, hoursFromNow: 27,  status: 'confirmed' },
      // След 2 дни
      { clientIdx: 0, staffId: staff1Id, serviceIdx: 2, hoursFromNow: 50,  status: 'confirmed' },
      { clientIdx: 1, staffId: staff2Id, serviceIdx: 5, hoursFromNow: 52,  status: 'confirmed' },
      // Минали (завършени)
      { clientIdx: 2, staffId: staff1Id, serviceIdx: 1, hoursFromNow: -48, status: 'completed' },
      { clientIdx: 0, staffId: staff2Id, serviceIdx: 3, hoursFromNow: -72, status: 'completed' },
      { clientIdx: 4, staffId: staff1Id, serviceIdx: 0, hoursFromNow: -24, status: 'no_show'   },
    ];

    for (const appt of appointments) {
      const startAt = new Date(now.getTime() + appt.hoursFromNow * 60 * 60 * 1000);
      // Заоколи до следващия :00 или :30
      startAt.setMinutes(startAt.getMinutes() >= 30 ? 30 : 0, 0, 0);
      const service = services[appt.serviceIdx];
      const endAt = new Date(startAt.getTime() + 60 * 60 * 1000); // +1 час

      await client.query(`
        INSERT INTO appointments (client_id, staff_id, service_id, start_at, end_at, status, booked_by, price)
        VALUES ($1, $2, $3, $4, $5, $6, 'client', 50)
        ON CONFLICT DO NOTHING
      `, [clientIds[appt.clientIdx], appt.staffId, service.id, startAt, endAt, appt.status]);
    }
    console.log(`   ${appointments.length} резервации създадени`);

    // ─── Reset search path ─────────────────────────────────────────────
    await client.query(`SET search_path TO public`);

    console.log('\n🎉 Seed завършен успешно!');
    console.log('\n📋 Данни за тест:');
    console.log('   URL: http://localhost:3000 (с header X-Tenant-Slug: salon-aurora)');
    console.log('   Admin: http://localhost:3000/admin');
    console.log('   Login: admin@salon-aurora.bg / admin123');
    console.log('   Tenant slug: salon-aurora\n');
  } finally {
    await client.end();
  }
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
