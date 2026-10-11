import http from 'http';

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('--- 1. Login as admin ---');
  const loginRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/auth/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'admin', password: 'K7k-KP7U*YsCyrd_XcTE' });

  if (loginRes.status !== 200 || !loginRes.data.token) {
    console.error('Login failed:', loginRes);
    process.exit(1);
  }

  const token = loginRes.data.token;
  console.log('Login successful, token received.');

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  console.log('\n--- 2. Fetch examinees to pick an attempt ---');
  const examineesRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/admin/examinees',
    method: 'GET',
    headers: authHeaders
  });

  const examinees = examineesRes.data;
  console.log(`Found ${examinees.length} examinees.`);
  if (examinees.length === 0) {
    console.error('No examinees found.');
    process.exit(1);
  }

  const firstExaminee = examinees[0];
  const examineeName = firstExaminee.examineeName || firstExaminee.name;
  console.log(`Picking first examinee: ${examineeName}`);

  const detailRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/admin/examinees/${encodeURIComponent(examineeName)}`,
    method: 'GET',
    headers: authHeaders
  });

  const attempts = detailRes.data.attempts || [];
  console.log(`Examinee has ${attempts.length} attempts.`);
  if (attempts.length === 0) {
    console.error('No attempts found for examinee.');
    process.exit(1);
  }

  const targetAttempt = attempts[0];
  const attemptId = targetAttempt.attemptId || targetAttempt.id;
  console.log(`Target attempt ID: ${attemptId}, current score: ${targetAttempt.score}/${targetAttempt.maxScore}, percent: ${targetAttempt.percent}%`);

  const currentPercent = targetAttempt.percent != null ? targetAttempt.percent : (targetAttempt.maxScore > 0 ? (targetAttempt.score / targetAttempt.maxScore) * 100 : 0);

  console.log('\n--- 3. Validation Test: Reject reason too short ---');
  const shortReasonRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/admin/attempts/${attemptId}/modify-result`,
    method: 'POST',
    headers: authHeaders
  }, {
    newPercent: 88,
    reason: 'abc', // < 5 chars
    committeeReference: 'محضر 1'
  });
  console.log(`Short reason response: status=${shortReasonRes.status}, error=${shortReasonRes.data?.error}`);
  if (shortReasonRes.status !== 400) {
    throw new Error('Expected 400 for short reason');
  }

  console.log('\n--- 4. Validation Test: Reject out-of-range percent ---');
  const outOfRangeRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/admin/attempts/${attemptId}/modify-result`,
    method: 'POST',
    headers: authHeaders
  }, {
    newPercent: 125, // > 100
    reason: 'تعديل النتيجة بناء على قرار اللجنة',
    committeeReference: 'محضر 1'
  });
  console.log(`Out-of-range response: status=${outOfRangeRes.status}, error=${outOfRangeRes.data?.error}`);
  if (outOfRangeRes.status !== 400) {
    throw new Error('Expected 400 for out-of-range percent');
  }

  console.log('\n--- 5. Validation Test: Reject identical percent ---');
  const identicalRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/admin/attempts/${attemptId}/modify-result`,
    method: 'POST',
    headers: authHeaders
  }, {
    newPercent: currentPercent,
    reason: 'تعديل النتيجة بدون أي تغيير في الدرجة',
    committeeReference: 'محضر 1'
  });
  console.log(`Identical score response: status=${identicalRes.status}, error=${identicalRes.data?.error}`);
  if (identicalRes.status !== 400) {
    throw new Error('Expected 400 for identical percent');
  }

  console.log('\n--- 6. Successful Modification 1: Change to 90.00% ---');
  const newPercent1 = currentPercent === 90 ? 91 : 90;
  const mod1Res = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/admin/attempts/${attemptId}/modify-result`,
    method: 'POST',
    headers: authHeaders
  }, {
    newPercent: newPercent1,
    reason: 'إعادة تصحيح واعتماد الدرجة من لجنة الاختبارات المركزية',
    committeeReference: 'محضر رقم 104/2026'
  });
  console.log(`Modification 1 status: ${mod1Res.status}, ok: ${mod1Res.data?.ok}`);
  if (mod1Res.status !== 200 || !mod1Res.data?.ok) {
    throw new Error('Modification 1 failed: ' + JSON.stringify(mod1Res.data));
  }
  console.log('Modification 1 result:', mod1Res.data.result);

  console.log('\n--- 7. Successful Modification 2: Change to 93.50% ---');
  const newPercent2 = 93.5;
  const mod2Res = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/admin/attempts/${attemptId}/modify-result`,
    method: 'POST',
    headers: authHeaders
  }, {
    newPercent: newPercent2,
    reason: 'إضافة درجات السؤال الملغى بقرار مجلس الإدارة',
    committeeReference: 'قرار إداري رقم 77'
  });
  console.log(`Modification 2 status: ${mod2Res.status}, ok: ${mod2Res.data?.ok}`);
  if (mod2Res.status !== 200 || !mod2Res.data?.ok) {
    throw new Error('Modification 2 failed: ' + JSON.stringify(mod2Res.data));
  }

  console.log('\n--- 8. Verify Attempt Audit History ---');
  const historyRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/admin/attempts/${attemptId}/audit-history`,
    method: 'GET',
    headers: authHeaders
  });
  console.log(`Attempt audit history count: ${historyRes.data.history?.length}`);
  console.log(historyRes.data.history);
  if (!historyRes.data.history || historyRes.data.history.length < 2) {
    throw new Error('Expected at least 2 audit entries for this attempt');
  }

  console.log('\n--- 9. Verify Examinee Full Audit History ---');
  const examineeHistoryRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/admin/examinees/${encodeURIComponent(examineeName)}/audit-history`,
    method: 'GET',
    headers: authHeaders
  });
  console.log(`Examinee full audit history count: ${examineeHistoryRes.data.history?.length}`);
  if (!examineeHistoryRes.data.history || examineeHistoryRes.data.history.length < 2) {
    throw new Error('Expected at least 2 audit entries for examinee');
  }

  console.log('\n✅ ALL AUTOMATED AUDIT & MODIFICATION TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
