import ExcelJS from 'exceljs';
const BANK_LABELS = {
    theory: 'عام',
    oral: 'الشفهي',
    driving: 'أهلية القيادة',
    personality: 'تقييم الشخصية',
};
function addSheet(workbook, name, rows) {
    const sheet = workbook.addWorksheet(name, { views: [{ rightToLeft: true }] });
    rows.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column, index) => {
        const longest = rows.reduce((n, row) => Math.max(n, String(row[index] ?? '').length), 0);
        column.width = Math.min(55, Math.max(14, longest + 2));
    });
}
export async function exportLeadershipBriefingExcel(data, options = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'منصة الاختبارات';
    workbook.created = new Date();
    const counts = options.simulatedCounts || data.decisions;
    const slate = options.slate || data.people;
    addSheet(workbook, 'مؤشرات الجلسة', [
        ['الفترة', data.period === '30d' ? 'آخر 30 يوماً' : 'كل الفترات'],
        ['تاريخ التوليد', data.generatedAt],
        ['إصدار السياسة', data.policyVersion],
        ['ملاحظة', data.disclaimerAr],
        [],
        ['المؤشر', 'العدد'],
        ['المتقدمون', data.kpis.applicantCount],
        ['مكتمل 4/4', data.kpis.completeFour],
        ['قيد الاستكمال', data.kpis.inProgress],
        ['معلّق تقييم يدوي', data.kpis.pendingManual],
        ['اختبارات نشطة', data.kpis.activeExams],
    ]);
    addSheet(workbook, 'تقدير الجدارة', [
        ['محاكاة العتبات', options.simulating ? 'نعم (عرض فقط)' : 'لا — سياسة المنصة'],
        ['عتبة التأهل', options.thresholds?.qualifiedComposite ?? data.defaultThresholds?.qualifiedComposite ?? ''],
        ['عتبة المشروط', options.thresholds?.conditionalComposite ?? data.defaultThresholds?.conditionalComposite ?? ''],
        ['الحد الأدنى للمسار', options.thresholds?.minPerCategory ?? data.defaultThresholds?.minPerCategory ?? ''],
        [],
        ['الحالة', 'العدد'],
        [data.statusLabels.qualified, counts.qualified],
        [data.statusLabels.conditional, counts.conditional],
        [data.statusLabels.not_qualified, counts.not_qualified],
        [data.statusLabels.incomplete, counts.incomplete],
    ]);
    addSheet(workbook, 'مفاضلة الشاغر', [
        ['م', 'الاسم', 'التقدير', 'المركّبة %', 'المسمى', 'الجهة', 'نواقص', 'الاعتماد'],
        ...slate.map((row, index) => [
            index + 1,
            row.name,
            row.labelAr,
            row.compositePercent ?? '',
            row.jobTitle,
            row.org,
            [...(row.pendingCategories || []), ...(row.missingCategories || [])].join('، '),
            row.adoption?.adoptedLabelAr || 'بدون ختم',
        ]),
    ]);
    addSheet(workbook, 'حسب المسمى', [
        ['المسمى', 'العدد', 'مكتمل', 'نسبة الاكتمال %', 'متوسط المركّبة %'],
        ...data.byJob.map((row) => [
            row.label,
            row.applicantCount,
            row.completeCount,
            row.completionRate,
            row.averageComposite ?? '',
        ]),
    ]);
    addSheet(workbook, 'حسب الجهة', [
        ['الجهة', 'العدد', 'مكتمل', 'نسبة الاكتمال %', 'متوسط المركّبة %'],
        ...data.byOrg.map((row) => [
            row.label,
            row.applicantCount,
            row.completeCount,
            row.completionRate,
            row.averageComposite ?? '',
        ]),
    ]);
    addSheet(workbook, 'جاهزية البنك', [
        ['المسمى', 'الشفهي', 'أهلية القيادة', 'تقييم الشخصية', 'نواقص'],
        ...data.bankShortages.map((row) => [
            row.label,
            row.counts.oral ?? 0,
            row.counts.driving ?? 0,
            row.counts.personality ?? 0,
            row.shortCategories.map((category) => BANK_LABELS[category] || category).join('، '),
        ]),
    ]);
    const bytes = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    const stamp = data.generatedAt.slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `تقرير-القيادة-${stamp}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
