/**
 * Seed script — inserts demo admin and student accounts.
 * Idempotent (skips if email already exists).
 *
 *   DATABASE_URL=postgres://... npx ts-node api/db/seed.ts
 */

import { Pool } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@demo.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@1234';
const STUDENT_EMAIL    = process.env.STUDENT_EMAIL    || 'student@demo.com';
const STUDENT_PASSWORD = process.env.STUDENT_PASSWORD || 'Student@1234';

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL required'); process.exit(1); }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    // Admin user
    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const { rows: [admin] } = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, 'admin', TRUE)
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [ADMIN_EMAIL, adminHash]
    );
    await client.query(
      `INSERT INTO admin_profiles (user_id, full_name, admin_id)
       VALUES ($1, 'Demo Admin', 'ADMIN001')
       ON CONFLICT (user_id) DO NOTHING`,
      [admin.id]
    );
    console.log(`✅  Admin:   ${ADMIN_EMAIL}`);

    // Student user
    const stuHash = await bcrypt.hash(STUDENT_PASSWORD, 12);
    const { rows: [student] } = await client.query(
      `INSERT INTO users (email, password_hash, role, is_active)
       VALUES ($1, $2, 'student', TRUE)
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [STUDENT_EMAIL, stuHash]
    );
    await client.query(
      `INSERT INTO student_profiles (user_id, full_name, student_id)
       VALUES ($1, 'Demo Student', 'STU001')
       ON CONFLICT (user_id) DO NOTHING`,
      [student.id]
    );
    console.log(`✅  Student: ${STUDENT_EMAIL}`);

    // Demo exam
    const { rows: [exam] } = await client.query(
      `INSERT INTO exams (title, description, created_by, duration_minutes, status, proctoring_config)
       VALUES (
         'Demo Examination', 'A sample exam to demonstrate the system.',
         $1, 30, 'active',
         '{"warnings_before_disqualification":3,"critical_violation_immediate_disqualification":true}'
       )
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [admin.id]
    );

    if (exam?.id) {
      // Add sample questions
      await client.query(
        `INSERT INTO questions (exam_id, "order", question_type, text, options, correct_answer, marks)
         VALUES
           ($1, 1, 'mcq', 'What does HTML stand for?',
            '["Hyper Text Markup Language","High Text Machine Language","Hyperlinks and Text Markup Language","None of the above"]',
            'Hyper Text Markup Language', 1),
           ($1, 2, 'mcq', 'Which of the following is a JavaScript framework?',
            '["Django","React","Laravel","Flask"]',
            'React', 1),
           ($1, 3, 'short_answer', 'Briefly explain what an API is.', NULL, 'A set of protocols and tools for building software applications.', 2)
         ON CONFLICT DO NOTHING`,
        [exam.id]
      );
      console.log(`✅  Exam:    Demo Examination (id: ${exam.id})`);
    }

    console.log('\n🎉  Seed complete. You can now log in with the demo credentials.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
