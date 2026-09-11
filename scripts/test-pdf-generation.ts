/**
 * Standalone test: generate a proctoring-report PDF using the SAME logic
 * as api/index.ts and validate the output is a well-formed PDF 1.4 file.
 *
 * Run:  npx ts-node scripts/test-pdf-generation.ts
 */
import * as fs from 'fs';
import * as path from 'path';

// ─── mirror the pdf-generation logic from api/index.ts ──────────────────────

function pdfStr(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildPdfBuffer(reportData: Record<string, unknown>, sessionId: string): Buffer {
  const safeJson = (v: unknown): unknown => {
    if (v == null) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v as string); } catch { return {}; }
  };

  const violationSummary = safeJson(reportData.violation_summary) as Record<string, number>;
  const fullTimeline = safeJson(reportData.full_timeline) as Array<Record<string, unknown>>;

  const studentName  = pdfStr(reportData.student_name  || reportData.student_id  || 'John Doe');
  const studentEmail = pdfStr(reportData.student_email || 'john@example.com');
  const examTitle    = pdfStr(reportData.exam_title    || reportData.exam_id     || 'Demo Examination');
  const riskScore    = Number(reportData.risk_score)   || 0;
  const riskLevel    = pdfStr(String(reportData.risk_level || 'low').toUpperCase());
  const warnings     = Number(reportData.warning_count) || 0;
  const disqualified = Boolean(reportData.disqualification_status);
  const status       = pdfStr(String(reportData.submission_status || 'unknown').toUpperCase());
  const generatedAt  = pdfStr(
    reportData.generated_at ? new Date(reportData.generated_at as string).toUTCString() : new Date().toUTCString()
  );

  const totalViolations = Object.values(violationSummary).reduce((s, n) => s + (Number(n) || 0), 0);

  const violationLines: string[] = Object.entries(violationSummary)
    .slice(0, 20)
    .map(([k, v]) => pdfStr(`${k.replace(/_/g, ' ')}: ${v}`));

  const timelineLines: string[] = (Array.isArray(fullTimeline) ? fullTimeline : [])
    .slice(0, 30)
    .map((item) => {
      const ts  = String(item.at || item.timestamp || '').split('T')[1]?.substring(0, 8) || '';
      const typ = String(item.type || item.event_type || '').replace(/_/g, ' ').toUpperCase();
      const sev = String(item.severity || '');
      return pdfStr(`${ts}  ${typ}${sev ? '  [' + sev + ']' : ''}`);
    });

  const parts: string[] = [];
  const objOffsets: number[] = [];
  let pos = 0;

  const emit = (line: string) => {
    const withNL = line + '\n';
    parts.push(withNL);
    pos += Buffer.byteLength(withNL, 'latin1');
  };

  const beginObj = (id: number) => {
    objOffsets[id] = pos;
    emit(`${id} 0 obj`);
  };
  const endObj = () => emit('endobj');

  emit('%PDF-1.4');
  emit('%\xe2\xe3\xcf\xd3');

  beginObj(1);
  emit('<< /Type /Catalog /Pages 2 0 R >>');
  endObj();

  beginObj(2);
  emit('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  endObj();

  beginObj(3);
  emit('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]');
  emit('   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  endObj();

  type TItem = { x: number; y: number; size: number; text: string };
  const items: TItem[] = [];

  const PAGE_W = 595;
  const PAGE_H = 842;
  const ML     = 50;
  const TOP    = PAGE_H - 50;
  let cy       = TOP;

  const addItem = (text: string, x: number, size: number) => {
    items.push({ x, y: cy, size, text });
    cy -= size + 4;
  };
  const gap  = (n = 6) => { cy -= n; };
  const head = (label: string) => { gap(); addItem(`-- ${label} --`, ML, 11); cy -= 4; };

  addItem('AI Proctoring System - Exam Report', ML, 18);
  addItem(`Generated: ${generatedAt}`, ML, 9);
  addItem(`Session ID: ${pdfStr(sessionId)}`, ML, 9);

  head('Student Information');
  addItem(`Name:   ${studentName}`,  ML + 10, 10);
  addItem(`Email:  ${studentEmail}`, ML + 10, 10);

  head('Exam Information');
  addItem(`Exam:   ${examTitle}`, ML + 10, 10);

  head('Risk Assessment');
  addItem(`Risk Score:       ${riskScore} / 100`,             ML + 10, 10);
  addItem(`Risk Level:       ${riskLevel}`,                   ML + 10, 10);
  addItem(`Warnings:         ${warnings}`,                    ML + 10, 10);
  addItem(`Total Violations: ${totalViolations}`,             ML + 10, 10);
  addItem(`Status:           ${status}`,                      ML + 10, 10);
  addItem(`Disqualified:     ${disqualified ? 'YES' : 'NO'}`, ML + 10, 10);

  if (violationLines.length > 0) {
    head('Violation Breakdown');
    for (const vl of violationLines) { if (cy > 60) addItem(vl, ML + 10, 9); }
  }

  if (timelineLines.length > 0) {
    head('Event Timeline');
    for (const tl of timelineLines) { if (cy > 60) addItem(tl, ML + 10, 8); }
  }

  const ops: string[] = [];
  ops.push(`0.12 0.16 0.25 rg`);
  ops.push(`${ML - 5} ${TOP - 34} ${PAGE_W - ML * 2 + 10} 42 re f`);

  for (const it of items) {
    const isTitle = it.size >= 18;
    const [r, g, b] = isTitle ? [1, 1, 1]
                    : it.size >= 11 ? [0.6, 0.75, 0.9]
                    : [0.1, 0.1, 0.1];
    ops.push(`BT /F1 ${it.size} Tf ${r} ${g} ${b} rg ${it.x} ${it.y} Td (${it.text}) Tj ET`);
  }

  // Stream body: identical to how api/index.ts now writes it
  const streamBody = ops.join('\n') + '\n';
  const streamLen  = Buffer.byteLength(streamBody, 'latin1');

  beginObj(4);
  emit(`<< /Length ${streamLen} >>`);
  emit('stream');
  parts.push(streamBody);
  pos += streamLen;
  emit('endstream');
  endObj();

  beginObj(5);
  emit('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica');
  emit('   /Encoding /WinAnsiEncoding >>');
  endObj();

  const xrefPos  = pos;
  const objCount = Math.max(...Object.keys(objOffsets).map(Number)) + 1;

  emit('xref');
  emit(`0 ${objCount}`);
  emit('0000000000 65535 f ');
  for (let i = 1; i < objCount; i++) {
    emit(`${String(objOffsets[i] ?? 0).padStart(10, '0')} 00000 n `);
  }

  emit('trailer');
  emit(`<< /Size ${objCount} /Root 1 0 R >>`);
  emit('startxref');
  emit(String(xrefPos));
  emit('%%EOF');

  return Buffer.from(parts.join(''), 'latin1');
}

// ─── validation ──────────────────────────────────────────────────────────────

function validatePdf(buf: Buffer): void {
  const text = buf.toString('latin1');

  // 1. Header
  if (!text.startsWith('%PDF-1.4\n')) throw new Error('Missing %PDF-1.4 header');
  console.log('  ✓ Header: %PDF-1.4');

  // 2. EOF
  if (!text.includes('%%EOF')) throw new Error('Missing %%EOF');
  console.log('  ✓ Footer: %%EOF present');

  // 3. startxref
  const sxMatch = text.match(/startxref\r?\n(\d+)\r?\n%%EOF/);
  if (!sxMatch) throw new Error('startxref not found');
  const xrefOffset = parseInt(sxMatch[1]);
  console.log(`  ✓ startxref = ${xrefOffset}`);

  // 4. xref table at declared offset
  const xrefStr = text.slice(xrefOffset, xrefOffset + 4);
  if (xrefStr !== 'xref') throw new Error(`xref table not at offset ${xrefOffset} — found "${xrefStr}"`);
  console.log('  ✓ xref table at correct offset');

  // 5. stream /Length
  const streamLenMatch = text.match(/<<\s*\/Length\s+(\d+)\s*>>\s*\nstream\n/);
  if (!streamLenMatch) throw new Error('Cannot locate stream Length declaration');
  const declaredLen = parseInt(streamLenMatch[1]);
  const streamStart = text.indexOf('stream\n', text.indexOf('/Length')) + 'stream\n'.length;
  const streamEnd   = text.indexOf('\nendstream', streamStart);
  const actualLen   = Buffer.byteLength(text.slice(streamStart, streamEnd + 1 /* include trailing \n */), 'latin1');
  if (declaredLen !== actualLen) throw new Error(`Stream /Length mismatch: declared ${declaredLen}, actual ${actualLen}`);
  console.log(`  ✓ Stream /Length = ${declaredLen} (matches actual bytes)`);

  // 6. Non-zero size
  if (buf.length < 500) throw new Error(`File too small: ${buf.length} bytes`);
  console.log(`  ✓ File size: ${buf.length} bytes`);

  // 7. Contains readable text
  if (!text.includes('AI Proctoring System')) throw new Error('Missing title text in PDF');
  console.log('  ✓ PDF contains title text');
}

// ─── run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== PDF Generation Test ===\n');

  // Test 1: clean report (no violations)
  console.log('Test 1: Clean report (0 violations)');
  const clean: Record<string, unknown> = {
    student_name: 'Alice Smith',
    student_email: 'alice@example.com',
    exam_title: 'Demo Examination',
    risk_score: 0,
    risk_level: 'low',
    warning_count: 0,
    disqualification_status: false,
    submission_status: 'submitted',
    violation_summary: {},
    full_timeline: [],
    generated_at: new Date().toISOString(),
  };
  const buf1 = buildPdfBuffer(clean, 'test-session-clean-001');
  validatePdf(buf1);
  const out1 = path.join(__dirname, 'test-clean.pdf');
  fs.writeFileSync(out1, buf1);
  console.log(`  ✓ Written to ${out1}\n`);

  // Test 2: report with violations and timeline
  console.log('Test 2: Report with violations and timeline');
  const withViolations: Record<string, unknown> = {
    student_name: 'Bob Jones',
    student_email: 'bob@example.com',
    exam_title: 'Advanced Security Exam',
    risk_score: 65,
    risk_level: 'high',
    warning_count: 3,
    disqualification_status: true,
    submission_status: 'disqualified',
    violation_summary: { face_not_visible: 4, multiple_faces: 2, looking_away: 7 },
    full_timeline: [
      { type: 'face_not_visible', severity: 'high',   at: '2024-01-15T10:05:30Z', confidence: 0.95 },
      { type: 'looking_away',     severity: 'medium',  at: '2024-01-15T10:08:12Z', confidence: 0.80 },
      { type: 'multiple_faces',   severity: 'critical', at: '2024-01-15T10:12:45Z', confidence: 0.99 },
    ],
    generated_at: '2024-01-15T10:30:00Z',
  };
  const buf2 = buildPdfBuffer(withViolations, 'test-session-violations-002');
  validatePdf(buf2);
  const out2 = path.join(__dirname, 'test-violations.pdf');
  fs.writeFileSync(out2, buf2);
  console.log(`  ✓ Written to ${out2}\n`);

  // Test 3: special characters in names (must not crash)
  console.log('Test 3: Special characters in data (PDF escaping)');
  const special: Record<string, unknown> = {
    student_name: 'O\'Brien (Test) User\\Admin',
    student_email: 'test+user@example.co.uk',
    exam_title: 'Exam (Part 1) & Review',
    risk_score: 25,
    risk_level: 'medium',
    warning_count: 1,
    disqualification_status: false,
    submission_status: 'submitted',
    violation_summary: {},
    full_timeline: [],
    generated_at: new Date().toISOString(),
  };
  const buf3 = buildPdfBuffer(special, 'test-session-special-003');
  validatePdf(buf3);
  const out3 = path.join(__dirname, 'test-special.pdf');
  fs.writeFileSync(out3, buf3);
  console.log(`  ✓ Written to ${out3}\n`);

  console.log('=== All 3 tests PASSED ===\n');
  console.log('Files written:');
  console.log('  scripts/test-clean.pdf');
  console.log('  scripts/test-violations.pdf');
  console.log('  scripts/test-special.pdf');
  console.log('\nOpen them with: open scripts/test-clean.pdf scripts/test-violations.pdf scripts/test-special.pdf\n');
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
