import { randomInt, randomUUID } from 'node:crypto';
import { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { audit, token, transaction } from './db.js';
import { formatClockTime, sessionStartsAtUtc } from './session-reminders.js';
import { shareSlug } from './share-links.js';

class AcademicError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const fail = (status, message) => { throw new AcademicError(status, message); };
const integer = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail(400, 'المعرّف غير صحيح');
  return number;
};
const text = (value, name, min = 1, max = 160) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) fail(400, `${name} غير صحيح`);
  return value.trim();
};
const fields = (body, allowed) => {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !allowed.includes(key))) fail(400, 'حقول الطلب غير مسموح بها');
};
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail(400, 'التاريخ غير صحيح');
  return value;
};
const time = value => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail(400, 'الوقت غير صحيح');
  return value;
};
const bool = value => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'].includes(normalized)) return ['true', '1', 'yes', 'on'].includes(normalized);
  }
  fail(400, 'القيمة يجب أن تكون نعم أو لا');
};
const shuffled = values => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};
const integrityStatus = score => score >= 6 ? 'high' : score >= 3 ? 'review' : 'normal';
const LIBRARY_BUCKET = 'stc-course-library';
const MAX_LIBRARY_FILE_SIZE = 20 * 1024 * 1024;
let libraryS3Client;
const libraryStorage = () => {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_ENDPOINT_URL_S3 || !AWS_REGION) {
    fail(503, 'مكتبة المحاضرات غير مهيأة على الخادم؛ يرجى ضبط إعدادات تخزين Neon.');
  }
  if (!libraryS3Client) {
    libraryS3Client = new S3Client({
      endpoint: AWS_ENDPOINT_URL_S3,
      region: AWS_REGION,
      credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
      forcePathStyle: true
    });
  }
  return libraryS3Client;
};
const libraryFileTypes = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png']
};
const validateLibraryFile = ({ file_name, content_type, file_size }) => {
  const name = text(file_name, 'اسم الملف', 1, 240);
  const type = libraryFileTypes[content_type];
  if (!Object.hasOwn(libraryFileTypes, content_type) ||
      !type.includes(name.slice(name.lastIndexOf('.')).toLowerCase())) fail(400, 'يسمح بملفات PDF وJPG وPNG فقط');
  const size = Number(file_size);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_LIBRARY_FILE_SIZE) fail(400, 'حجم الملف يجب ألا يتجاوز 20 ميجابايت');
  return { file_name: name, content_type, file_size: size };
};
const validLibrarySignature = (type, bytes) => {
  if (type === 'application/pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
};
const questionOptions = value => {
  try { return JSON.parse(value); } catch { return []; }
};
const doctorOnly = (req, res, next) => {
  if (!['doctor', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'إدارة المحتوى الأكاديمي متاحة للدكاترة فقط' });
  next();
};
const studentOnly = (req, res, next) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'هذه الصفحة للطلاب فقط' });
  next();
};

