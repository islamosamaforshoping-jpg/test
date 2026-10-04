import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { registerAcademicRoutes } from '../server/academic.js';

const subject = { id: 8, name: 'Physics', level_id: 2, level_name: 'Year 2', doctor_id: 70 };
const material = {
  id: 41, subject_id: subject.id, level_id: subject.level_id, title: 'Chapter 3',
  file_name: 'notes.pdf', content_type: 'application/pdf', file_size: 500,
  storage_key: 'materials/2/8/file', subject_name: subject.name
};
const exam = {
  id: 31, doctor_id: 70, title: 'Midterm Quiz', description: '', duration_minutes: 30,
  question_count: 10, status: 'published', level_id: subject.level_id, share_token: 'legacy-share-token-12345678901234567890',
  subject_name: subject.name, lecture_title: 'Lecture 4', level_name: subject.level_name,
  group_id: 20, lecture_date: '2026-10-01', lecture_status: 'scheduled'
};

function createDatabase() {
  return {
    async query(sql, params = []) {
      if (sql.includes('FROM course_materials m JOIN subjects s') && sql.includes('WHERE m.id=? AND m.level_id=?')) {
        return { rows: material.id === params[0] && material.level_id === params[1] ? [{ ...material }] : [] };
      }
      if (sql.includes('FROM course_materials m JOIN subjects s') && sql.includes('WHERE m.id=?')) {
        return { rows: material.id === params[0] ? [{ ...material }] : [] };
      }
      if (sql.includes('FROM students WHERE user_id=?')) {
        const levelId = params[0] === 202 ? 2 : 3;
        return { rows: [{ id: params[0], user_id: params[0], level_id: levelId, active: 1, cancelled_at: null }] };
      }
      if (sql.includes("AND e.status='published'")) {
        return { rows: exam.id === params[0] ? [{ ...exam }] : [] };
      }
      if (sql.includes('FROM exams e JOIN course_lectures cl') && sql.includes('WHERE e.id=?')) {
        return { rows: exam.id === params[0] ? [{ ...exam }] : [] };
      }
      if (sql.includes('FROM enrollments WHERE student_id=? AND group_id=?')) {
        const enrolled = params[0] === 202 && params[1] === 20;
        return { rows: enrolled ? [{ id: 90 }] : [] };
      }
      if (sql.includes('FROM exam_attempts WHERE exam_id=? AND student_id=?')) return { rows: [] };
      throw new Error(`Unexpected test query: ${sql}`);
    }
  };
}

async function startTestServer() {
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers['x-role'];
    req.user = role === 'doctor'
      ? { id: 70, role: 'doctor', name: 'Doctor' }
      : { id: Number(req.headers['x-user-id']), role: role === 'assistant' ? 'assistant' : 'student', name: 'Student' };
    next();
  });
  registerAcademicRoutes(app, createDatabase());
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  return {
    server,
    base: `http://127.0.0.1:${server.address().port}`
  };
}

test('exam and library shares use readable slugs plus short IDs, with access checks preserved', async () => {
  const { server, base } = await startTestServer();
  try {
    const examShare = await fetch(`${base}/api/academic/exams/31/share`, { headers: { 'x-role': 'doctor' } });
    assert.equal(examShare.status, 200);
    assert.equal((await examShare.json()).path, '/exam/physics-midterm-quiz-lecture-4-31');

    const eligibleExam = await fetch(`${base}/api/student/exams/link/31`, { headers: { 'x-user-id': '202' } });
    assert.equal(eligibleExam.status, 200, await eligibleExam.clone().text());
    assert.equal((await eligibleExam.json()).title, exam.title);
    const otherLevelExam = await fetch(`${base}/api/student/exams/link/31`, { headers: { 'x-user-id': '303' } });
    assert.equal(otherLevelExam.status, 403);

    const doctorLibraryShare = await fetch(`${base}/api/library/share/41`, { headers: { 'x-role': 'doctor' } });
    assert.equal((await doctorLibraryShare.json()).path, '/library/physics-chapter-3-41');
    const studentLibraryShare = await fetch(`${base}/api/library/share/41`, { headers: { 'x-user-id': '202' } });
    assert.equal(studentLibraryShare.status, 200);
    const otherLevelLibraryShare = await fetch(`${base}/api/library/share/41`, { headers: { 'x-user-id': '303' } });
    assert.equal(otherLevelLibraryShare.status, 404);
    const assistantLibraryShare = await fetch(`${base}/api/library/share/41`, { headers: { 'x-user-id': '404', 'x-role': 'assistant' } });
    assert.equal(assistantLibraryShare.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