export function registerAcademicRoutes(app, db) {
  const librarySubjects = async levelId => await (await db.query(`SELECT s.id,s.name,s.level_id,l.name level_name
    FROM subjects s JOIN levels l ON l.id=s.level_id WHERE s.level_id=? ORDER BY s.name,s.id`, [levelId])).rows;
  const libraryItems = async (where, parameters) => await (await db.query(`SELECT m.id,m.subject_id,m.level_id,m.title,m.description,
      m.file_name,m.content_type,m.file_size,m.created_at,m.uploaded_by,s.name subject_name,COALESCE(u.name,'دكتور سابق') doctor_name
    FROM course_materials m JOIN subjects s ON s.id=m.subject_id
    LEFT JOIN users u ON u.id=m.uploaded_by WHERE ${where}
    ORDER BY m.created_at DESC,m.id DESC`, parameters)).rows;
  const libraryMaterial = async (id, levelId) => {
    const material = await (await db.query(`SELECT m.*,s.name subject_name
      FROM course_materials m JOIN subjects s ON s.id=m.subject_id WHERE m.id=? AND m.level_id=?`, [id, levelId])).rows[0];
    if (!material) fail(404, 'الملف غير موجود في مكتبة هذه الفرقة');
    return material;
  };
  const signedLibraryDownload = async material => {
    const key = material.storage_key;
    const filename = encodeURIComponent(material.file_name).replace(/[!'()*]/g, character =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const disposition = `inline; filename="course-material"; filename*=UTF-8''${filename}`;
    return getSignedUrl(libraryStorage(), new GetObjectCommand({
      Bucket: LIBRARY_BUCKET, Key: key,
      ResponseContentType: material.content_type,
      ResponseContentDisposition: disposition
    }), { expiresIn: 300 });
  };
  const subjectOwned = async (id, doctorId) => {
    const subject = await (await db.query('SELECT * FROM subjects WHERE id=?', [id])).rows[0];
    if (!subject) fail(404, 'المادة غير موجودة');
    if (subject.doctor_id !== doctorId) fail(403, 'لا يمكنك الوصول إلى مادة دكتور آخر');
    return subject;
  };
  const lectureOwned = async (id, doctorId) => {
    const lecture = await (await db.query(`SELECT cl.*,s.name subject_name,l.name level_name,g.name group_name
      FROM course_lectures cl JOIN subjects s ON s.id=cl.subject_id
      JOIN levels l ON l.id=cl.level_id JOIN groups_table g ON g.id=cl.group_id
      WHERE cl.id=?`, [id])).rows[0];
    if (!lecture) fail(404, 'المحاضرة غير موجودة');
    if (lecture.doctor_id !== doctorId) fail(403, 'لا يمكنك الوصول إلى محاضرة دكتور آخر');
    return lecture;
  };
  const examOwned = async (id, doctorId) => {
    const exam = await (await db.query(`SELECT e.*,cl.title lecture_title,s.name subject_name,l.name level_name
      FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id
      JOIN subjects s ON s.id=e.subject_id JOIN levels l ON l.id=e.level_id
      WHERE e.id=?`, [id])).rows[0];
    if (!exam) fail(404, 'الاختبار غير موجود');
    if (exam.doctor_id !== doctorId) fail(403, 'لا يمكنك الوصول إلى اختبار دكتور آخر');
    return exam;
  };
  const enrolledStudentsNotice = async (doctor, groupId, day, title, message, metadata) => await (await db.query(`
    INSERT INTO notifications(student_id,title,message,type,created_by,metadata)
    SELECT DISTINCT s.id,?,?,'GENERAL',?::INTEGER,? FROM students s JOIN enrollments en ON en.student_id=s.id
    WHERE s.active=1 AND s.cancelled_at IS NULL AND en.group_id=?
      AND en.starts_on<=? AND (en.ends_on IS NULL OR en.ends_on>?)
  `, [title, message, doctor.id, JSON.stringify(metadata), groupId, day, day])).changes;
  const studentForUser = async userId => {
    const student = await (await db.query('SELECT id,user_id,level_id,active,cancelled_at FROM students WHERE user_id=?', [userId])).rows[0];
    if (!student || !student.active || student.cancelled_at) fail(404, 'ملف الطالب غير موجود أو غير نشط');
    return student;
  };

  app.get('/api/academic/library', doctorOnly, async (req, res) => {
    const levelId = req.query.level_id ? integer(req.query.level_id) : null;
    const subjectId = req.query.subject_id ? integer(req.query.subject_id) : null;
    if (subjectId && !await (await db.query('SELECT id FROM subjects WHERE id=?', [subjectId])).rows[0]) fail(404, 'المادة غير موجودة');
    const clauses = [], parameters = [];
    if (levelId) { clauses.push('m.level_id=?'); parameters.push(levelId); }
    if (subjectId) { clauses.push('m.subject_id=?'); parameters.push(subjectId); }
    const where = clauses.length ? clauses.join(' AND ') : '1=1';
    const [items, subjects] = await Promise.all([
      libraryItems(where, parameters),
      levelId
        ? librarySubjects(levelId)
        : (async () => await (await db.query(`SELECT s.id,s.name,s.level_id,l.name level_name
            FROM subjects s JOIN levels l ON l.id=s.level_id ORDER BY l.id,s.name,s.id`, [])).rows)()
    ]);
    res.json({ items: items.map(item => ({ ...item, is_mine: item.uploaded_by === req.user.id })), subjects });
  });

  app.post('/api/academic/library/upload-url', doctorOnly, async (req, res) => {
    fields(req.body, ['subject_id', 'title', 'description', 'file_name', 'content_type', 'file_size']);
    const subject = await subjectOwned(integer(req.body.subject_id), req.user.id);
    const title = text(req.body.title, 'عنوان الملف', 2, 160);
    const description = req.body.description === undefined ? '' : text(req.body.description, 'الوصف', 0, 1000);
    const file = validateLibraryFile(req.body);
    const uploadId = randomUUID();
    const key = `materials/${subject.level_id}/${subject.id}/${uploadId}`;
    const signedFields = {
      key,
      'Content-Type': file.content_type,
      'x-amz-meta-upload-id': uploadId,
      'x-amz-meta-doctor-id': String(req.user.id)
    };
    const signedPost = await createPresignedPost(libraryStorage(), {
      Bucket: LIBRARY_BUCKET,
      Key: key,
      Expires: 300,
      Fields: signedFields,
      Conditions: [
        ['content-length-range', file.file_size, file.file_size],
        ['eq', '$Content-Type', file.content_type],
        ['eq', '$x-amz-meta-upload-id', uploadId],
        ['eq', '$x-amz-meta-doctor-id', String(req.user.id)]
      ]
    });
    res.json({ upload_id: uploadId, ...signedPost, subject_id: subject.id, level_id: subject.level_id, title, description, ...file });
  });

  app.post('/api/academic/library/cancel-upload', doctorOnly, async (req, res) => {
    fields(req.body, ['upload_id', 'subject_id']);
    if (typeof req.body.upload_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(req.body.upload_id)) fail(400, 'معرّف الرفع غير صحيح');
    const subject = await subjectOwned(integer(req.body.subject_id), req.user.id);
    const key = `materials/${subject.level_id}/${subject.id}/${req.body.upload_id}`;
    if (await (await db.query('SELECT id FROM course_materials WHERE storage_key=?', [key])).rows[0]) {
      return res.json({ ok: true, retained: true });
    }
    const storage = libraryStorage();
    try {
      const uploaded = await storage.send(new HeadObjectCommand({ Bucket: LIBRARY_BUCKET, Key: key }));
      if (uploaded.Metadata?.['upload-id'] !== req.body.upload_id ||
          uploaded.Metadata?.['doctor-id'] !== String(req.user.id)) fail(403, 'لا يمكنك إلغاء رفع هذا الملف');
      await storage.send(new DeleteObjectCommand({ Bucket: LIBRARY_BUCKET, Key: key }));
    } catch (error) {
      if (error.$metadata?.httpStatusCode !== 404 && error.name !== 'NotFound' && error.name !== 'NoSuchKey') throw error;
    }
    res.json({ ok: true });
  });

  app.post('/api/academic/library/complete', doctorOnly, async (req, res) => {
    fields(req.body, ['upload_id', 'subject_id', 'title', 'description', 'file_name', 'content_type', 'file_size']);
    if (typeof req.body.upload_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(req.body.upload_id)) fail(400, 'معرّف الرفع غير صحيح');
    const subject = await subjectOwned(integer(req.body.subject_id), req.user.id);
    const title = text(req.body.title, 'عنوان الملف', 2, 160);
    const description = req.body.description === undefined ? '' : text(req.body.description, 'الوصف', 0, 1000);
    const file = validateLibraryFile(req.body);
    const key = `materials/${subject.level_id}/${subject.id}/${req.body.upload_id}`;
    const storage = libraryStorage();
    let uploaded;
    try {
      uploaded = await storage.send(new HeadObjectCommand({ Bucket: LIBRARY_BUCKET, Key: key }));
    } catch (error) {
      if (error.$metadata?.httpStatusCode === 404 || error.name === 'NotFound' || error.name === 'NoSuchKey') {
        fail(409, 'لم يصل الملف إلى المخزن بعد؛ أعد رفعه وحاول مجددًا');
      }
      throw error;
    }
    if (uploaded.ContentLength !== file.file_size || uploaded.ContentType !== file.content_type ||
        uploaded.Metadata?.['upload-id'] !== req.body.upload_id ||
        uploaded.Metadata?.['doctor-id'] !== String(req.user.id)) {
      fail(400, 'تعذر التحقق من الملف المرفوع؛ أعد المحاولة');
    }
    const signature = await storage.send(new GetObjectCommand({
      Bucket: LIBRARY_BUCKET, Key: key, Range: 'bytes=0-7'
    }));
    const signatureBytes = Buffer.from(await signature.Body.transformToByteArray());
    if (!validLibrarySignature(file.content_type, signatureBytes)) fail(400, 'محتوى الملف لا يطابق نوعه؛ ارفع PDF أو صورة سليمة');
    const id = await transaction(db, async () => {
      const inserted = await db.query(`INSERT INTO course_materials
        (subject_id,level_id,title,description,file_name,content_type,file_size,storage_key,uploaded_by)
        VALUES(?,?,?,?,?,?,?,?,?)`, [
        subject.id, subject.level_id, title, description, file.file_name, file.content_type,
        file.file_size, key, req.user.id
      ]);
      const materialId = Number(inserted.lastInsertRowid);
      await audit(db, req.user, 'إضافة ملف إلى مكتبة المحاضرات', 'course_material', materialId, {
        title, file_name: file.file_name, subject_id: subject.id, level_id: subject.level_id, file_size: file.file_size
      });
      return materialId;
    });
    res.status(201).json({ id });
  });

  app.get('/api/academic/library/:id/file', doctorOnly, async (req, res) => {
    const material = await (await db.query('SELECT * FROM course_materials WHERE id=?', [integer(req.params.id)])).rows[0];
    if (!material) fail(404, 'الملف غير موجود');
    res.redirect(302, await signedLibraryDownload(material));
  });

  app.get('/api/library/share/:id/file', async (req, res) => {
    const id = integer(req.params.id);
    let material;
    if (req.user.role === 'student') {
      const student = await studentForUser(req.user.id);
      material = await libraryMaterial(id, student.level_id);
    } else if (['doctor', 'admin'].includes(req.user.role)) {
      material = await (await db.query('SELECT * FROM course_materials WHERE id=?', [id])).rows[0];
      if (!material) fail(404, 'الملف غير موجود');
    } else {
      fail(403, 'مشاركة ملفات المكتبة متاحة للدكاترة والطلاب فقط');
    }
    res.redirect(302, await signedLibraryDownload(material));
  });

  app.get('/api/library/share/:id', async (req, res) => {
    const id = integer(req.params.id);
    let material;
    if (req.user.role === 'student') {
      const student = await studentForUser(req.user.id);
      material = await libraryMaterial(id, student.level_id);
    } else if (['doctor', 'admin'].includes(req.user.role)) {
      material = await (await db.query(`SELECT m.*,s.name subject_name
        FROM course_materials m JOIN subjects s ON s.id=m.subject_id WHERE m.id=?`, [id])).rows[0];
      if (!material) fail(404, 'الملف غير موجود');
    } else {
      fail(403, 'مشاركة ملفات المكتبة متاحة للدكاترة والطلاب فقط');
    }
    const path = `/library/${shareSlug(`${material.subject_name}-${material.title}`)}-${material.id}`;
    res.json({ path });
  });

  app.delete('/api/academic/library/:id', doctorOnly, async (req, res) => {
    const id = integer(req.params.id);
    const material = await (await db.query('SELECT * FROM course_materials WHERE id=?', [id])).rows[0];
    if (!material) fail(404, 'الملف غير موجود');
    if (material.uploaded_by !== req.user.id) fail(403, 'يمكنك حذف الملفات التي أضفتها فقط');
    await libraryStorage().send(new DeleteObjectCommand({ Bucket: LIBRARY_BUCKET, Key: material.storage_key }));
    await transaction(db, async () => {
      await db.query('DELETE FROM course_materials WHERE id=? AND uploaded_by=?', [id, req.user.id]);
      await audit(db, req.user, 'حذف ملف من مكتبة المحاضرات', 'course_material', id, {
        title: material.title, file_name: material.file_name, subject_id: material.subject_id, level_id: material.level_id
      });
    });
    res.json({ ok: true });
  });

  app.get('/api/student/library', studentOnly, async (req, res) => {
    const student = await studentForUser(req.user.id);
    const subjectId = req.query.subject_id ? integer(req.query.subject_id) : null;
    if (subjectId && !await (await db.query('SELECT id FROM subjects WHERE id=? AND level_id=?', [subjectId, student.level_id])).rows[0]) {
      fail(404, 'المادة غير موجودة في فرقتك');
    }
    const clauses = ['m.level_id=?'], parameters = [student.level_id];
    if (subjectId) { clauses.push('m.subject_id=?'); parameters.push(subjectId); }
    const [items, subjects] = await Promise.all([
      libraryItems(clauses.join(' AND '), parameters),
      librarySubjects(student.level_id)
    ]);
    res.json({ items: items.map(({ uploaded_by, ...item }) => item), subjects });
  });

  app.get('/api/student/library/:id/file', studentOnly, async (req, res) => {
    const student = await studentForUser(req.user.id);
    const material = await libraryMaterial(integer(req.params.id), student.level_id);
    res.redirect(302, await signedLibraryDownload(material));
  });

  const eligibleExam = async (examId, student) => {
    const exam = await (await db.query(`SELECT e.*,cl.group_id,cl.lecture_date,cl.status lecture_status,cl.title lecture_title,
      s.name subject_name,u.name doctor_name
      FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id
      JOIN subjects s ON s.id=e.subject_id JOIN users u ON u.id=e.doctor_id
      WHERE e.id=? AND e.level_id=? AND cl.status<>'cancelled'`, [examId, student.level_id])).rows[0];
    if (!exam) fail(404, 'الاختبار غير متاح لهذه الفرقة');
    const enrolled = await (await db.query(`SELECT id FROM enrollments WHERE student_id=? AND group_id=?
      AND starts_on<=? AND (ends_on IS NULL OR ends_on>?)`, [student.id, exam.group_id, exam.lecture_date, exam.lecture_date])).rows[0];
    if (!enrolled) fail(403, 'هذا الاختبار غير مخصص لمجموعتك');
    return exam;
  };
  const attemptForStudent = async (attemptId, studentId) => {
    const existing=await (await db.query('SELECT id,student_id FROM exam_attempts WHERE id=?', [attemptId])).rows[0];
    if(!existing) fail(404,'المحاولة غير موجودة');
    if(existing.student_id!==studentId) fail(403,'لا يمكنك الوصول إلى محاولة طالب آخر');
    const attempt=await (await db.query(`SELECT a.*,e.title exam_title,e.description exam_description,e.duration_minutes,
      s.name subject_name,cl.title lecture_title,cl.group_id,
      (SELECT COUNT(*) FROM exam_integrity_events ie WHERE ie.attempt_id=a.id AND ie.event_type IN ('TAB_HIDDEN','PAGE_BLUR','PAGE_HIDE')) leave_count
      FROM exam_attempts a JOIN exams e ON e.id=a.exam_id
      JOIN subjects s ON s.id=e.subject_id JOIN course_lectures cl ON cl.id=e.lecture_id
      WHERE a.id=?`, [attemptId])).rows[0];
    if (!attempt) fail(404, 'المحاولة غير موجودة');
    return attempt;
  };
  const finishAttempt = async (attemptId, studentId, now = Date.now()) => await transaction(db, async () => {
    const attempt = await attemptForStudent(attemptId, studentId);
    if (attempt.status !== 'in_progress') return attempt;
    const questions = await (await db.query('SELECT question_id,correct_answer FROM exam_attempt_questions WHERE attempt_id=? ORDER BY position', [attemptId])).rows;
    const answers = new Map(await (await db.query('SELECT question_id,selected_answer FROM exam_answers WHERE attempt_id=?', [attemptId])).rows.map(answer => [answer.question_id,answer.selected_answer]));
    const correct = questions.reduce((total, question) => total + Number(answers.get(question.question_id) === question.correct_answer), 0);
    const elapsed = Math.max(0,Math.floor((now-Date.parse(attempt.started_at))/1000));
    const timedOut = elapsed >= attempt.duration_minutes*60;
    const durationSeconds = Math.min(elapsed,attempt.duration_minutes*60);
    const status = timedOut ? 'timed_out' : 'submitted';
    await db.query(`UPDATE exam_answers SET is_correct=CASE WHEN selected_answer=(
      SELECT correct_answer FROM exam_attempt_questions WHERE attempt_id=? AND question_id=exam_answers.question_id
    ) THEN 1 ELSE 0 END WHERE attempt_id=?`, [attemptId, attemptId]);
    await db.query(`UPDATE exam_attempts SET submitted_at=?,duration_seconds=?,score=?,percentage=?,correct_answers=?,
      wrong_answers=?,status=? WHERE id=? AND student_id=? AND status='in_progress'`, [new Date(now).toISOString(), durationSeconds, correct, questions.length?correct*100/questions.length:0, correct, questions.length-correct, status, attemptId, studentId]);
    return await attemptForStudent(attemptId,studentId);
  });
  const attemptPayload = async (attempt, includeQuestions = true) => {
    const startedMs = Date.parse(attempt.started_at), expiresAt = new Date(startedMs + attempt.duration_minutes*60000).toISOString();
    const base = { id:attempt.id,exam_id:attempt.exam_id,exam_title:attempt.exam_title,subject_name:attempt.subject_name,
      lecture_title:attempt.lecture_title,started_at:attempt.started_at,expires_at:expiresAt,duration_minutes:attempt.duration_minutes,
      status:attempt.status,submitted_at:attempt.submitted_at,duration_seconds:attempt.duration_seconds,score:attempt.score,
      percentage:attempt.percentage,correct_answers:attempt.correct_answers,wrong_answers:attempt.wrong_answers,
      total_questions:attempt.total_questions,leave_count:attempt.leave_count };
    if (includeQuestions) base.questions = await (await db.query(`SELECT q.question_id,q.position,q.question_text,q.question_type,q.options_json,a.selected_answer
      FROM exam_attempt_questions q LEFT JOIN exam_answers a ON a.attempt_id=q.attempt_id AND a.question_id=q.question_id
      WHERE q.attempt_id=? ORDER BY q.position`, [attempt.id])).rows.map(question => ({
        id:question.question_id,position:question.position,text:question.question_text,type:question.question_type,
        options:questionOptions(question.options_json),selected_answer:question.selected_answer
      }));
    return base;
  };

  app.get('/api/academic/dashboard', doctorOnly, async (req, res) => {
    const doctorId = req.user.id;
    const subjects = await (await db.query('SELECT COUNT(*) count FROM subjects WHERE doctor_id=?', [doctorId])).rows[0].count;
    const lectures = await (await db.query('SELECT COUNT(*) count FROM course_lectures WHERE doctor_id=?', [doctorId])).rows[0].count;
    const exams = await (await db.query('SELECT COUNT(*) count FROM exams WHERE doctor_id=?', [doctorId])).rows[0].count;
    const taken = await (await db.query(`SELECT COUNT(DISTINCT a.student_id) count FROM exam_attempts a JOIN exams e ON e.id=a.exam_id
      WHERE e.doctor_id=? AND a.status IN ('submitted','timed_out')`, [doctorId])).rows[0].count;
    const missing = await (await db.query(`SELECT COUNT(DISTINCT s.id) count FROM students s
      WHERE s.active=1 AND s.cancelled_at IS NULL AND EXISTS(
        SELECT 1 FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id
        JOIN enrollments en ON en.student_id=s.id AND en.group_id=cl.group_id
          AND en.starts_on<=cl.lecture_date AND (en.ends_on IS NULL OR en.ends_on>cl.lecture_date)
        WHERE e.doctor_id=? AND e.status='published' AND e.level_id=s.level_id
          AND NOT EXISTS(SELECT 1 FROM exam_attempts a WHERE a.exam_id=e.id AND a.student_id=s.id)
      )`, [doctorId])).rows[0].count;
    res.json({ subjects, lectures, exams, students_completed: taken, students_not_taken: missing });
  });

  app.get('/api/academic/subjects', doctorOnly, async (req, res) => {
    const page = Math.max(1, integer(req.query.page || 1));
    const size = Math.min(100, Math.max(1, integer(req.query.size || 50)));
    const values = [req.user.id];
    let where = 'WHERE s.doctor_id=?';
    if (req.query.level_id) { where += ' AND s.level_id=?'; values.push(integer(req.query.level_id)); }
    const items = await (await db.query(`SELECT s.*,l.name level_name,
      (SELECT COUNT(*) FROM course_lectures cl WHERE cl.subject_id=s.id AND cl.doctor_id=s.doctor_id) lecture_count
      FROM subjects s JOIN levels l ON l.id=s.level_id ${where}
      ORDER BY s.updated_at DESC,s.id DESC LIMIT ? OFFSET ?`, [...values, size, (page - 1) * size])).rows;
    const total = await (await db.query(`SELECT COUNT(*) count FROM subjects s ${where}`, [...values])).rows[0].count;
    res.json({ items, total, page, size });
  });

  app.post('/api/academic/subjects', doctorOnly, async (req, res) => {
    fields(req.body, ['name', 'level_id']);
    const name = text(req.body.name, 'اسم المادة', 2, 120), levelId = integer(req.body.level_id);
    if (!await (await db.query('SELECT id FROM levels WHERE id=?', [levelId])).rows[0]) fail(400, 'الفرقة غير موجودة');
    const id = await transaction(db, async () => {
      const result = await db.query('INSERT INTO subjects(doctor_id,level_id,name) VALUES(?,?,?)', [req.user.id, levelId, name]);
      const subjectId = Number(result.lastInsertRowid);
      await audit(db, req.user, 'إضافة مادة', 'subject', subjectId, { name, level_id: levelId });
      return subjectId;
    });
    res.status(201).json(await (await db.query(`SELECT s.*,l.name level_name FROM subjects s JOIN levels l ON l.id=s.level_id WHERE s.id=? AND s.doctor_id=?`, [id, req.user.id])).rows[0]);
  });

  app.patch('/api/academic/subjects/:id', doctorOnly, async (req, res) => {
    fields(req.body, ['name', 'level_id']);
    const subject = await subjectOwned(integer(req.params.id), req.user.id);
    const name = req.body.name === undefined ? subject.name : text(req.body.name, 'اسم المادة', 2, 120);
    const levelId = req.body.level_id === undefined ? subject.level_id : integer(req.body.level_id);
    if (!await (await db.query('SELECT id FROM levels WHERE id=?', [levelId])).rows[0]) fail(400, 'الفرقة غير موجودة');
    if (levelId !== subject.level_id && await (await db.query('SELECT id FROM course_lectures WHERE subject_id=? LIMIT 1', [subject.id])).rows[0]) fail(409, 'لا يمكن تغيير فرقة مادة لها محاضرات');
    await db.query(`UPDATE subjects SET name=?,level_id=?,updated_at=to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE id=? AND doctor_id=?`, [name, levelId, subject.id, req.user.id]);
    await audit(db, req.user, 'تعديل مادة', 'subject', subject.id, { before: subject.name, after: name, level_id: levelId });
    res.json({ ok: true });
  });

  app.delete('/api/academic/subjects/:id', doctorOnly, async (req, res) => {
    const subject = await subjectOwned(integer(req.params.id), req.user.id);
    if (await (await db.query('SELECT id FROM course_lectures WHERE subject_id=? LIMIT 1', [subject.id])).rows[0]) fail(409, 'لا يمكن حذف مادة لها محاضرات');
    await transaction(db, async () => {
      await db.query('DELETE FROM subjects WHERE id=? AND doctor_id=?', [subject.id, req.user.id]);
      await audit(db, req.user, 'حذف مادة', 'subject', subject.id, { name: subject.name });
    });
    res.json({ ok: true });
  });

  app.get('/api/academic/lectures', doctorOnly, async (req, res) => {
    const page = Math.max(1, integer(req.query.page || 1)), size = Math.min(100, Math.max(1, integer(req.query.size || 20)));
    const clauses = ['cl.doctor_id=?'], args = [req.user.id];
    for (const [key, column] of [['subject_id','cl.subject_id'],['level_id','cl.level_id'],['group_id','cl.group_id']]) {
      if (req.query[key]) { clauses.push(`${column}=?`); args.push(integer(req.query[key])); }
    }
    if (req.query.q) {
      const query = text(req.query.q, 'البحث', 1, 100).replace(/[!%_]/g, '!$&');
      clauses.push(`(cl.title ILIKE ? ESCAPE '!' OR cl.topic ILIKE ? ESCAPE '!' OR s.name ILIKE ? ESCAPE '!')`);
      args.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;
    const items = await (await db.query(`SELECT cl.*,s.name subject_name,l.name level_name,g.name group_name,
      (SELECT COUNT(*) FROM exams e WHERE e.lecture_id=cl.id AND e.doctor_id=cl.doctor_id) exam_count
      FROM course_lectures cl JOIN subjects s ON s.id=cl.subject_id JOIN levels l ON l.id=cl.level_id
      JOIN groups_table g ON g.id=cl.group_id ${where} ORDER BY cl.lecture_date DESC,cl.id DESC LIMIT ? OFFSET ?`, [...args, size, (page-1)*size])).rows;
    const total = await (await db.query(`SELECT COUNT(*) count FROM course_lectures cl JOIN subjects s ON s.id=cl.subject_id ${where}`, [...args])).rows[0].count;
    res.json({ items, total, page, size });
  });

  app.post('/api/academic/lectures', doctorOnly, async (req, res) => {
    fields(req.body, ['subject_id','group_id','title','topic','date','start_time','end_time','status']);
    const subject = await subjectOwned(integer(req.body.subject_id), req.user.id);
    const groupId = integer(req.body.group_id), group = await (await db.query('SELECT * FROM groups_table WHERE id=?', [groupId])).rows[0];
    if (!group || group.level_id !== subject.level_id) fail(400, 'المجموعة لا تتبع فرقة المادة');
    const title = text(req.body.title, 'عنوان المحاضرة', 2, 160), topic = req.body.topic === undefined ? '' : text(req.body.topic, 'الموضوع', 0, 2000);
    const lectureDate = date(req.body.date), startTime = time(req.body.start_time), endTime = time(req.body.end_time);
    if (startTime && endTime && endTime <= startTime) fail(400, 'وقت النهاية يجب أن يكون بعد البداية');
    const status = req.body.status === undefined ? 'scheduled' : req.body.status;
    if (!['scheduled','started','completed','cancelled'].includes(status)) fail(400, 'حالة المحاضرة غير صحيحة');
    const id = await transaction(db, async () => {
      let session = await (await db.query('SELECT * FROM course_sessions WHERE group_id=? AND date=?', [groupId, lectureDate])).rows[0];
      if (session && await (await db.query('SELECT id FROM course_lectures WHERE course_session_id=?', [session.id])).rows[0]) fail(409, 'توجد محاضرة أكاديمية مسجلة للمجموعة في هذا اليوم');
      if (!session) {
        const sessionId = Number(await (await db.query(`INSERT INTO course_sessions(group_id,date,title,start_time,end_time,starts_at_utc,cancelled)
          VALUES(?,?,?,?,?,?,?)`, [groupId, lectureDate, title, startTime, endTime, sessionStartsAtUtc(lectureDate,startTime), status === 'cancelled' ? 1 : 0])).lastInsertRowid);
        session = { id: sessionId };
      } else {
        const attended = Boolean(await (await db.query('SELECT id FROM attendance WHERE session_id=? LIMIT 1', [session.id])).rows[0]);
        if (attended && (session.title !== title || session.start_time !== startTime || session.end_time !== endTime || Boolean(session.cancelled) !== (status === 'cancelled'))) {
          fail(409, 'الجلسة الحالية لها سجلات حضور وتختلف عن بيانات المحاضرة الأكاديمية');
        }
        if (!attended) await db.query(`UPDATE course_sessions SET title=?,start_time=?,end_time=?,starts_at_utc=?,cancelled=? WHERE id=?`, [title, startTime, endTime, sessionStartsAtUtc(lectureDate,startTime), status==='cancelled'?1:0, session.id]);
      }
      const lectureId = Number(await (await db.query(`INSERT INTO course_lectures(doctor_id,subject_id,level_id,group_id,course_session_id,title,topic,lecture_date,start_time,end_time,status)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`, [req.user.id, subject.id, subject.level_id, groupId, session.id, title, topic, lectureDate, startTime, endTime, status])).lastInsertRowid);
      if (status !== 'cancelled') await enrolledStudentsNotice(req.user,groupId,lectureDate,'موعد محاضرة جديدة',
        `تم تحديد محاضرة ${title} في مادة ${subject.name} بتاريخ ${lectureDate}${startTime ? ` الساعة ${formatClockTime(startTime)}` : ''}.`,
        { lecture_id: lectureId, course_session_id: session.id });
      await audit(db,req.user,'إضافة محاضرة أكاديمية','lecture',lectureId,
        { title,topic,subject:subject.name,level_id:subject.level_id,group_id:groupId,date:lectureDate,start_time:startTime,end_time:endTime });
      return lectureId;
    });
    res.status(201).json(await lectureOwned(id,req.user.id));
  });

  app.get('/api/academic/lectures/:lectureId/exams', doctorOnly, async (req,res) => {
    const lecture = await lectureOwned(integer(req.params.lectureId),req.user.id);
    const items = await (await db.query(`SELECT e.*,COUNT(DISTINCT q.id) question_pool_size,
      COUNT(DISTINCT a.id) attempt_count,AVG(CASE WHEN a.status IN ('submitted','timed_out') THEN a.percentage END) average_percentage
      FROM exams e LEFT JOIN exam_questions q ON q.exam_id=e.id LEFT JOIN exam_attempts a ON a.exam_id=e.id
      WHERE e.lecture_id=? AND e.doctor_id=? GROUP BY e.id ORDER BY e.updated_at DESC,e.id DESC`, [lecture.id, req.user.id])).rows;
    res.json({items});
  });

  app.get('/api/academic/exams', doctorOnly, async (req,res) => {
    const page=Math.max(1,integer(req.query.page||1)),size=Math.min(100,Math.max(1,integer(req.query.size||20)));
    const clauses=['e.doctor_id=?'],args=[req.user.id];
    if(req.query.status){ if(!['draft','published','closed'].includes(req.query.status)) fail(400,'حالة الاختبار غير صحيحة'); clauses.push('e.status=?'); args.push(req.query.status); }
    if(req.query.q){ const q=text(req.query.q,'البحث',1,100).replace(/[!%_]/g,'!$&'); clauses.push("(e.title ILIKE ? ESCAPE '!' OR s.name ILIKE ? ESCAPE '!' OR cl.title ILIKE ? ESCAPE '!')"); args.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    const where=`WHERE ${clauses.join(' AND ')}`;
    const items=await (await db.query(`SELECT e.*,s.name subject_name,cl.title lecture_title,l.name level_name,
      (SELECT COUNT(*) FROM exam_questions q WHERE q.exam_id=e.id) question_pool_size,
      (SELECT COUNT(*) FROM exam_attempts a WHERE a.exam_id=e.id AND a.status IN ('submitted','timed_out')) attempt_count,
      (SELECT AVG(a.percentage) FROM exam_attempts a WHERE a.exam_id=e.id AND a.status IN ('submitted','timed_out')) average_percentage
      FROM exams e JOIN subjects s ON s.id=e.subject_id JOIN course_lectures cl ON cl.id=e.lecture_id
      JOIN levels l ON l.id=e.level_id ${where} ORDER BY e.updated_at DESC,e.id DESC LIMIT ? OFFSET ?`, [...args, size, (page-1)*size])).rows;
    const total=await (await db.query(`SELECT COUNT(*) count FROM exams e JOIN subjects s ON s.id=e.subject_id JOIN course_lectures cl ON cl.id=e.lecture_id ${where}`, [...args])).rows[0].count;
    res.json({items,total,page,size});
  });

  app.post('/api/academic/lectures/:lectureId/exams', doctorOnly, async (req,res) => {
    fields(req.body,['title','description','duration_minutes','question_count','status']);
    const lecture=await lectureOwned(integer(req.params.lectureId),req.user.id);
    const title=text(req.body.title,'اسم الاختبار',2,160);
    const description=req.body.description===undefined?'':text(req.body.description,'وصف الاختبار',0,4000);
    const duration=integer(req.body.duration_minutes),count=integer(req.body.question_count),status=req.body.status||'draft';
    if(duration>600||count>500||!['draft','published','closed'].includes(status)) fail(400,'إعدادات الاختبار غير صحيحة');
    if(status!=='draft') fail(409,'أنشئ الاختبار كمسودة، أضف الأسئلة، ثم انشره');
    const id=await transaction(db,async ()=>{
      const examId=Number(await (await db.query(`INSERT INTO exams(doctor_id,lecture_id,subject_id,level_id,title,description,duration_minutes,question_count,status,share_token)
        VALUES(?,?,?,?,?,?,?,?,?,?)`, [req.user.id, lecture.id, lecture.subject_id, lecture.level_id, title, description, duration, count, 'draft', token()])).lastInsertRowid);
      await audit(db,req.user,'إنشاء اختبار','exam',examId,{title,lecture:lecture.title});
      return examId;
    });
    res.status(201).json(await examOwned(id,req.user.id));
  });

  app.patch('/api/academic/exams/:id',doctorOnly,async (req,res)=>{
    fields(req.body,['title','description','duration_minutes','question_count','status']);
    const exam=await examOwned(integer(req.params.id),req.user.id);
    const title=req.body.title===undefined?exam.title:text(req.body.title,'اسم الاختبار',2,160);
    const description=req.body.description===undefined?exam.description:text(req.body.description,'وصف الاختبار',0,4000);
    const duration=req.body.duration_minutes===undefined?exam.duration_minutes:integer(req.body.duration_minutes);
    const count=req.body.question_count===undefined?exam.question_count:integer(req.body.question_count);
    const status=req.body.status===undefined?exam.status:req.body.status;
    if(duration>600||count>500||!['draft','published','closed'].includes(status)) fail(400,'إعدادات الاختبار غير صحيحة');
    if(exam.status!=='draft'&&(title!==exam.title||description!==exam.description||duration!==exam.duration_minutes||count!==exam.question_count)) fail(409,'أغلق الاختبار ثم أنشئ اختبارًا جديدًا لتغيير أسئلته أو مدته');
    if(status==='published'&&await (await db.query('SELECT COUNT(*) count FROM exam_questions WHERE exam_id=?', [exam.id])).rows[0].count<count) fail(409,'عدد الأسئلة في المخزون أقل من عدد الأسئلة المطلوبة');
    await db.query(`UPDATE exams SET title=?,description=?,duration_minutes=?,question_count=?,status=?,updated_at=to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE id=? AND doctor_id=?`, [title, description, duration, count, status, exam.id, req.user.id]);
    await audit(db,req.user,status!==exam.status?`تغيير حالة الاختبار إلى ${status}`:'تعديل إعدادات اختبار','exam',exam.id,{title,status,duration_minutes:duration,question_count:count});
    if(status==='published'&&exam.status!=='published'){
      const lecture=await lectureOwned(exam.lecture_id,req.user.id);
      await enrolledStudentsNotice(req.user,lecture.group_id,lecture.lecture_date,'اختبار جديد',
        `تم نشر اختبار جديد في مادة ${exam.subject_name}: ${title}.`,{exam_id:exam.id,share_token:exam.share_token});
    }
    res.json(await examOwned(exam.id,req.user.id));
  });

  app.get('/api/academic/exams/:id/questions',doctorOnly,async (req,res)=>{
    const exam=await examOwned(integer(req.params.id),req.user.id);
    const items=await (await db.query('SELECT * FROM exam_questions WHERE exam_id=? ORDER BY sort_order,id', [exam.id])).rows
      .map(question=>({...question,options:questionOptions(question.options_json)}));
    res.json({items,question_count:exam.question_count,status:exam.status});
  });

  app.post('/api/academic/exams/:id/questions',doctorOnly,async (req,res)=>{
    fields(req.body,['question_text','question_type','options','correct_answer']);
    const exam=await examOwned(integer(req.params.id),req.user.id);
    if(exam.status!=='draft') fail(409,'لا يمكن تعديل مخزون اختبار منشور أو مغلق');
    const questionText=text(req.body.question_text,'نص السؤال',1,4000),type=req.body.question_type;
    if(!['multiple_choice','true_false'].includes(type)) fail(400,'نوع السؤال غير مدعوم');
    let options,correct;
    if(type==='multiple_choice'){
      if(!Array.isArray(req.body.options)||req.body.options.length<2||req.body.options.length>8) fail(400,'يجب إدخال خيارين إلى ثمانية خيارات');
      const labels=req.body.options.map((option,index)=>text(option,`الخيار ${index+1}`,1,500));
      if(new Set(labels).size!==labels.length) fail(400,'لا يمكن تكرار الاختيارات');
      if(!Number.isSafeInteger(req.body.correct_answer)||req.body.correct_answer<0||req.body.correct_answer>=labels.length) fail(400,'حدد الإجابة الصحيحة');
      options=labels.map(label=>({id:token(),text:label})); correct=options[req.body.correct_answer].id;
    }else{
      options=[{id:'true',text:'صح'},{id:'false',text:'خطأ'}];
      if(!['true','false'].includes(String(req.body.correct_answer))) fail(400,'حدد صح أو خطأ كإجابة صحيحة');
      correct=String(req.body.correct_answer);
    }
    const sortOrder=await (await db.query('SELECT COALESCE(MAX(sort_order),0)+1 next FROM exam_questions WHERE exam_id=?', [exam.id])).rows[0].next;
    const id=Number(await (await db.query(`INSERT INTO exam_questions(exam_id,question_text,question_type,options_json,correct_answer,sort_order)
      VALUES(?,?,?,?,?,?)`, [exam.id, questionText, type, JSON.stringify(options), correct, sortOrder])).lastInsertRowid);
    await audit(db,req.user,'إضافة سؤال إلى مخزون اختبار','exam_question',id,{exam_id:exam.id,question_type:type});
    res.status(201).json({id,exam_id:exam.id,question_text:questionText,question_type:type,options,correct_answer:correct});
  });

  app.patch('/api/academic/questions/:id',doctorOnly,async (req,res)=>{
    fields(req.body,['question_text','options','correct_answer']);
    const question=await (await db.query(`SELECT q.* FROM exam_questions q JOIN exams e ON e.id=q.exam_id
      WHERE q.id=? AND e.doctor_id=?`, [integer(req.params.id), req.user.id])).rows[0];
    if(!question) fail(404,'السؤال غير موجود');
    const exam=await examOwned(question.exam_id,req.user.id);
    if(exam.status!=='draft') fail(409,'لا يمكن تعديل سؤال بعد نشر الاختبار');
    const questionText=req.body.question_text===undefined?question.question_text:text(req.body.question_text,'نص السؤال',1,4000);
    let options=questionOptions(question.options_json),correct=question.correct_answer;
    if(question.question_type==='multiple_choice'&&req.body.options!==undefined){
      if(!Array.isArray(req.body.options)||req.body.options.length<2||req.body.options.length>8) fail(400,'يجب إدخال خيارين إلى ثمانية خيارات');
      const labels=req.body.options.map((option,index)=>text(option,`الخيار ${index+1}`,1,500));
      if(!Number.isSafeInteger(req.body.correct_answer)||req.body.correct_answer<0||req.body.correct_answer>=labels.length) fail(400,'حدد الإجابة الصحيحة');
      options=labels.map(label=>({id:token(),text:label})); correct=options[req.body.correct_answer].id;
    }else if(req.body.correct_answer!==undefined){
      if(question.question_type!=='true_false'||!['true','false'].includes(String(req.body.correct_answer))) fail(400,'الإجابة الصحيحة غير صالحة');
      correct=String(req.body.correct_answer);
    }
    await db.query(`UPDATE exam_questions SET question_text=?,options_json=?,correct_answer=?,updated_at=to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE id=?`, [questionText, JSON.stringify(options), correct, question.id]);
    res.json({ok:true});
  });

  app.delete('/api/academic/questions/:id',doctorOnly,async (req,res)=>{
    const question=await (await db.query(`SELECT q.* FROM exam_questions q JOIN exams e ON e.id=q.exam_id
      WHERE q.id=? AND e.doctor_id=?`, [integer(req.params.id), req.user.id])).rows[0];
    if(!question) fail(404,'السؤال غير موجود');
    if(await (await examOwned(question.exam_id,req.user.id)).status!=='draft') fail(409,'لا يمكن حذف سؤال بعد نشر الاختبار');
    await db.query('DELETE FROM exam_questions WHERE id=? AND exam_id=?', [question.id, question.exam_id]);
    await audit(db,req.user,'حذف سؤال من مخزون اختبار','exam_question',question.id,{exam_id:question.exam_id});
    res.json({ok:true});
  });

  app.get('/api/academic/exams/:id/share',doctorOnly,async (req,res)=>{
    const exam=await examOwned(integer(req.params.id),req.user.id);
    if (exam.status !== 'published') fail(409,'انشر الاختبار أولًا قبل مشاركته');
    const path = `/exam/${shareSlug(`${exam.subject_name}-${exam.title}-${exam.lecture_title}`)}-${exam.id}`;
    res.json({path});
  });

  app.get('/api/academic/exams/:id/results',doctorOnly,async (req,res)=>{
    const exam=await examOwned(integer(req.params.id),req.user.id);
    const page=Math.max(1,integer(req.query.page||1)),size=Math.min(100,Math.max(1,integer(req.query.size||20)));
    const lecture=await lectureOwned(exam.lecture_id,req.user.id);
    const clauses=['s.level_id=?','s.active=1','s.cancelled_at IS NULL',`EXISTS(SELECT 1 FROM enrollments en WHERE en.student_id=s.id AND en.group_id=? AND en.starts_on<=? AND (en.ends_on IS NULL OR en.ends_on>?))`];
    const args=[exam.level_id,lecture.group_id,lecture.lecture_date,lecture.lecture_date];
    if(req.query.group_id&&integer(req.query.group_id)!==lecture.group_id) fail(400,'المجموعة لا تتبع هذا الاختبار');
    if(req.query.q){const q=text(req.query.q,'البحث',1,100).replace(/[!%_]/g,'!$&');clauses.push("(s.name ILIKE ? ESCAPE '!' OR s.code ILIKE ? ESCAPE '!')");args.push(`%${q}%`,`%${q}%`);}
    const base=clauses.join(' AND '),tab=req.query.tab==='missing'?'missing':'attempted';
    if(req.query.status&&tab==='attempted'){
      if(!['in_progress','submitted','timed_out'].includes(req.query.status)) fail(400,'حالة المحاولة غير صحيحة');
      clauses.push('a.status=?');args.push(req.query.status);
    }
    if(req.query.integrity){
      const scoreCondition=req.query.integrity==='high'?'a.integrity_risk_score>=6':req.query.integrity==='review'?'a.integrity_risk_score BETWEEN 3 AND 5':req.query.integrity==='normal'?'a.integrity_risk_score BETWEEN 0 AND 2':null;
      if(!scoreCondition) fail(400,'مرشح النزاهة غير صحيح');
      if(tab==='attempted') clauses.push(scoreCondition);
    }
    const where=clauses.join(' AND ');
    const query=tab==='missing'?`SELECT s.id student_id,s.name,s.code,l.name level_name,g.name group_name,NULL started_at,NULL submitted_at,0 duration_seconds,0 score,0 percentage,0 correct_answers,0 wrong_answers,0 total_questions,0 integrity_risk_score,0 leave_count,0 away_seconds,'missing' status,NULL attempt_id
      FROM students s JOIN levels l ON l.id=s.level_id JOIN groups_table g ON g.id=? WHERE ${base}
      AND NOT EXISTS(SELECT 1 FROM exam_attempts ax WHERE ax.exam_id=? AND ax.student_id=s.id)`:
      `SELECT s.id student_id,s.name,s.code,l.name level_name,g.name group_name,a.started_at,a.submitted_at,a.duration_seconds,a.score,a.percentage,a.correct_answers,a.wrong_answers,a.total_questions,a.integrity_risk_score,a.status,a.id attempt_id,ec.id exam_certificate_id,
        (SELECT COUNT(*) FROM exam_integrity_events ie WHERE ie.attempt_id=a.id AND ie.event_type IN ('TAB_HIDDEN','PAGE_BLUR','PAGE_HIDE')) leave_count,
        (SELECT COALESCE(SUM(ie.duration_seconds),0) FROM exam_integrity_events ie WHERE ie.attempt_id=a.id AND ie.event_type IN ('TAB_HIDDEN','PAGE_BLUR','PAGE_HIDE')) away_seconds
      FROM exam_attempts a JOIN students s ON s.id=a.student_id JOIN levels l ON l.id=s.level_id JOIN groups_table g ON g.id=?
      LEFT JOIN exam_certificates ec ON ec.attempt_id=a.id
      WHERE a.exam_id=? AND ${where}`;
    const countQuery=tab==='missing'?`SELECT COUNT(*) count FROM students s WHERE ${base} AND NOT EXISTS(SELECT 1 FROM exam_attempts ax WHERE ax.exam_id=? AND ax.student_id=s.id)`:
      `SELECT COUNT(*) count FROM exam_attempts a JOIN students s ON s.id=a.student_id WHERE a.exam_id=? AND ${where}`;
    const bind=tab==='missing'?[lecture.group_id,...args,exam.id]:[lecture.group_id,exam.id,...args];
    const total=tab==='missing'?await (await db.query(countQuery, [...args, exam.id])).rows[0].count:await (await db.query(countQuery, [exam.id, ...args])).rows[0].count;
    const rows=await (await db.query(query+` ORDER BY ${tab==='missing'?'s.name,s.id':'a.submitted_at DESC,a.id DESC'} LIMIT ? OFFSET ?`, [...bind, size, (page-1)*size])).rows;
    res.json({exam:{id:exam.id,title:exam.title,status:exam.status,question_count:exam.question_count,duration_minutes:exam.duration_minutes},items:rows.map(row=>({...row,integrity_status:integrityStatus(row.integrity_risk_score)})),total,page,size,tab});
  });

  app.post('/api/academic/exam-attempts/:id/certificate',doctorOnly,async (req,res)=>{
    fields(req.body,[]);
    const attemptId=integer(req.params.id);
    const candidate=await (await db.query('SELECT exam_id FROM exam_attempts WHERE id=?',[attemptId])).rows[0];
    if(!candidate) fail(404,'محاولة الاختبار غير موجودة');
    const exam=await examOwned(candidate.exam_id,req.user.id);
    const result=await transaction(db,async()=>{
      const attempt=await (await db.query(`SELECT a.*,s.name student_name
        FROM exam_attempts a JOIN students s ON s.id=a.student_id
        WHERE a.id=? AND a.exam_id=? FOR UPDATE`,[attemptId,exam.id])).rows[0];
      if(!attempt) fail(404,'محاولة الاختبار غير موجودة');
      if(!['submitted','timed_out'].includes(attempt.status)) fail(409,'لا يمكن إصدار شهادة قبل إكمال الاختبار');
      let certificate=await (await db.query('SELECT * FROM exam_certificates WHERE attempt_id=?',[attempt.id])).rows[0];
      const resent=Boolean(certificate);
      if(!certificate){
        const year=new Intl.DateTimeFormat('en',{timeZone:'Africa/Cairo',year:'numeric'}).format(new Date());
        const certificateNumber=`STC-EX-${year}-${token().slice(0,12).toUpperCase()}`;
        const certificateId=Number(await (await db.query(`INSERT INTO exam_certificates
          (attempt_id,student_id,exam_id,certificate_number,student_name,exam_title,subject_name,lecture_title,
           score,percentage,total_questions,issuer_name,issued_at,issued_by)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[
          attempt.id,attempt.student_id,exam.id,certificateNumber,attempt.student_name,exam.title,
          exam.subject_name,exam.lecture_title,attempt.score,attempt.percentage,attempt.total_questions,
          req.user.name,new Date().toISOString(),req.user.id
        ])).lastInsertRowid);
        certificate=await (await db.query('SELECT * FROM exam_certificates WHERE id=?',[certificateId])).rows[0];
      }
      const notificationId=Number(await (await db.query(`INSERT INTO notifications
        (student_id,title,message,type,created_by,metadata) VALUES(?,?,?,'GENERAL',?,?)`,[
        attempt.student_id,'شهادة الاختبار',
        `أرسل لك الدكتور شهادة اختبار ${exam.title} بنتيجة ${attempt.score} من ${attempt.total_questions} (${Math.round(attempt.percentage)}%).`,
        req.user.id,JSON.stringify({exam_certificate_id:certificate.id,certificate_number:certificate.certificate_number,exam_id:exam.id})
      ])).lastInsertRowid);
      await audit(db,req.user,resent?'إعادة إرسال شهادة اختبار':'إصدار شهادة اختبار',
        'exam_certificate',certificate.id,{
          student_id:attempt.student_id,student_name:attempt.student_name,exam_id:exam.id,
          exam_title:exam.title,attempt_id:attempt.id,certificate_number:certificate.certificate_number,
          notification_id:notificationId
        });
      return {certificate,resent};
    });
    res.status(result.resent?200:201).json({
      id:result.certificate.id,certificate_number:result.certificate.certificate_number,resent:result.resent
    });
  });

  app.get('/api/student/exams',studentOnly,async (req,res)=>{
    const student=await studentForUser(req.user.id),page=Math.max(1,integer(req.query.page||1)),size=Math.min(50,Math.max(1,integer(req.query.size||20)));
    const eligible=`e.level_id=? AND e.status='published' AND cl.status<>'cancelled' AND EXISTS(
      SELECT 1 FROM enrollments en WHERE en.student_id=? AND en.group_id=cl.group_id
        AND en.starts_on<=cl.lecture_date AND (en.ends_on IS NULL OR en.ends_on>cl.lecture_date))`;
    const items=await (await db.query(`SELECT e.id,e.title,e.description,e.duration_minutes,e.question_count,e.share_token,
      s.name subject_name,cl.title lecture_title,cl.lecture_date,g.name group_name
      FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id JOIN subjects s ON s.id=e.subject_id
      JOIN groups_table g ON g.id=cl.group_id WHERE ${eligible}
        AND NOT EXISTS(SELECT 1 FROM exam_attempts a WHERE a.exam_id=e.id AND a.student_id=?)
      ORDER BY cl.lecture_date DESC,e.id DESC LIMIT ? OFFSET ?`, [student.level_id, student.id, student.id, size, (page-1)*size])).rows;
    const total=await (await db.query(`SELECT COUNT(*) count FROM exams e JOIN course_lectures cl ON cl.id=e.lecture_id
      WHERE ${eligible} AND NOT EXISTS(SELECT 1 FROM exam_attempts a WHERE a.exam_id=e.id AND a.student_id=?)`, [student.level_id, student.id, student.id])).rows[0].count;
    const completed=await (await db.query(`SELECT a.id attempt_id,a.started_at,a.submitted_at,a.duration_seconds,a.score,a.percentage,
      a.correct_answers,a.wrong_answers,a.total_questions,e.id exam_id,e.title,e.duration_minutes,
      s.name subject_name,cl.title lecture_title
      FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN course_lectures cl ON cl.id=e.lecture_id
      JOIN subjects s ON s.id=e.subject_id WHERE a.student_id=? AND a.status IN ('submitted','timed_out')
      ORDER BY a.submitted_at DESC,a.id DESC LIMIT ? OFFSET ?`, [student.id, size, (page-1)*size])).rows;
    const in_progress=await (await db.query(`SELECT a.id attempt_id,a.started_at,a.duration_seconds,e.id exam_id,e.title,e.duration_minutes,
      s.name subject_name,cl.title lecture_title
      FROM exam_attempts a JOIN exams e ON e.id=a.exam_id JOIN course_lectures cl ON cl.id=e.lecture_id
      JOIN subjects s ON s.id=e.subject_id WHERE a.student_id=? AND a.status='in_progress'
      ORDER BY a.started_at DESC,a.id DESC`, [student.id])).rows;
    res.json({available:items,available_total:total,completed,in_progress,page,size});
  });

  app.get('/api/student/exams/share/:shareToken',studentOnly,async (req,res)=>{
    const student=await studentForUser(req.user.id);
    const exam=await (await db.query(`SELECT e.id,e.title,e.description,e.duration_minutes,e.question_count,s.name subject_name,
      cl.title lecture_title,cl.group_id,cl.lecture_date,e.status
      FROM exams e JOIN subjects s ON s.id=e.subject_id JOIN course_lectures cl ON cl.id=e.lecture_id
      WHERE e.share_token=? AND e.status='published'`, [text(req.params.shareToken,'رابط الاختبار',20,128)])).rows[0];
    if(!exam) fail(404,'الاختبار غير موجود أو غير منشور');
    await eligibleExam(exam.id,student);
    const attempt=await (await db.query('SELECT id,status FROM exam_attempts WHERE exam_id=? AND student_id=?', [exam.id, student.id])).rows[0];
    if(attempt) fail(409,'لديك محاولة مسجلة بالفعل لهذا الاختبار');
    const {group_id,lecture_date,status,...safeExam}=exam;
    res.json(safeExam);
  });

  app.get('/api/student/exams/link/:id',studentOnly,async (req,res)=>{
    const student=await studentForUser(req.user.id);
    const exam=await (await db.query(`SELECT e.id,e.title,e.description,e.duration_minutes,e.question_count,s.name subject_name,
      cl.title lecture_title,cl.group_id,cl.lecture_date,e.status
      FROM exams e JOIN subjects s ON s.id=e.subject_id JOIN course_lectures cl ON cl.id=e.lecture_id
      WHERE e.id=? AND e.status='published'`, [integer(req.params.id)])).rows[0];
    if(!exam) fail(404,'الاختبار غير موجود أو غير منشور');
    await eligibleExam(exam.id,student);
    const attempt=await (await db.query('SELECT id,status FROM exam_attempts WHERE exam_id=? AND student_id=?', [exam.id, student.id])).rows[0];
    if(attempt) fail(409,'لديك محاولة مسجلة بالفعل لهذا الاختبار');
    const {group_id,lecture_date,status,...safeExam}=exam;
    res.json(safeExam);
  });

  const startStudentAttempt=async (req,examId,res)=>{
    const student=await studentForUser(req.user.id),exam=await eligibleExam(examId,student);
    if(exam.status!=='published') fail(409,'الاختبار غير منشور أو مغلق');
    const id=await transaction(db,async ()=>{
      const previous=await (await db.query(`SELECT a.id,a.status,a.started_at,e.duration_minutes FROM exam_attempts a
        JOIN exams e ON e.id=a.exam_id WHERE a.exam_id=? AND a.student_id=?`, [exam.id, student.id])).rows[0];
      if(previous) return {id:previous.id,existing:true,attemptStatus:previous.status,startedAt:previous.started_at,duration:previous.duration_minutes};
      const pool=await (await db.query('SELECT * FROM exam_questions WHERE exam_id=?', [exam.id])).rows;
      if(pool.length<exam.question_count) fail(409,'مخزون الأسئلة غير مكتمل لهذا الاختبار');
      const selected=shuffled(pool).slice(0,exam.question_count).map(question=>({...question,shuffledOptions:shuffled(questionOptions(question.options_json))}));
      const startedAt=new Date().toISOString();
      const attemptId=Number(await (await db.query(`INSERT INTO exam_attempts(exam_id,student_id,started_at,total_questions)
        VALUES(?,?,?,?)`, [exam.id, student.id, startedAt, exam.question_count])).lastInsertRowid);
      const insert = `INSERT INTO exam_attempt_questions(attempt_id,exam_id,question_id,position,question_text,question_type,options_json,correct_answer)
        VALUES(?,?,?,?,?,?,?,?)`;
      for (const [position, question] of selected.entries()) {
        await db.query(insert, [attemptId, exam.id, question.id, position, question.question_text,
          question.question_type, JSON.stringify(question.shuffledOptions), question.correct_answer]);
      }
      await audit(db,req.user,'بدء اختبار','exam_attempt',attemptId,{exam_id:exam.id,total_questions:exam.question_count});
      return {id:attemptId,existing:false,attemptStatus:'in_progress',startedAt,duration:exam.duration_minutes};
    });
    const attempt=await attemptForStudent(id.id,student.id);
    const now=Date.now(),expires=Date.parse(attempt.started_at)+attempt.duration_minutes*60000;
    if(attempt.status==='in_progress'&&now>=expires) await finishAttempt(attempt.id,student.id,now);
    else if(attempt.status!=='in_progress') fail(409,'سبق أن أنهيت هذا الاختبار؛ لا يمكن بدء محاولة أخرى');
    const current=await attemptForStudent(id.id,student.id);
    res.status(id.existing?200:201).json({...await attemptPayload(current,current.status==='in_progress'),server_now:new Date().toISOString(),remaining_seconds:Math.max(0,Math.ceil((expires-now)/1000))});
  };
  app.post('/api/student/exams/:id/attempts',studentOnly,async (req,res)=>{
    fields(req.body,[]); await startStudentAttempt(req,integer(req.params.id),res);
  });
  app.post('/api/student/exams/share/:shareToken/start',studentOnly,async (req,res)=>{
    fields(req.body,[]);
    const exam=await (await db.query('SELECT id FROM exams WHERE share_token=?', [text(req.params.shareToken,'رابط الاختبار',20,128)])).rows[0];
    if(!exam) fail(404,'رابط الاختبار غير موجود');
    await startStudentAttempt(req,exam.id,res);
  });
  app.post('/api/student/exams/link/:id/start',studentOnly,async (req,res)=>{
    fields(req.body,[]);
    await startStudentAttempt(req,integer(req.params.id),res);
  });

  app.get('/api/student/attempts/:id',studentOnly,async (req,res)=>{
    const student=await studentForUser(req.user.id),attempt=await attemptForStudent(integer(req.params.id),student.id);
    if(attempt.status==='in_progress'&&Date.now()>=Date.parse(attempt.started_at)+attempt.duration_minutes*60000) await finishAttempt(attempt.id,student.id);
    const current=await attemptForStudent(attempt.id,student.id);
    res.json({...await attemptPayload(current,current.status==='in_progress'),server_now:new Date().toISOString(),remaining_seconds:Math.max(0,Math.ceil((Date.parse(current.started_at)+current.duration_minutes*60000-Date.now())/1000))});
  });

  app.put('/api/student/attempts/:id/answers',studentOnly,async (req,res)=>{
    fields(req.body,['question_id','selected_answer','answers']);
    const student=await studentForUser(req.user.id),attempt=await attemptForStudent(integer(req.params.id),student.id);
    if(attempt.status!=='in_progress') fail(409,'تم تسليم هذا الاختبار ولا يمكن تعديل الإجابات');
    if(Date.now()>=Date.parse(attempt.started_at)+attempt.duration_minutes*60000){await finishAttempt(attempt.id,student.id);fail(409,'انتهى وقت الاختبار وتم تسليمه تلقائيًا');}
    const updates=req.body.answers===undefined?[{question_id:req.body.question_id,selected_answer:req.body.selected_answer}]:req.body.answers;
    if(!Array.isArray(updates)||updates.length<1||updates.length>50) fail(400,'دفعة الإجابات غير صحيحة');
    const validated=await Promise.all(updates.map(async answer=>{
      const questionId=integer(answer?.question_id),selected=text(answer?.selected_answer,'الإجابة',1,128);
      const question=(await db.query('SELECT options_json FROM exam_attempt_questions WHERE attempt_id=? AND question_id=?', [attempt.id, questionId])).rows[0];
      if(!question) fail(404,'السؤال لا يتبع هذه المحاولة');
      if(!questionOptions(question.options_json).some(option=>option.id===selected)) fail(400,'الإجابة المختارة غير موجودة ضمن خيارات السؤال');
      return {questionId,selected};
    }));
    await transaction(db, async () => {
      const save = `INSERT INTO exam_answers(attempt_id,question_id,selected_answer,is_correct,answered_at)
        VALUES(?,?,?,0,to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        ON CONFLICT(attempt_id,question_id) DO UPDATE SET selected_answer=excluded.selected_answer,is_correct=0,answered_at=excluded.answered_at`;
      for (const answer of validated) {
        await db.query(save, [attempt.id, answer.questionId, answer.selected]);
      }
    });
    res.json({saved:validated.length});
  });

  app.post('/api/student/attempts/:id/submit',studentOnly,async (req,res)=>{
    fields(req.body,[]);
    const student=await studentForUser(req.user.id),attempt=await attemptForStudent(integer(req.params.id),student.id);
    if(attempt.status!=='in_progress') fail(409,'تم تسليم هذا الاختبار بالفعل');
    const completed=await finishAttempt(attempt.id,student.id);
    const current=await attemptForStudent(completed.id,student.id);
    await audit(db,req.user,'تسليم اختبار','exam_attempt',current.id,{exam_id:current.exam_id,score:current.score,total:current.total_questions});
    res.json({...await attemptPayload(current,false),server_now:new Date().toISOString()});
  });

  app.get('/api/student/attempts/:id/review',studentOnly,async (req,res)=>{
    const student=await studentForUser(req.user.id),attempt=await attemptForStudent(integer(req.params.id),student.id);
    if(attempt.status==='in_progress') fail(403,'مراجعة الإجابات متاحة بعد تسليم الاختبار فقط');
    const items=await (await db.query(`SELECT q.question_id,q.position,q.question_text,q.question_type,q.options_json,q.correct_answer,a.selected_answer,
      CASE WHEN a.selected_answer=q.correct_answer THEN 1 ELSE 0 END is_correct
      FROM exam_attempt_questions q LEFT JOIN exam_answers a ON a.attempt_id=q.attempt_id AND a.question_id=q.question_id
      WHERE q.attempt_id=? ORDER BY q.position`, [attempt.id])).rows.map(question=>({...question,options:questionOptions(question.options_json)}));
    res.json({attempt:await attemptPayload(attempt,false),questions:items});
  });

  app.post('/api/student/attempts/:id/integrity-events',studentOnly,async (req,res)=>{
    fields(req.body,['events']);
    if(!Array.isArray(req.body.events)||req.body.events.length<1||req.body.events.length>20) fail(400,'دفعة الأحداث غير صحيحة');
    const student=await studentForUser(req.user.id),attempt=await attemptForStudent(integer(req.params.id),student.id);
    if(attempt.status!=='in_progress') fail(409,'المحاولة مغلقة');
    const accepted=new Set(['TAB_HIDDEN','TAB_VISIBLE','PAGE_BLUR','PAGE_FOCUS','PAGE_HIDE','PAGE_SHOW']);
    const events=await Promise.all(req.body.events.map(async event=>{
      if(!event||!accepted.has(event.event_type)) fail(400,'نوع حدث النزاهة غير مدعوم');
      const questionId=event.question_id===undefined||event.question_id===null?null:integer(event.question_id);
      if(questionId && !(await db.query('SELECT id FROM exam_attempt_questions WHERE attempt_id=? AND question_id=?', [attempt.id, questionId])).rows[0]) fail(400,'السؤال لا يتبع المحاولة');
      const observed=typeof event.occurred_at==='string'?Date.parse(event.occurred_at):NaN;
      const serverNow=Date.now(),lowerBound=Date.parse(attempt.started_at);
      const occurredAt=Number.isFinite(observed)&&observed>=lowerBound&&observed<=serverNow+5000
        ?new Date(Math.min(observed,serverNow)).toISOString():new Date(serverNow).toISOString();
      return {eventType:event.event_type,questionId,occurredAt};
    }));
    await transaction(db,async ()=>{
      let risk=0;
      let leaveCount=await (await db.query(`SELECT COUNT(*) count FROM exam_integrity_events WHERE attempt_id=?
        AND event_type IN ('TAB_HIDDEN','PAGE_BLUR','PAGE_HIDE')`, [attempt.id])).rows[0].count;
      for(const event of events){
        await db.query('INSERT INTO exam_integrity_events(attempt_id,event_type,occurred_at,question_id) VALUES(?,?,?,?)',
          [attempt.id,event.eventType,event.occurredAt,event.questionId]);
        if(['TAB_HIDDEN','PAGE_BLUR','PAGE_HIDE'].includes(event.eventType)){
          leaveCount+=1;
          risk+=1;
          if(leaveCount===2)risk+=2;
          else if(leaveCount>=3)risk+=3;
        }
        if(['TAB_VISIBLE','PAGE_FOCUS','PAGE_SHOW'].includes(event.eventType)){
          const away=await (await db.query(`SELECT id,occurred_at FROM exam_integrity_events WHERE attempt_id=?
            AND event_type IN ('TAB_HIDDEN','PAGE_BLUR','PAGE_HIDE') AND duration_seconds=0 ORDER BY id DESC LIMIT 1`, [attempt.id])).rows[0];
          if(away){
            const seconds=Math.max(0,Math.floor((Date.parse(event.occurredAt)-Date.parse(away.occurred_at))/1000));
            await db.query('UPDATE exam_integrity_events SET duration_seconds=? WHERE id=?', [seconds, away.id]);
            if(seconds>=60)risk+=1;
            if(seconds>=300)risk+=1;
          }
        }
      }
      if(risk) await db.query('UPDATE exam_attempts SET integrity_risk_score=integrity_risk_score+? WHERE id=? AND status=\'in_progress\'', [risk, attempt.id]);
    });
    res.status(202).json({recorded:events.length});
  });

  app.patch('/api/academic/lectures/:id', doctorOnly, async (req, res) => {
    fields(req.body, ['group_id','title','topic','date','start_time','end_time','status']);
    const old = await lectureOwned(integer(req.params.id),req.user.id);
    const groupId = req.body.group_id === undefined ? old.group_id : integer(req.body.group_id);
    const group = await (await db.query('SELECT * FROM groups_table WHERE id=? AND level_id=?', [groupId, old.level_id])).rows[0];
    if (!group) fail(400,'المجموعة لا تتبع فرقة المادة');
    const title = req.body.title === undefined ? old.title : text(req.body.title,'عنوان المحاضرة',2,160);
    const topic = req.body.topic === undefined ? old.topic : text(req.body.topic,'الموضوع',0,2000);
    const lectureDate = req.body.date === undefined ? old.lecture_date : date(req.body.date);
    const startTime = req.body.start_time === undefined ? old.start_time : time(req.body.start_time);
    const endTime = req.body.end_time === undefined ? old.end_time : time(req.body.end_time);
    const status = req.body.status === undefined ? old.status : req.body.status;
    if (!['scheduled','started','completed','cancelled'].includes(status)) fail(400,'حالة المحاضرة غير صحيحة');
    if (startTime && endTime && endTime <= startTime) fail(400,'وقت النهاية يجب أن يكون بعد البداية');
    const scheduleChanged = groupId !== old.group_id || lectureDate !== old.lecture_date || startTime !== old.start_time || endTime !== old.end_time;
    await transaction(db,async () => {
      if ((scheduleChanged || status === 'cancelled') && await (await db.query('SELECT id FROM attendance WHERE session_id=? LIMIT 1', [old.course_session_id])).rows[0]) fail(409,'للمحاضرة حضور مسجل؛ لا يمكن تغيير موعدها أو إلغاؤها');
      if ((scheduleChanged || status === 'cancelled') && await (await db.query(`SELECT a.id FROM exam_attempts a JOIN exams e ON e.id=a.exam_id
        WHERE e.lecture_id=? LIMIT 1`, [old.id])).rows[0]) fail(409,'بدأ طلاب هذا الاختبار؛ لا يمكن تغيير موعد المحاضرة أو إلغاؤها');
      if (scheduleChanged && await (await db.query('SELECT id FROM course_sessions WHERE group_id=? AND date=? AND id<>?', [groupId, lectureDate, old.course_session_id])).rows[0]) fail(409,'توجد جلسة أخرى لهذه المجموعة في التاريخ المحدد');
      await db.query(`UPDATE course_sessions SET group_id=?,date=?,title=?,start_time=?,end_time=?,starts_at_utc=?,cancelled=?,reminder_sent_at=NULL WHERE id=?`, [groupId, lectureDate, title, startTime, endTime, sessionStartsAtUtc(lectureDate,startTime), status==='cancelled'?1:0, old.course_session_id]);
      await db.query(`UPDATE course_lectures SET group_id=?,title=?,topic=?,lecture_date=?,start_time=?,end_time=?,status=?,updated_at=to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE id=? AND doctor_id=?`, [groupId, title, topic, lectureDate, startTime, endTime, status, old.id, req.user.id]);
      const changed = scheduleChanged || status !== old.status || title !== old.title;
      if (changed) await enrolledStudentsNotice(req.user,status==='cancelled'?old.group_id:groupId,status==='cancelled'?old.lecture_date:lectureDate,
        status==='cancelled'?'إلغاء محاضرة':'تحديث موعد محاضرة',
        status==='cancelled'?`تم إلغاء محاضرة ${old.title} في مادة ${old.subject_name}.`:`تم تحديث محاضرة ${title} في مادة ${old.subject_name} بتاريخ ${lectureDate}${startTime?` الساعة ${formatClockTime(startTime)}`:''}.`,
        {lecture_id:old.id,course_session_id:old.course_session_id});
      await audit(db,req.user,status==='cancelled'?'إلغاء محاضرة أكاديمية':'تعديل محاضرة أكاديمية','lecture',old.id,
        {title,topic,group_id:groupId,date:lectureDate,start_time:startTime,end_time:endTime,status});
    });
    res.json(await lectureOwned(old.id,req.user.id));
  });

  app.get('/api/student/lectures', studentOnly, async (req, res) => {
    const student = await (await db.query('SELECT id,level_id,user_id FROM students WHERE user_id=? AND active=1 AND cancelled_at IS NULL', [req.user.id])).rows[0];
    if (!student) fail(404,'ملف الطالب غير موجود');
    const page = Math.max(1,integer(req.query.page||1)), size = Math.min(50,Math.max(1,integer(req.query.size||20)));
    const items = await (await db.query(`SELECT cl.id,cl.title,cl.topic,cl.lecture_date,cl.start_time,cl.end_time,cl.status,
      s.name subject_name,u.name doctor_name,g.name group_name
      FROM course_lectures cl JOIN subjects s ON s.id=cl.subject_id JOIN users u ON u.id=cl.doctor_id
      JOIN groups_table g ON g.id=cl.group_id JOIN enrollments en ON en.student_id=? AND en.group_id=cl.group_id
        AND en.starts_on<=cl.lecture_date AND (en.ends_on IS NULL OR en.ends_on>cl.lecture_date)
      WHERE cl.level_id=? AND cl.status<>'cancelled' ORDER BY cl.lecture_date DESC,cl.id DESC LIMIT ? OFFSET ?`, [student.id, student.level_id, size, (page-1)*size])).rows;
    res.json({items,page,size});
  });
}